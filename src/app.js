const PAGE = {
  canvasWidth: 1697,
  canvasHeight: 2400,
  pdfWidth: 595.2,
  pdfHeight: 841.68,
};

const STORAGE_KEY = "work-log-pdf-filler:v1";
const FONT_STACK = '"BiauKai", "DFKai-SB", "KaiTi", "KaiTi TC", "STKaiti", "Kaiti TC", "PMingLiU", "MingLiU", serif';

const DEFAULT_VALUES = {
  superior: "無",
  handover: "無",
  morningWork: "- 櫃檯勤務",
  morningArrive: "07:50",
  morningLeave: "12:00",
  afternoonWork: "- 櫃檯勤務",
  afternoonArrive: "13:00",
  afternoonLeave: "16:50",
};

const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];

const fieldGroups = [
  {
    title: "基本資料",
    fields: [
      { id: "name", label: "執勤役男", type: "text", persist: true, required: true, draw: { x: 154, y: 490, w: 392, h: 70, size: 60, align: "center" } },
      { id: "date", label: "日期", type: "date", persist: false, required: true },
      { id: "noonDuty", label: "中午值班", type: "checkbox", persist: false },
    ],
  },
  {
    title: "指示與交接",
    fields: [
      { id: "superior", label: "上級指示", type: "textarea", persist: false, required: true, draw: { x: 595, y: 595, w: 880, h: 84, size: 40, lineHeight: 50 } },
      { id: "handover", label: "交接事項", type: "textarea", persist: false, required: true, draw: { x: 595, y: 728, w: 880, h: 80, size: 40, lineHeight: 50 } },
    ],
  },
  {
    title: "工作內容（上午）",
    fields: [
      { id: "morningWork", label: "上午工作內容", type: "textarea", persist: false, required: true, draw: { x: 168, y: 996, w: 930, h: 280, size: 48, lineHeight: 60 } },
      { id: "morningArrive", label: "上午到勤時間", type: "time", persist: false, required: true, drawTime: { hour: [1215, 942], minute: [1374, 942] } },
      { id: "morningLeave", label: "上午離退時間", type: "time", persist: false, required: true, drawTime: { hour: [1215, 1230], minute: [1374, 1230] } },
    ],
  },
  {
    title: "工作內容（下午）",
    fields: [
      { id: "afternoonWork", label: "下午工作內容", type: "textarea", persist: false, required: true, draw: { x: 168, y: 1512, w: 930, h: 280, size: 48, lineHeight: 60 } },
      { id: "afternoonArrive", label: "下午到勤時間", type: "time", persist: false, required: true, drawTime: { hour: [1215, 1462], minute: [1374, 1462] } },
      { id: "afternoonLeave", label: "下午離退時間", type: "time", persist: false, required: true, drawTime: { hour: [1215, 1758], minute: [1374, 1758] } },
    ],
  },
  {
    title: "早退理由",
    fields: [
      { id: "earlyLeaveReason", label: "早退理由", type: "textarea", persist: false, large: true, draw: { x: 1020, y: 1628, w: 455, h: 126, size: 30, lineHeight: 38, align: "right" } },
    ],
  },
];

const allFields = fieldGroups.flatMap((group) => group.fields);
const requiredFields = allFields.filter((field) => field.required);

const form = document.querySelector("#logForm");
const canvas = document.querySelector("#previewCanvas");
const context = canvas.getContext("2d");
const statusText = document.querySelector("#statusText");
const downloadButton = document.querySelector("#downloadPdf");
const printButton = document.querySelector("#printPdf");

const templateImage = new Image();
const state = loadState();
let renderRequested = false;

applyDefaultValues();
buildForm();
setDateDefault();

templateImage.onload = () => {
  renderPreview();
  statusText.textContent = "預覽已更新";
};
templateImage.src = "./assets/template.png";

form.addEventListener("input", (event) => {
  const target = event.target;
  if (!target.name) return;
  state[target.name] = target.type === "checkbox" ? target.checked : target.value;
  savePersistentState();
  requestPreview();
});

downloadButton.addEventListener("click", async () => {
  if (!validateBeforeOutput()) return;

  setPdfButtonsDisabled(true);
  statusText.textContent = "正在產生 PDF";

  try {
    const blob = await createPdfBlob();
    downloadPdfBlob(blob);
    statusText.textContent = "PDF 已產生";
  } catch (error) {
    console.error(error);
    statusText.textContent = "PDF 產生失敗";
  } finally {
    setPdfButtonsDisabled(false);
  }
});

printButton.addEventListener("click", async () => {
  if (!validateBeforeOutput()) return;

  setPdfButtonsDisabled(true);
  statusText.textContent = "正在準備列印";

  try {
    const blob = await createPdfBlob();
    await printPdfBlob(blob);
    statusText.textContent = "列印視窗已開啟";
  } catch (error) {
    console.error(error);
    statusText.textContent = "列印 PDF 失敗";
  } finally {
    setPdfButtonsDisabled(false);
  }
});

function buildForm() {
  form.innerHTML = "";

  for (const group of fieldGroups) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "field-group";

    const legend = document.createElement("legend");
    legend.textContent = group.title;
    fieldset.append(legend);

    const row = document.createElement("div");
    row.className = "field-row";

    for (const field of group.fields) {
      const wrapper = document.createElement("div");
      wrapper.className = "field";

      const label = document.createElement("label");
      label.htmlFor = field.id;
      label.textContent = field.label;

      const input = createInput(field);
      if (field.required) {
        input.required = true;
      }
      wrapper.append(label, input);

      if (field.type === "text" || field.type === "date" || field.type === "time" || field.type === "checkbox") {
        row.append(wrapper);
      } else {
        fieldset.append(wrapper);
      }
    }

    if (row.childElementCount > 0) {
      fieldset.append(row);
    }

    form.append(fieldset);
  }
}

function createInput(field) {
  const value = state[field.id] ?? "";
  if (field.type === "checkbox") {
    const input = document.createElement("input");
    input.id = field.id;
    input.name = field.id;
    input.type = "checkbox";
    input.checked = Boolean(value);
    return input;
  }

  if (field.type === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.id = field.id;
    textarea.name = field.id;
    textarea.value = value;
    if (field.large) {
      textarea.className = "textarea-large";
    }
    return textarea;
  }

  const input = document.createElement("input");
  input.id = field.id;
  input.name = field.id;
  input.type = field.type === "time" ? "text" : field.type;
  input.value = value;
  if (field.type === "time") {
    input.inputMode = "numeric";
    input.pattern = "[0-2][0-9]:[0-5][0-9]";
    input.placeholder = "HH:MM";
  }
  return input;
}

function validateBeforeOutput() {
  const missingLabels = [];

  for (const field of requiredFields) {
    if (!normalize(state[field.id])) {
      missingLabels.push(field.label);
    }
  }

  if (isEarlyAfternoonLeave() && !normalize(state.earlyLeaveReason)) {
    missingLabels.push("早退理由");
  }

  if (missingLabels.length === 0) {
    return true;
  }

  const message = `請填寫必填欄位：${missingLabels.join("、")}`;
  statusText.textContent = message;
  window.alert(message);

  const firstMissingField = allFields.find((field) => missingLabels.includes(field.label));
  if (firstMissingField) {
    form.elements[firstMissingField.id]?.focus();
  } else if (missingLabels.includes("早退理由")) {
    form.elements.earlyLeaveReason?.focus();
  }

  return false;
}

function isEarlyAfternoonLeave() {
  const leaveMinutes = parseTimeToMinutes(state.afternoonLeave);
  return leaveMinutes !== null && leaveMinutes < 16 * 60 + 50;
}

function parseTimeToMinutes(value) {
  const match = normalize(value).match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function requestPreview() {
  if (renderRequested) return;
  renderRequested = true;
  requestAnimationFrame(() => {
    renderRequested = false;
    renderPreview();
    statusText.textContent = "預覽已更新";
  });
}

function renderPreview() {
  if (!templateImage.complete) return;

  context.clearRect(0, 0, PAGE.canvasWidth, PAGE.canvasHeight);
  context.drawImage(templateImage, 0, 0, PAGE.canvasWidth, PAGE.canvasHeight);
  context.fillStyle = "#151515";
  context.textBaseline = "middle";

  drawDate();

  for (const field of allFields) {
    if (field.type === "checkbox") continue;

    const value = normalize(state[field.id]);
    if (!value || field.id === "date") continue;

    if (field.draw) {
      drawTextBox(value, field.draw);
    }

    if (field.drawTime) {
      drawTime(getTimeDrawValue(field.id, value), field.drawTime);
    }
  }
}

function drawDate() {
  const dateValue = state.date;
  if (!dateValue) return;

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return;

  const rocYear = String(date.getFullYear() - 1911);
  const month = String(date.getMonth() + 1);
  const day = String(date.getDate());
  const weekday = weekdayNames[date.getDay()];

  drawTextBox(rocYear, { x: 750, y: 510, w: 118, h: 48, size: 40, align: "center" });
  drawTextBox(month, { x: 924, y: 510, w: 58, h: 48, size: 40, align: "center" });
  drawTextBox(day, { x: 1055, y: 510, w: 58, h: 48, size: 40, align: "center" });
  drawTextBox(weekday, { x: 1240, y: 510, w: 70, h: 48, size: 40, align: "center" });
}

function drawTime(value, position) {
  const [hour = "", minute = ""] = value.split(":");
  drawTextBox(hour, { x: position.hour[0], y: position.hour[1], w: 58, h: 48, size: 32, align: "center" });
  drawTextBox(minute, { x: position.minute[0], y: position.minute[1], w: 58, h: 48, size: 32, align: "center" });
}

function getTimeDrawValue(fieldId, value) {
  if (state.noonDuty && (fieldId === "morningLeave" || fieldId === "afternoonArrive")) {
    return "值:班";
  }
  return value;
}

function drawTextBox(text, options) {
  const {
    x,
    y,
    w,
    h,
    size = 32,
    lineHeight = size * 1.35,
    align = "left",
  } = options;

  const lines = wrapText(text, w, size);
  const maxLines = Math.max(1, Math.floor(h / lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  const startY = visibleLines.length === 1 ? y + h / 2 : y + lineHeight / 2;

  context.font = `${size}px ${FONT_STACK}`;
  context.textAlign = align;

  const drawX = align === "center" ? x + w / 2 : align === "right" ? x + w : x;

  visibleLines.forEach((line, index) => {
    context.fillText(line, drawX, startY + index * lineHeight);
  });
}

function wrapText(text, maxWidth, size) {
  context.font = `${size}px ${FONT_STACK}`;
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const lines = [];

  for (const rawLine of rawLines) {
    let current = "";
    for (const char of rawLine) {
      const next = current + char;
      if (context.measureText(next).width <= maxWidth || current.length === 0) {
        current = next;
      } else {
        lines.push(current);
        current = char;
      }
    }
    lines.push(current);
  }

  return lines;
}

function applyDefaultValues() {
  for (const [id, value] of Object.entries(DEFAULT_VALUES)) {
    if (!state[id]) {
      state[id] = value;
    }
  }
}

function setDateDefault() {
  if (!state.date) {
    const now = new Date();
    state.date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");

    const input = form.elements.date;
    if (input) input.value = state.date;
  }
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { name: stored.name || "" };
  } catch {
    return {};
  }
}

function savePersistentState() {
  const persistent = {};
  for (const field of allFields) {
    if (field.persist) {
      persistent[field.id] = state[field.id] ?? "";
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistent));
}

function normalize(value) {
  return String(value ?? "").trim();
}

function buildFileName() {
  const date = state.date || "未填日期";
  const name = normalize(state.name);
  const suffix = name ? `_${name}` : "";
  return `工作日誌_${date}${suffix}.pdf`;
}

async function createPdfBlob() {
  renderPreview();
  const pngBytes = await canvasToPngBytes(canvas);
  const pdfDoc = await PDFLib.PDFDocument.create();
  const page = pdfDoc.addPage([PAGE.pdfWidth, PAGE.pdfHeight]);
  const image = await pdfDoc.embedPng(pngBytes);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: PAGE.pdfWidth,
    height: PAGE.pdfHeight,
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: "application/pdf" });
}

function downloadPdfBlob(blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildFileName();
  anchor.click();
  URL.revokeObjectURL(url);
}

function printPdfBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const frame = document.createElement("iframe");
    let settled = false;
    let cleanupTimer;

    const cleanup = () => {
      window.clearTimeout(cleanupTimer);
      cleanupTimer = window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 1000);
    };

    frame.className = "print-frame";
    frame.title = "列印工作日誌 PDF";
    frame.onload = () => {
      try {
        const frameWindow = frame.contentWindow;
        if (!frameWindow) {
          throw new Error("Print frame is unavailable");
        }
        frameWindow.addEventListener("afterprint", cleanup, { once: true });
        cleanupTimer = window.setTimeout(cleanup, 60000);
        frameWindow.focus();
        setTimeout(() => {
          frameWindow.print();
          if (!settled) {
            settled = true;
            resolve();
          }
        }, 100);
      } catch (error) {
        if (!settled) {
          settled = true;
          cleanup();
          reject(error);
        }
      }
    };
    frame.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Print frame failed to load"));
    };

    frame.src = url;
    document.body.append(frame);
  });
}

function setPdfButtonsDisabled(disabled) {
  downloadButton.disabled = disabled;
  printButton.disabled = disabled;
}

function canvasToPngBytes(sourceCanvas) {
  return new Promise((resolve, reject) => {
    sourceCanvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Canvas export failed"));
        return;
      }
      resolve(await blob.arrayBuffer());
    }, "image/png");
  });
}

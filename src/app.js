const PAGE = {
  canvasWidth: 1697,
  canvasHeight: 2400,
  pdfWidth: 595.2,
  pdfHeight: 841.68,
};

const STORAGE_KEY = "work-log-pdf-filler:v1";

const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];

const fieldGroups = [
  {
    title: "基本資料",
    fields: [
      { id: "name", label: "執勤役男", type: "text", persist: true, draw: { x: 154, y: 480, w: 392, h: 70, size: 38, align: "center" } },
      { id: "date", label: "日期", type: "date", persist: false },
    ],
  },
  {
    title: "指示與交接",
    fields: [
      { id: "superior", label: "上級指示", type: "textarea", persist: false, draw: { x: 595, y: 595, w: 880, h: 84, size: 34, lineHeight: 45 } },
      { id: "handover", label: "交接事項", type: "textarea", persist: false, draw: { x: 595, y: 728, w: 880, h: 80, size: 34, lineHeight: 45 } },
    ],
  },
  {
    title: "工作內容（上午）",
    fields: [
      { id: "morningWork", label: "上午工作內容", type: "textarea", persist: false, draw: { x: 168, y: 996, w: 930, h: 280, size: 32, lineHeight: 43 } },
      { id: "morningArrive", label: "上午到勤時間", type: "time", persist: true, drawTime: { hour: [1215, 953], minute: [1374, 953] } },
      { id: "morningLeave", label: "上午離退時間", type: "time", persist: true, drawTime: { hour: [1215, 1238], minute: [1374, 1238] } },
    ],
  },
  {
    title: "工作內容（下午）",
    fields: [
      { id: "afternoonWork", label: "下午工作內容", type: "textarea", persist: false, draw: { x: 168, y: 1512, w: 930, h: 280, size: 32, lineHeight: 43 } },
      { id: "afternoonArrive", label: "下午到勤時間", type: "time", persist: true, drawTime: { hour: [1215, 1474], minute: [1374, 1474] } },
      { id: "afternoonLeave", label: "下午離退時間", type: "time", persist: true, drawTime: { hour: [1215, 1774], minute: [1374, 1774] } },
    ],
  },
  {
    title: "依序批示",
    fields: [
      { id: "manager", label: "管理人員", type: "text", persist: true, draw: { x: 165, y: 2000, w: 360, h: 76, size: 36, align: "center" } },
      { id: "headNurse", label: "護理長", type: "text", persist: true, draw: { x: 600, y: 2000, w: 410, h: 76, size: 36, align: "center" } },
      { id: "supervisor", label: "單位主管", type: "text", persist: true, draw: { x: 1080, y: 2000, w: 380, h: 76, size: 36, align: "center" } },
    ],
  },
];

const allFields = fieldGroups.flatMap((group) => group.fields);
const dailyFieldIds = new Set(allFields.filter((field) => !field.persist).map((field) => field.id));

const form = document.querySelector("#logForm");
const canvas = document.querySelector("#previewCanvas");
const context = canvas.getContext("2d");
const statusText = document.querySelector("#statusText");
const downloadButton = document.querySelector("#downloadPdf");
const clearDailyButton = document.querySelector("#clearDaily");

const templateImage = new Image();
const state = loadState();
let renderRequested = false;

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
  state[target.name] = target.value;
  savePersistentState();
  requestPreview();
});

downloadButton.addEventListener("click", async () => {
  downloadButton.disabled = true;
  statusText.textContent = "正在產生 PDF";

  try {
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
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildFileName();
    anchor.click();
    URL.revokeObjectURL(url);
    statusText.textContent = "PDF 已產生";
  } catch (error) {
    console.error(error);
    statusText.textContent = "PDF 產生失敗";
  } finally {
    downloadButton.disabled = false;
  }
});

clearDailyButton.addEventListener("click", () => {
  for (const id of dailyFieldIds) {
    state[id] = "";
    const input = form.elements[id];
    if (input) input.value = "";
  }
  setDateDefault();
  requestPreview();
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
      wrapper.append(label, input);

      if (field.type === "text" || field.type === "date" || field.type === "time") {
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
  if (field.type === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.id = field.id;
    textarea.name = field.id;
    textarea.value = value;
    return textarea;
  }

  const input = document.createElement("input");
  input.id = field.id;
  input.name = field.id;
  input.type = field.type;
  input.value = value;
  return input;
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
    const value = normalize(state[field.id]);
    if (!value || field.id === "date") continue;

    if (field.draw) {
      drawTextBox(value, field.draw);
    }

    if (field.drawTime) {
      drawTime(value, field.drawTime);
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
  const weekday = weekdayNames[date.getDay()];

  drawTextBox(rocYear, { x: 750, y: 516, w: 118, h: 48, size: 34, align: "center" });
  drawTextBox(month, { x: 960, y: 516, w: 58, h: 48, size: 34, align: "center" });
  drawTextBox(weekday, { x: 1284, y: 516, w: 70, h: 48, size: 34, align: "center" });
}

function drawTime(value, position) {
  const [hour = "", minute = ""] = value.split(":");
  drawTextBox(hour, { x: position.hour[0], y: position.hour[1], w: 58, h: 48, size: 32, align: "center" });
  drawTextBox(minute, { x: position.minute[0], y: position.minute[1], w: 58, h: 48, size: 32, align: "center" });
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

  context.font = `${size}px "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
  context.textAlign = align;

  const drawX = align === "center" ? x + w / 2 : align === "right" ? x + w : x;

  visibleLines.forEach((line, index) => {
    context.fillText(line, drawX, startY + index * lineHeight);
  });
}

function wrapText(text, maxWidth, size) {
  context.font = `${size}px "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
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
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
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

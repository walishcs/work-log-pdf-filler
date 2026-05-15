# 工作日誌 PDF 填寫工具

純前端工作日誌填寫工具。使用者在瀏覽器填欄位，預覽確認後下載或列印壓平 PDF。

## 使用方式

直接開啟 `index.html`，或把整個資料夾部署到 GitHub Pages。

## 隱私

填寫內容只在瀏覽器內處理，不會送到伺服器。常用欄位會存在瀏覽器 `localStorage`。

## 檔案

- `assets/template.png`: 高解析 PDF 背景
- `assets/template.pdf`: 原始空白 PDF
- `assets/pdf-lib.min.js`: PDF 產生用的前端函式庫
- `src/app.js`: 欄位座標、預覽與下載邏輯

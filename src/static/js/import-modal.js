/**
 * 批量导入模块 — 文本/图片/JSON解析与导入
 */
import { holdings, pendingImport, uploadedImageBase64, $importModal, $btnImport, $modalClose, $importText, $btnParseText, $btnParseImage, $imageInput, $previewImage, $importResults, $importList, $btnConfirmImport, $uploadZone, setPendingImport, setUploadedImageBase64, saveHoldings } from './state.js';
import { fmtPlain, showToast } from './utils.js';
import { fetchAllFundData } from './fund-card.js';

function openImportModal() { $importModal.classList.add("show"); $importResults.classList.add("hidden"); $previewImage.classList.add("hidden"); setUploadedImageBase64(null); }
function closeImportModal() { $importModal.classList.remove("show"); }

function showImportResults(items) {
    setPendingImport(items);
    $importResults.classList.remove("hidden");
    $importList.innerHTML = items.map(item => `<div class="import-item"><div class="import-item-left"><span class="import-item-name">${item.name || "未知基金"}</span><span class="import-item-code">${item.code}</span></div><span class="import-item-val">¥${fmtPlain(item.value)}</span></div>`).join("");
}

async function parseText() {
    const text = $importText.value.trim();
    if (!text) { showToast("请粘贴持仓数据"); return; }
    $btnParseText.disabled = true; $btnParseText.textContent = "解析中...";
    try { const r = await fetch("/api/import/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }); const data = await r.json(); if (data.error) { showToast(data.error); return; } if (!data.length) { showToast("未识别到基金数据"); return; } showImportResults(data); showToast(`识别到 ${data.length} 只基金`); } catch (e) { showToast("解析失败"); } finally { $btnParseText.disabled = false; $btnParseText.textContent = "解析文本"; }
}

async function parseImage() {
    if (!uploadedImageBase64) { showToast("请先上传图片"); return; }
    $btnParseImage.disabled = true; $btnParseImage.textContent = "识别中...";
    try { const r = await fetch("/api/import/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: uploadedImageBase64 }) }); const data = await r.json(); if (data.error) { showToast(data.error); return; } if (!data.length) { showToast("未识别到基金数据"); return; } showImportResults(data); showToast(`识别到 ${data.length} 只基金`); } catch (e) { showToast("识别失败"); } finally { $btnParseImage.disabled = false; $btnParseImage.textContent = "识别图片"; }
}

function confirmImport() {
    let added = 0;
    pendingImport.forEach(item => { if (!holdings.some(h => h.code === item.code)) { holdings.push({ code: item.code, value: item.value || 0, profit: item.profit || 0 }); added++; } });
    saveHoldings(); fetchAllFundData(); closeImportModal(); showToast(`成功导入 ${added} 只基金`);
}

function handleImageUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const base64 = e.target.result;
        setUploadedImageBase64(base64);
        $previewImage.src = base64;
        $previewImage.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
}

export function initImportModal() {
    $btnImport.addEventListener("click", openImportModal);
    $modalClose.addEventListener("click", closeImportModal);
    $importModal.addEventListener("click", function (e) { if (e.target === $importModal) closeImportModal(); });
    $btnParseText.addEventListener("click", parseText);
    $btnParseImage.addEventListener("click", parseImage);
    $btnConfirmImport.addEventListener("click", confirmImport);
    $imageInput.addEventListener("change", function () { if (this.files[0]) handleImageUpload(this.files[0]); });
    if ($uploadZone) { $uploadZone.addEventListener("dragover", function (e) { e.preventDefault(); this.style.borderColor = "var(--primary)"; }); $uploadZone.addEventListener("dragleave", function () { this.style.borderColor = ""; }); $uploadZone.addEventListener("drop", function (e) { e.preventDefault(); this.style.borderColor = ""; if (e.dataTransfer.files[0]) handleImageUpload(e.dataTransfer.files[0]); }); }
    document.querySelectorAll(".modal-tabs .mtab").forEach(tab => { tab.addEventListener("click", function () { document.querySelectorAll(".modal-tabs .mtab").forEach(t => t.classList.remove("active")); this.classList.add("active"); document.querySelectorAll(".tab-pane").forEach(c => c.classList.add("hidden")); document.getElementById(this.dataset.tab).classList.remove("hidden"); }); });
}

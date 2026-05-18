/**
 * 价格提醒模块 — CRUD + 定时检查
 */
import { holdings, alertList, $alertCode, $alertCondition, $alertThreshold, $btnAddAlert, $alertListEl, setAlertList } from './state.js';
import { fmtMoney, showToast } from './utils.js';

async function fetchFundData(code) {
    try { const r = await fetch(`/api/fund/${code}`); if (!r.ok) { const e = await r.json(); throw new Error(e.error); } return await r.json(); }
    catch (e) { console.error(`Fetch ${code}:`, e); return null; }
}

export async function fetchAlerts() { try { const r = await fetch("/api/alerts"); setAlertList(await r.json()); renderAlerts(); } catch (e) { console.error("Alerts:", e); } }

function renderAlerts() {
    if (!$alertListEl) return;
    if (!alertList.length) { $alertListEl.innerHTML = '<div class="alert-empty">暂无提醒</div>'; return; }
    $alertListEl.innerHTML = alertList.map(a => {
        const condText = a.condition === "above" ? "≥" : "≤";
        return `<div class="alert-item${a.triggered ? " triggered" : ""}" data-id="${a.id}"><div class="alert-item-left"><span class="alert-item-name">${a.name || a.code}</span><span class="alert-item-rule">${a.condition === "above" ? "涨幅" : "跌幅"} ${condText} ${a.threshold}%${a.triggered ? " - 已触发!" : ""}</span></div><button class="btn-danger" data-alert-id="${a.id}">&times;</button></div>`;
    }).join("");
    $alertListEl.querySelectorAll(".btn-danger").forEach(btn => { btn.addEventListener("click", async function () { const id = this.dataset.alertId; try { await fetch(`/api/alerts/${id}`, { method: "DELETE" }); setAlertList(alertList.filter(a => a.id != id)); renderAlerts(); showToast("提醒已删除"); } catch (e) { showToast("删除失败"); } }); });
}

export async function checkAlerts() { try { const r = await fetch("/api/alerts/check"); const data = await r.json(); if (data.triggered && data.triggered.length) { data.triggered.forEach(a => showToast(`提醒触发：${a.name || a.code} ${fmtMoney(a.trigger_value)}%`)); fetchAlerts(); } } catch (e) { /* */ } }

export function initAlerts() {
    $btnAddAlert.addEventListener("click", async function () {
        const code = $alertCode.value.trim(), condition = $alertCondition.value, threshold = $alertThreshold.value.trim();
        if (!code || !/^\d{6}$/.test(code)) { showToast("请输入6位基金代码"); return; }
        if (!threshold) { showToast("请输入阈值百分比"); return; }
        const fd = await fetchFundData(code), name = fd ? fd.name : code;
        try { const r = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name, condition, threshold: +threshold }) }); const alert = await r.json(); if (alert.error) { showToast(alert.error); return; } alertList.push(alert); setAlertList(alertList); renderAlerts(); $alertCode.value = ""; $alertThreshold.value = ""; showToast(`已添加提醒：${name}`); } catch (e) { showToast("添加失败"); }
    });
}

/**
 * 基金卡片模块 — 持仓列表渲染、信号仪表盘、标签页、详情弹窗
 */
import {
    holdings, fundDataCache, signalCache, chartInstances, $fundList, $emptyState,
    $totalAssets, $totalProfit, $todayEarnings, $fundCount, $profitRate, $updateTime,
    $fundDetailModal, $fundDetailTitle, $fundDetailBody, $fundDetailClose,
    saveHoldings, deleteFundCache, setHoldings, setDetailChartInstance, getDetailChartInstance
} from './state.js';
import { fmtMoney, fmtPlain, colorCls, fmtTime, showToast } from './utils.js';
import { renderChart, renderDetailChart } from './chart-config.js';

// ===== 数据获取 =====
export async function fetchFundData(code) {
    try { const r = await fetch(`/api/fund/${code}`); if (!r.ok) { const e = await r.json(); throw new Error(e.error); } return await r.json(); }
    catch (e) { console.error(`Fetch ${code}:`, e); return null; }
}

export async function fetchAllFundData() {
    if (!holdings.length) { renderEmpty(); return; }
    try {
        const r = await fetch("/api/fund/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codes: holdings.map(h => h.code) }) });
        const data = await r.json();
        data.forEach(f => { if (f && !f.error) fundDataCache[f.code] = f; });
    } catch (e) { console.error("Batch:", e); }
    renderFundList(); renderSummary();
    if ($updateTime) $updateTime.textContent = fmtTime(new Date()) + " 更新";
}

export async function fetchAllSignals() {
    for (const h of holdings) {
        if (signalCache[h.code]) continue;
        try { const r = await fetch(`/api/fund/signal/${h.code}`); const data = await r.json(); if (!data.error) signalCache[h.code] = data; } catch (e) { console.error(`Signal ${h.code}:`, e); }
    }
}

// ===== 收益计算 =====
function calc(h, fd) {
    const hv = +h.value || 0, hp = +h.profit || 0, pct = +(fd?.estimated_change_pct) || 0;
    const today = hv * pct / 100;
    return { cost: hv - hp, today, totalProfit: hp + today, totalValue: hv + today, changePct: pct };
}

// ===== 空状态 =====
export function renderEmpty() {
    if ($emptyState) $emptyState.style.display = "";
    if ($totalAssets) $totalAssets.textContent = "--";
    if ($totalProfit) { $totalProfit.textContent = "--"; $totalProfit.className = "asset-item-value"; }
    if ($todayEarnings) { $todayEarnings.textContent = "--"; $todayEarnings.className = "asset-item-value"; }
    if ($fundCount) $fundCount.textContent = "0";
    if ($profitRate) { $profitRate.textContent = "--"; $profitRate.className = "asset-item-value"; }
    $fundList.querySelectorAll(".fund-card").forEach(el => el.remove());
    Object.keys(chartInstances).forEach(k => { if (chartInstances[k]) chartInstances[k].destroy(); delete chartInstances[k]; });
}

// ===== 基金列表渲染 =====
export function renderFundList() {
    $fundList.querySelectorAll(".fund-card").forEach(el => el.remove());
    if (!holdings.length) { renderEmpty(); return; }
    if ($emptyState) $emptyState.style.display = "none";

    holdings.forEach(h => {
        const fd = fundDataCache[h.code], c = calc(h, fd), dir = colorCls(c.changePct), earnDir = colorCls(c.today), sig = signalCache[h.code];
        const card = document.createElement("div");
        card.className = "fund-card"; card.dataset.code = h.code;

        let signalHTML = "";
        if (sig && !sig.error) {
            const sLabel = sig.signal_en === "strong_buy" || sig.signal_en === "buy" ? "buy" : sig.signal_en === "strong_sell" || sig.signal_en === "sell" ? "sell" : "hold";
            const gaugeColor = sLabel === "buy" ? "#e74c3c" : sLabel === "sell" ? "#27ae60" : "#999";
            let factorsHTML = "";
            if (sig.factors && sig.factors.length) {
                factorsHTML = '<div class="factor-list">';
                sig.factors.forEach(f => {
                    const fDir = f.score >= 55 ? "up" : f.score <= 45 ? "down" : "flat";
                    factorsHTML += `<div class="factor-row"><span class="factor-name">${f.name}</span><div class="factor-bar-bg"><div class="factor-bar-fill ${fDir}" style="width:${Math.max(5, Math.min(100, f.score))}%"></div></div><span class="factor-score ${fDir}">${f.score}</span><span class="factor-detail">${f.detail || ""}</span></div>`;
                });
                factorsHTML += "</div>";
            }
            signalHTML = `
            <div class="card-signal" data-code="${h.code}">
                <div class="signal-gauge-wrap"><canvas id="gauge-${h.code}" width="36" height="36"></canvas><div class="signal-center"><span class="signal-score-num" style="color:${gaugeColor}">${sig.buy_score}</span></div></div>
                <div class="signal-main"><div class="signal-label ${sLabel}">${sig.signal}</div><div class="signal-sub">买${sig.buy_score} / 卖${sig.sell_score}</div></div>
                <span class="signal-arrow">▼</span>
            </div>
            <div class="signal-detail" id="signalDetail-${h.code}">
                <div class="signal-summary">${sig.summary}</div>
                <div class="signal-meter"><span class="meter-label" style="color:var(--down)">买</span><div class="meter-bar-bg"><div class="meter-indicator" style="left:${sig.buy_score}%"></div></div><span class="meter-label" style="color:var(--up)">卖</span></div>
                ${factorsHTML}
            </div>`;
        }

        card.innerHTML = `
            <div class="card-top">
                <div class="card-info">
                    <div class="card-head"><div><div class="card-title">${fd ? fd.name : h.code}</div><div class="card-code">${h.code}${fd ? " · " + fd.estimation_time : ""}</div></div><button class="card-delete" data-code="${h.code}">&times;</button></div>
                    <div class="card-data">
                        <div class="card-data-col"><div class="card-data-item"><span class="card-data-label">持有</span><span class="card-data-value">${fmtPlain(h.value)}</span></div><div class="card-data-item"><span class="card-data-label">收益</span><span class="card-data-value ${colorCls(h.profit)}">${fmtMoney(h.profit)}</span></div></div>
                        <div class="card-data-sep"></div>
                        <div class="card-data-col">${fd ? `<div class="card-data-item"><span class="card-data-label">净值</span><span class="card-data-value">${fd.nav}</span></div><div class="card-data-item"><span class="card-data-label">估值</span><span class="card-data-value ${dir}">${fd.estimated_nav} (${fmtMoney(c.changePct)}%)</span></div>` : '<div class="card-data-item"><span class="card-data-label" style="color:#e74c3c">暂无估值</span></div>'}</div>
                    </div>
                </div>
                <div class="card-earnings ${earnDir}"><div class="earn-label">今日预估</div><div class="earn-amount ${earnDir}">${fmtMoney(c.today)}</div></div>
            </div>
            ${signalHTML}
            <div class="card-tabs"><button class="card-tab" data-type="holdings" data-code="${h.code}">重仓股</button><button class="card-tab" data-type="performance" data-code="${h.code}">走势</button></div>
            <div class="card-panel" id="panel-${h.code}"><div class="panel-body"></div></div>`;
        $fundList.appendChild(card);
        if (sig && !sig.error) requestAnimationFrame(() => drawGauge(h.code, sig.buy_score));
    });
    bindCardEvents();
}

// ===== 半圆仪表盘 =====
function drawGauge(code, score) {
    const canvas = document.getElementById(`gauge-${code}`);
    if (!canvas) return;
    const ctx = canvas.getContext("2d"), cx = 18, cy = 20, r = 14, lw = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0, false); ctx.strokeStyle = "#eee"; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.stroke();
    const angle = Math.PI + (score / 100) * Math.PI;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, angle, false);
    ctx.strokeStyle = score >= 60 ? "#e74c3c" : score <= 40 ? "#27ae60" : "#999";
    ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.stroke();
}

// ===== 卡片事件绑定 =====
function bindCardEvents() {
    $fundList.querySelectorAll(".card-delete").forEach(btn => {
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            const code = this.dataset.code;
            setHoldings(holdings.filter(h => h.code !== code));
            deleteFundCache(code);
            saveHoldings(); renderFundList(); renderSummary(); showToast("已删除");
        });
    });
    $fundList.querySelectorAll(".fund-card").forEach(card => {
        const code = card.dataset.code;
        const cardTop = card.querySelector(".card-top");
        if (cardTop) { cardTop.addEventListener("click", function (e) { if (e.target.closest(".card-delete")) return; openFundDetailModal(code); }); }
        const s = card.querySelector(".card-signal");
        if (!s) return;
        s.addEventListener("click", function (e) {
            e.stopPropagation();
            const d = document.getElementById(`signalDetail-${code}`);
            const a = this.querySelector(".signal-arrow");
            if (d) d.classList.toggle("show");
            if (a) a.classList.toggle("open");
        });
    });
    $fundList.querySelectorAll(".card-tab").forEach(btn => {
        btn.addEventListener("click", function () {
            const type = this.dataset.type, code = this.dataset.code, panel = document.getElementById(`panel-${code}`), isActive = this.classList.contains("active");
            this.closest(".fund-card").querySelectorAll(".card-tab").forEach(b => b.classList.remove("active"));
            if (panel) { panel.classList.remove("show"); panel.querySelector(".panel-body").innerHTML = ""; }
            if (!isActive) {
                this.classList.add("active");
                if (panel) {
                    panel.classList.add("show");
                    const body = panel.querySelector(".panel-body");
                    if (type === "holdings") loadHoldingsPanel(code, body);
                    else if (type === "performance") loadPerformancePanel(code, body);
                }
            }
        });
    });
}

// ===== 汇总渲染 =====
export function renderSummary() {
    if (!holdings.length) { renderEmpty(); return; }
    let tv = 0, tp = 0, te = 0, tc = 0;
    holdings.forEach(h => { const c = calc(h, fundDataCache[h.code]); tv += c.totalValue; tp += c.totalProfit; te += c.today; tc += c.cost; });
    if ($totalAssets) $totalAssets.textContent = fmtPlain(tv);
    if ($totalProfit) { $totalProfit.textContent = fmtMoney(tp); $totalProfit.className = "asset-item-value " + colorCls(tp); }
    if ($todayEarnings) { $todayEarnings.textContent = fmtMoney(te); $todayEarnings.className = "asset-item-value " + colorCls(te); }
    if ($fundCount) $fundCount.textContent = holdings.length;
    if ($profitRate) { const rate = tc > 0 ? (tp / tc * 100) : 0; $profitRate.textContent = fmtMoney(rate) + "%"; $profitRate.className = "asset-item-value " + colorCls(rate); }
}

// ===== 标签页面板 =====
async function loadHoldingsPanel(code, container) {
    container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载中...</div>';
    try { const r = await fetch(`/api/fund/holdings/${code}`); const data = await r.json(); if (!data.holdings || !data.holdings.length) { container.innerHTML = '<div class="panel-loading" style="color:#999">暂无数据</div>'; return; } let html = ""; data.holdings.forEach(s => { const chg = s.change_pct != null ? s.change_pct : null; const cls = chg != null ? colorCls(chg) : "flat"; html += `<div class="stock-row"><div class="stock-left"><span class="stock-name">${s.name}</span><span class="stock-code">${s.code}</span></div><span class="stock-pct">${s.pct}%</span><span class="stock-change ${cls}">${chg != null ? fmtMoney(chg) + "%" : "--"}</span></div>`; }); container.innerHTML = html; }
    catch (e) { container.innerHTML = '<div class="panel-loading" style="color:#e74c3c">加载失败</div>'; }
}

async function loadPerformancePanel(code, container) {
    container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载中...</div>';
    try {
        const r = await fetch(`/api/fund/performance/${code}`); const data = await r.json();
        let html = '<div class="perf-header"><div class="perf-returns">';
        if (data.returns) { const labels = { "1m": "近1月", "3m": "近3月", "6m": "近6月", "1y": "近1年" }; for (const [k, lbl] of Object.entries(labels)) { if (data.returns[k] != null) { html += `<span class="perf-badge ${colorCls(data.returns[k])}">${lbl} ${fmtMoney(data.returns[k])}%</span>`; } } }
        html += `</div><div class="period-btns"><button class="period-btn" data-period="7d">7天</button><button class="period-btn" data-period="15d">15天</button><button class="period-btn" data-period="3m">3月</button><button class="period-btn active" data-period="6m">6月</button><button class="period-btn" data-period="1y">1年</button><button class="period-btn" data-period="2y">2年</button><button class="period-btn" data-period="ytd">今年</button><button class="period-btn" data-period="all">成立以来</button></div></div>`;
        html += `<div class="chart-wrap"><canvas id="chart-${code}"></canvas></div>`;
        container.innerHTML = html;
        renderChart(code, data.trend, "6m");
        container.querySelectorAll(".period-btn").forEach(btn => { btn.addEventListener("click", function () { container.querySelectorAll(".period-btn").forEach(b => b.classList.remove("active")); this.classList.add("active"); renderChart(code, data.trend, this.dataset.period); }); });
    } catch (e) { container.innerHTML = '<div class="panel-loading" style="color:#e74c3c">加载失败</div>'; }
}

// ===== 基金详情弹窗 =====
export async function openFundDetailModal(code) {
    if (!$fundDetailModal) return;
    const fd = fundDataCache[code];
    const sig = signalCache[code];
    const h = holdings.find(h => h.code === code);
    const c = h && fd ? calc(h, fd) : null;
    const name = fd ? fd.name : code;

    $fundDetailTitle.textContent = name + " 详情";
    $fundDetailBody.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载详细数据...</div>';
    $fundDetailModal.classList.add("show");

    let perfData = null, holdingsData = null;
    try {
        const [perfResp, holdResp] = await Promise.all([
            fetch(`/api/fund/performance/${code}`),
            fetch(`/api/fund/holdings/${code}`)
        ]);
        perfData = await perfResp.json();
        holdingsData = await holdResp.json();
    } catch (e) { console.error("Detail fetch:", e); }

    let html = '<div class="detail-header">';
    html += `<div class="detail-header-left">`;
    html += `<div class="detail-name">${name}</div>`;
    html += `<div class="detail-code">${code}${fd ? " · " + fd.estimation_time : ""}</div>`;
    html += `</div><div class="detail-header-right">`;
    if (fd) {
        const dir = colorCls(parseFloat(fd.estimated_change_pct) || 0);
        html += `<div class="detail-nav ${dir}">${fd.nav}</div>`;
        html += `<div class="detail-change ${dir}">估值 ${fd.estimated_nav} (${fmtMoney(parseFloat(fd.estimated_change_pct) || 0)}%)</div>`;
    }
    html += `</div></div>`;

    if (h && c) {
        const earnDir = colorCls(c.today);
        html += `<div class="detail-summary">`;
        html += `<div class="detail-stat"><span class="detail-stat-label">持有金额</span><span class="detail-stat-value">${fmtPlain(h.value)}</span></div>`;
        html += `<div class="detail-stat"><span class="detail-stat-label">持有收益</span><span class="detail-stat-value ${colorCls(h.profit)}">${fmtMoney(h.profit)}</span></div>`;
        html += `<div class="detail-stat"><span class="detail-stat-label">今日预估</span><span class="detail-stat-value ${earnDir}">${fmtMoney(c.today)}</span></div>`;
        html += `<div class="detail-stat"><span class="detail-stat-label">收益率</span><span class="detail-stat-value ${colorCls(c.totalProfit)}">${c.cost > 0 ? fmtMoney(c.totalProfit / c.cost * 100) : "--"}%</span></div>`;
        html += `</div>`;
    }

    if (sig && !sig.error) {
        const sLabel = sig.signal_en === "strong_buy" || sig.signal_en === "buy" ? "buy" : sig.signal_en === "strong_sell" || sig.signal_en === "sell" ? "sell" : "hold";
        html += `<div class="detail-signal">`;
        html += `<div class="detail-signal-left"><span class="signal-label ${sLabel}">${sig.signal}</span><span class="signal-sub">买${sig.buy_score} / 卖${sig.sell_score}</span></div>`;
        html += `<div class="detail-signal-meter"><span class="meter-label" style="color:var(--down)">买</span><div class="meter-bar-bg"><div class="meter-indicator" style="left:${sig.buy_score}%"></div></div><span class="meter-label" style="color:var(--up)">卖</span></div>`;
        html += `<div class="detail-signal-summary">${sig.summary}</div>`;
        if (sig.factors && sig.factors.length) {
            html += '<div class="factor-list">';
            sig.factors.forEach(f => {
                const fDir = f.score >= 55 ? "up" : f.score <= 45 ? "down" : "flat";
                html += `<div class="factor-row"><span class="factor-name">${f.name}</span><div class="factor-bar-bg"><div class="factor-bar-fill ${fDir}" style="width:${Math.max(5, Math.min(100, f.score))}%"></div></div><span class="factor-score ${fDir}">${f.score}</span><span class="factor-detail">${f.detail || ""}</span></div>`;
            });
            html += '</div>';
        }
        html += `</div>`;
    }

    html += `<div class="detail-chart-section">`;
    html += `<div class="period-btns"><button class="period-btn" data-period="7d">7天</button><button class="period-btn" data-period="15d">15天</button><button class="period-btn" data-period="3m">3月</button><button class="period-btn active" data-period="6m">6月</button><button class="period-btn" data-period="1y">1年</button><button class="period-btn" data-period="2y">2年</button><button class="period-btn" data-period="ytd">今年</button><button class="period-btn" data-period="all">成立以来</button></div>`;
    html += `<div class="detail-chart-wrap"><canvas id="detail-chart-${code}"></canvas></div>`;
    if (perfData && perfData.returns) {
        html += '<div class="perf-returns" style="margin-top:6px;">';
        const labels = { "1m": "近1月", "3m": "近3月", "6m": "近6月", "1y": "近1年" };
        for (const [k, lbl] of Object.entries(labels)) {
            if (perfData.returns[k] != null) {
                html += `<span class="perf-badge ${colorCls(perfData.returns[k])}">${lbl} ${fmtMoney(perfData.returns[k])}%</span>`;
            }
        }
        html += '</div>';
    }
    html += `</div>`;

    if (holdingsData && holdingsData.holdings && holdingsData.holdings.length) {
        html += `<div class="detail-holdings-section">`;
        html += `<div class="section-title" style="margin-bottom:6px;">重仓股</div>`;
        holdingsData.holdings.forEach(s => {
            const chg = s.change_pct != null ? s.change_pct : null;
            const cls = chg != null ? colorCls(chg) : "flat";
            html += `<div class="stock-row"><div class="stock-left"><span class="stock-name">${s.name}</span><span class="stock-code">${s.code}</span></div><span class="stock-pct">${s.pct}%</span><span class="stock-change ${cls}">${chg != null ? fmtMoney(chg) + "%" : "--"}</span></div>`;
        });
        html += `</div>`;
    }

    $fundDetailBody.innerHTML = html;

    if (perfData && perfData.trend) {
        const chartCanvas = document.getElementById(`detail-chart-${code}`);
        if (chartCanvas) {
            renderDetailChart(code, perfData.trend, "6m");
            $fundDetailBody.querySelectorAll(".detail-chart-section .period-btn").forEach(btn => {
                btn.addEventListener("click", function () {
                    $fundDetailBody.querySelectorAll(".detail-chart-section .period-btn").forEach(b => b.classList.remove("active"));
                    this.classList.add("active");
                    renderDetailChart(code, perfData.trend, this.dataset.period);
                });
            });
        }
    }
}

// ===== 详情弹窗事件 =====
export function initFundDetailModal() {
    if ($fundDetailClose) {
        $fundDetailClose.addEventListener("click", () => { $fundDetailModal.classList.remove("show"); const dci = getDetailChartInstance(); if (dci) { dci.destroy(); setDetailChartInstance(null); } });
    }
    if ($fundDetailModal) {
        $fundDetailModal.addEventListener("click", e => { if (e.target === $fundDetailModal) { $fundDetailModal.classList.remove("show"); const dci = getDetailChartInstance(); if (dci) { dci.destroy(); setDetailChartInstance(null); } } });
    }
}

// ===== 市场交易状态 =====
export function updateMarketStatus() {
    const now = new Date(), mins = now.getHours() * 60 + now.getMinutes(), day = now.getDay();
    const isOpen = (day >= 1 && day <= 5) && ((mins >= 570 && mins <= 690) || (mins >= 780 && mins <= 900));
    const dot = document.getElementById("marketDot"), text = document.getElementById("marketText");
    if (!dot || !text) return;
    if (isOpen) { dot.className = "market-dot open"; text.textContent = "交易中"; }
    else { dot.className = "market-dot closed"; text.textContent = "已休市"; }
}

(function () {
    "use strict";

    const STORAGE_KEY = "fund_holdings";
    let holdings = loadHoldings();
    let fundDataCache = {};
    let signalCache = {};
    let refreshTimer = null;
    let searchDebounce = null;
    let chartInstances = {};
    let alertList = [];
    let metalPricesCache = {};

    const $ = (sel) => document.getElementById(sel);
    const $fundCode = $("fundCode");
    const $holdingValue = $("holdingValue");
    const $holdingProfit = $("holdingProfit");
    const $btnAdd = $("btnAdd");
    const $btnImport = $("btnImport");
    const $fundList = $("fundList");
    const $emptyState = $("emptyState");
    const $totalAssets = $("totalAssets");
    const $totalProfit = $("totalProfit");
    const $todayEarnings = $("todayEarnings");
    const $fundCount = $("fundCount");
    const $profitRate = $("profitRate");
    const $updateTime = $("updateTime");
    const $autocomplete = $("autocompleteList");
    const $toast = $("toast");
    const $importModal = $("importModal");
    const $modalClose = $("modalClose");
    const $importText = $("importText");
    const $btnParseText = $("btnParseText");
    const $btnParseImage = $("btnParseImage");
    const $imageInput = $("imageInput");
    const $previewImage = $("previewImage");
    const $importResults = $("importResults");
    const $importList = $("importList");
    const $btnConfirmImport = $("btnConfirmImport");
    const $uploadZone = $("uploadZone");
    const $recommendList = $("recommendList");
    const $metalsList = $("metalsList");
    const $sectorList = $("sectorList");
    const $addHoldingModal = $("addHoldingModal");
    const $addHoldingClose = $("addHoldingClose");
    const $addHoldingCode = $("addHoldingCode");
    const $addHoldingName = $("addHoldingName");
    const $addHoldingValue = $("addHoldingValue");
    const $addHoldingProfit = $("addHoldingProfit");
    const $btnConfirmAddHolding = $("btnConfirmAddHolding");
    const $alertCode = $("alertCode");
    const $alertCondition = $("alertCondition");
    const $alertThreshold = $("alertThreshold");
    const $btnAddAlert = $("btnAddAlert");
    const $alertList = $("alertList");
    const $indexModal = $("indexModal");
    const $indexModalTitle = $("indexModalTitle");
    const $indexModalBody = $("indexModalBody");
    const $indexModalClose = $("indexModalClose");
    const $metalModal = $("metalModal");
    const $metalModalTitle = $("metalModalTitle");
    const $metalModalBody = $("metalModalBody");
    const $metalModalClose = $("metalModalClose");
    const $fundDetailModal = $("fundDetailModal");
    const $fundDetailTitle = $("fundDetailTitle");
    const $fundDetailBody = $("fundDetailBody");
    const $fundDetailClose = $("fundDetailClose");

    let pendingImport = [];
    let uploadedImageBase64 = null;
    let metalChart = null;

    // --- Storage ---
    function loadHoldings() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
    function saveHoldings() { localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings)); }

    // --- Format ---
    function fmtMoney(v) { const n = +v || 0; return (n >= 0 ? "+" : "") + n.toFixed(2); }
    function fmtPlain(v) { return (+v || 0).toFixed(2); }
    function colorCls(v) { const n = +v || 0; return n > 0 ? "up" : n < 0 ? "down" : "flat"; }
    function fmtTime(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
    function showToast(msg) { if (!$toast) return; $toast.textContent = msg; $toast.classList.add("show"); setTimeout(() => $toast.classList.remove("show"), 2500); }

    // --- Market Status ---
    function updateMarketStatus() {
        const now = new Date(), mins = now.getHours() * 60 + now.getMinutes(), day = now.getDay();
        const isOpen = (day >= 1 && day <= 5) && ((mins >= 570 && mins <= 690) || (mins >= 780 && mins <= 900));
        const dot = $("marketDot"), text = $("marketText");
        if (!dot || !text) return;
        if (isOpen) { dot.className = "market-dot open"; text.textContent = "交易中"; }
        else { dot.className = "market-dot closed"; text.textContent = "已休市"; }
    }

    // --- Fetch ---
    async function fetchFundData(code) {
        try { const r = await fetch(`/api/fund/${code}`); if (!r.ok) { const e = await r.json(); throw new Error(e.error); } return await r.json(); }
        catch (e) { console.error(`Fetch ${code}:`, e); return null; }
    }

    async function fetchAllFundData() {
        if (!holdings.length) { renderEmpty(); return; }
        try {
            const r = await fetch("/api/fund/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codes: holdings.map(h => h.code) }) });
            const data = await r.json();
            data.forEach(f => { if (f && !f.error) fundDataCache[f.code] = f; });
        } catch (e) { console.error("Batch:", e); }
        renderFundList(); renderSummary();
        if ($updateTime) $updateTime.textContent = fmtTime(new Date()) + " 更新";
    }

    function calc(h, fd) {
        const hv = +h.value || 0, hp = +h.profit || 0, pct = +(fd?.estimated_change_pct) || 0;
        const today = hv * pct / 100;
        return { cost: hv - hp, today, totalProfit: hp + today, totalValue: hv + today, changePct: pct };
    }

    function renderEmpty() {
        if ($emptyState) $emptyState.style.display = "";
        if ($totalAssets) $totalAssets.textContent = "--";
        if ($totalProfit) { $totalProfit.textContent = "--"; $totalProfit.className = "asset-item-value"; }
        if ($todayEarnings) { $todayEarnings.textContent = "--"; $todayEarnings.className = "asset-item-value"; }
        if ($fundCount) $fundCount.textContent = "0";
        if ($profitRate) { $profitRate.textContent = "--"; $profitRate.className = "asset-item-value"; }
        $fundList.querySelectorAll(".fund-card").forEach(el => el.remove());
        Object.keys(chartInstances).forEach(k => { if (chartInstances[k]) chartInstances[k].destroy(); delete chartInstances[k]; });
    }

    // --- Render Fund List ---
    function renderFundList() {
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

    function bindCardEvents() {
        $fundList.querySelectorAll(".card-delete").forEach(btn => { btn.addEventListener("click", function (e) { e.stopPropagation(); const code = this.dataset.code; holdings = holdings.filter(h => h.code !== code); delete fundDataCache[code]; delete signalCache[code]; if (chartInstances[code]) { chartInstances[code].destroy(); delete chartInstances[code]; } saveHoldings(); renderFundList(); renderSummary(); showToast("已删除"); }); });
        $fundList.querySelectorAll(".fund-card").forEach(card => { const code = card.dataset.code;
            // Click card-top to open detail modal
            const cardTop = card.querySelector(".card-top");
            if (cardTop) { cardTop.addEventListener("click", function (e) { if (e.target.closest(".card-delete")) return; openFundDetailModal(code); }); }
            const s = card.querySelector(".card-signal"); if (!s) return; s.addEventListener("click", function (e) { e.stopPropagation(); const d = document.getElementById(`signalDetail-${code}`); const a = this.querySelector(".signal-arrow"); if (d) d.classList.toggle("show"); if (a) a.classList.toggle("open"); }); });
        $fundList.querySelectorAll(".card-tab").forEach(btn => { btn.addEventListener("click", function () { const type = this.dataset.type, code = this.dataset.code, panel = document.getElementById(`panel-${code}`), isActive = this.classList.contains("active"); this.closest(".fund-card").querySelectorAll(".card-tab").forEach(b => b.classList.remove("active")); if (panel) { panel.classList.remove("show"); panel.querySelector(".panel-body").innerHTML = ""; } if (!isActive) { this.classList.add("active"); if (panel) { panel.classList.add("show"); const body = panel.querySelector(".panel-body"); if (type === "holdings") loadHoldingsPanel(code, body); else if (type === "performance") loadPerformancePanel(code, body); } } }); });
    }

    function renderSummary() {
        if (!holdings.length) { renderEmpty(); return; }
        let tv = 0, tp = 0, te = 0, tc = 0;
        holdings.forEach(h => { const c = calc(h, fundDataCache[h.code]); tv += c.totalValue; tp += c.totalProfit; te += c.today; tc += c.cost; });
        if ($totalAssets) $totalAssets.textContent = fmtPlain(tv);
        if ($totalProfit) { $totalProfit.textContent = fmtMoney(tp); $totalProfit.className = "asset-item-value " + colorCls(tp); }
        if ($todayEarnings) { $todayEarnings.textContent = fmtMoney(te); $todayEarnings.className = "asset-item-value " + colorCls(te); }
        if ($fundCount) $fundCount.textContent = holdings.length;
        if ($profitRate) { const rate = tc > 0 ? (tp / tc * 100) : 0; $profitRate.textContent = fmtMoney(rate) + "%"; $profitRate.className = "asset-item-value " + colorCls(rate); }
    }

    async function fetchAllSignals() { for (const h of holdings) { if (signalCache[h.code]) continue; try { const r = await fetch(`/api/fund/signal/${h.code}`); const data = await r.json(); if (!data.error) signalCache[h.code] = data; } catch (e) { console.error(`Signal ${h.code}:`, e); } } }

    // --- Holdings Panel ---
    async function loadHoldingsPanel(code, container) {
        container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载中...</div>';
        try { const r = await fetch(`/api/fund/holdings/${code}`); const data = await r.json(); if (!data.holdings || !data.holdings.length) { container.innerHTML = '<div class="panel-loading" style="color:#999">暂无数据</div>'; return; } let html = ""; data.holdings.forEach(s => { const chg = s.change_pct != null ? s.change_pct : null; const cls = chg != null ? colorCls(chg) : "flat"; html += `<div class="stock-row"><div class="stock-left"><span class="stock-name">${s.name}</span><span class="stock-code">${s.code}</span></div><span class="stock-pct">${s.pct}%</span><span class="stock-change ${cls}">${chg != null ? fmtMoney(chg) + "%" : "--"}</span></div>`; }); container.innerHTML = html; }
        catch (e) { container.innerHTML = '<div class="panel-loading" style="color:#e74c3c">加载失败</div>'; }
    }

    // --- Performance Panel ---
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

    // --- Fund Detail Modal (放大查看) ---
    let detailChartInstance = null;

    async function openFundDetailModal(code) {
        if (!$fundDetailModal) return;
        const fd = fundDataCache[code];
        const sig = signalCache[code];
        const h = holdings.find(h => h.code === code);
        const c = h && fd ? calc(h, fd) : null;
        const name = fd ? fd.name : code;

        $fundDetailTitle.textContent = name + " 详情";
        $fundDetailBody.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载详细数据...</div>';
        $fundDetailModal.classList.add("show");

        // Fetch performance + holdings in parallel
        let perfData = null, holdingsData = null;
        try {
            const [perfResp, holdResp] = await Promise.all([
                fetch(`/api/fund/performance/${code}`),
                fetch(`/api/fund/holdings/${code}`)
            ]);
            perfData = await perfResp.json();
            holdingsData = await holdResp.json();
        } catch (e) { console.error("Detail fetch:", e); }

        // Build header
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

        // Holdings summary if available
        if (h && c) {
            const earnDir = colorCls(c.today);
            html += `<div class="detail-summary">`;
            html += `<div class="detail-stat"><span class="detail-stat-label">持有金额</span><span class="detail-stat-value">${fmtPlain(h.value)}</span></div>`;
            html += `<div class="detail-stat"><span class="detail-stat-label">持有收益</span><span class="detail-stat-value ${colorCls(h.profit)}">${fmtMoney(h.profit)}</span></div>`;
            html += `<div class="detail-stat"><span class="detail-stat-label">今日预估</span><span class="detail-stat-value ${earnDir}">${fmtMoney(c.today)}</span></div>`;
            html += `<div class="detail-stat"><span class="detail-stat-label">收益率</span><span class="detail-stat-value ${colorCls(c.totalProfit)}">${c.cost > 0 ? fmtMoney(c.totalProfit / c.cost * 100) : "--"}%</span></div>`;
            html += `</div>`;
        }

        // Signal section
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

        // Chart section
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

        // Holdings section
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

        // Render chart with larger size
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

    function renderDetailChart(code, trend, period) {
        if (detailChartInstance) detailChartInstance.destroy();
        const canvas = document.getElementById(`detail-chart-${code}`);
        if (!canvas || !trend || !trend.length) return;
        let filtered = trend;
        const lastDate = trend[trend.length - 1].date;
        if (period === "ytd") { filtered = trend.filter(p => p.date >= new Date(new Date(lastDate).getFullYear(), 0, 1).getTime()); }
        else { const periods = { "7d": 7, "15d": 15, "3m": 90, "6m": 180, "1y": 365, "2y": 730, "all": 99999 }; filtered = trend.filter(p => p.date >= lastDate - (periods[period] || 180) * 86400000); }
        if (filtered.length > 300) { const step = Math.ceil(filtered.length / 300); filtered = filtered.filter((_, i) => i % step === 0); }
        const labels = filtered.map(p => new Date(p.date)), navs = filtered.map(p => p.nav);
        const lineColor = (navs[navs.length - 1] || 0) >= (navs[0] || 0) ? "#e74c3c" : "#27ae60";
        let timeUnit = "month", displayFormat = "M月d日";
        if (period === "7d" || period === "15d") { timeUnit = "day"; } else if (period === "3m") { timeUnit = "week"; } else if (period === "6m" || period === "ytd") { displayFormat = "M月"; } else { displayFormat = "yyyy年M月"; }

        detailChartInstance = new Chart(canvas, {
            type: "line", data: { labels, datasets: [{ data: navs, borderColor: lineColor, backgroundColor: lineColor + "15", borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false, callbacks: { title: items => { if (items.length) { const d = new Date(items[0].parsed.x); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; } return ""; } } } },
                scales: { x: { type: "time", time: { unit: timeUnit, displayFormats: { day: displayFormat, week: displayFormat, month: displayFormat } }, ticks: { maxTicksLimit: 8, font: { size: 11 } }, grid: { display: false } }, y: { ticks: { maxTicksLimit: 6, font: { size: 11 } }, grid: { color: "#f0f0f0" } } },
                interaction: { mode: "nearest", axis: "x" },
                onHover(event, elements, chart) { const { x, y } = event.native ? { x: event.native.offsetX, y: event.native.offsetY } : { x: 0, y: 0 }; chart._crosshair = { x, y }; chart.draw(); },
            }
        });
        canvas.addEventListener("mouseleave", () => { if (detailChartInstance) { detailChartInstance._crosshair = null; detailChartInstance.draw(); } });
    }

    // Fund detail modal close handlers
    if ($fundDetailClose) {
        $fundDetailClose.addEventListener("click", () => { $fundDetailModal.classList.remove("show"); if (detailChartInstance) { detailChartInstance.destroy(); detailChartInstance = null; } });
    }
    if ($fundDetailModal) {
        $fundDetailModal.addEventListener("click", e => { if (e.target === $fundDetailModal) { $fundDetailModal.classList.remove("show"); if (detailChartInstance) { detailChartInstance.destroy(); detailChartInstance = null; } } });
    }

    // Chart.js crosshair plugin
    const crosshairPlugin = {
        id: "crosshair",
        afterDraw(chart) {
            if (chart._crosshair) {
                const { ctx, chartArea: { left, right, top, bottom } } = chart;
                const { x, y } = chart._crosshair;
                ctx.save();
                ctx.setLineDash([6, 3]);
                ctx.lineWidth = 1.2;
                ctx.strokeStyle = "rgba(26,115,232,0.7)";
                // Vertical line
                ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
                // Horizontal line
                ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
                // Draw a small dot at intersection
                ctx.fillStyle = "rgba(26,115,232,0.9)";
                ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
                // Label on the right edge
                const yAxis = chart.scales.y;
                if (yAxis) {
                    const value = yAxis.getValueForPixel(y);
                    ctx.setLineDash([]);
                    ctx.font = "10px sans-serif";
                    ctx.fillStyle = "#1a73e8";
                    ctx.textAlign = "left";
                    ctx.fillText(value.toFixed(2), right + 4, y + 3);
                }
                ctx.restore();
            }
        }
    };
    if (typeof Chart !== "undefined") Chart.register(crosshairPlugin);

    function renderChart(code, trend, period) {
        if (chartInstances[code]) chartInstances[code].destroy();
        const canvas = document.getElementById(`chart-${code}`);
        if (!canvas || !trend || !trend.length) return;
        let filtered = trend;
        // Use last data point as reference (NAV data may be lagged)
        const lastDate = trend[trend.length - 1].date;
        if (period === "ytd") { const yearStart = new Date(new Date(lastDate).getFullYear(), 0, 1).getTime(); filtered = trend.filter(p => p.date >= yearStart); }
        else { const periods = { "7d": 7, "15d": 15, "3m": 90, "6m": 180, "1y": 365, "2y": 730, "all": 99999 }; filtered = trend.filter(p => p.date >= lastDate - (periods[period] || 180) * 86400000); }
        if (filtered.length > 300) { const step = Math.ceil(filtered.length / 300); filtered = filtered.filter((_, i) => i % step === 0); }
        const labels = filtered.map(p => new Date(p.date)), navs = filtered.map(p => p.nav);
        const lineColor = (navs[navs.length - 1] || 0) >= (navs[0] || 0) ? "#e74c3c" : "#27ae60";
        let timeUnit = "month", displayFormat = "M月d日";
        if (period === "7d" || period === "15d") { timeUnit = "day"; } else if (period === "3m") { timeUnit = "week"; } else if (period === "6m" || period === "ytd") { displayFormat = "M月"; } else { displayFormat = "yyyy年M月"; }

        chartInstances[code] = new Chart(canvas, {
            type: "line", data: { labels, datasets: [{ data: navs, borderColor: lineColor, backgroundColor: lineColor + "15", borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.3 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false, callbacks: { title: items => { if (items.length) { const d = new Date(items[0].parsed.x); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; } return ""; } } } },
                scales: { x: { type: "time", time: { unit: timeUnit, displayFormats: { day: displayFormat, week: displayFormat, month: displayFormat } }, ticks: { maxTicksLimit: 5, font: { size: 9 } }, grid: { display: false } }, y: { ticks: { maxTicksLimit: 4, font: { size: 9 } }, grid: { color: "#f0f0f0" } } },
                interaction: { mode: "nearest", axis: "x" },
                onHover(event, elements, chart) { const { x, y } = event.native ? { x: event.native.offsetX, y: event.native.offsetY } : { x: 0, y: 0 }; chart._crosshair = { x, y }; chart.draw(); },
            }
        });
        canvas.addEventListener("mouseleave", () => { const chart = chartInstances[code]; if (chart) { chart._crosshair = null; chart.draw(); } });
    }

    // --- Market Index ---
    async function fetchMarketIndex() {
        try { const r = await fetch("/api/market/index"); const data = await r.json(); renderMarketIndex(data); } catch (e) { console.error("Index:", e); }
    }

    function renderMarketIndex(data) {
        const mapping = { "sh000001": "idx-sh", "sz399001": "idx-sz", "sz399006": "idx-cy" };
        for (const [key, domId] of Object.entries(mapping)) {
            const item = data[key], el = $(domId);
            if (!item || !el) continue;
            const dir = colorCls(item.change);
            el.querySelector(".index-price").textContent = item.price.toFixed(2);
            el.querySelector(".index-price").className = "index-price " + dir;
            const sign = item.change >= 0 ? "+" : "";
            el.querySelector(".index-change").textContent = `${sign}${item.change.toFixed(2)} (${sign}${item.change_pct.toFixed(2)}%)`;
            el.querySelector(".index-change").className = "index-change " + dir;
        }
    }

    // Index detail modal
    document.querySelectorAll(".index-item").forEach(item => {
        item.addEventListener("click", async function () {
            const key = this.dataset.key;
            try {
                const r = await fetch("/api/market/index");
                const data = await r.json();
                const idx = data[key];
                if (!idx) { showToast("无数据"); return; }
                $indexModalTitle.textContent = idx.name + " 详情";
                const dir = colorCls(idx.change);
                $indexModalBody.innerHTML = `
                    <div class="index-detail-grid">
                        <div class="index-detail-item"><span class="index-detail-label">最新价</span><span class="index-detail-value ${dir}">${idx.price.toFixed(2)}</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">涨跌额</span><span class="index-detail-value ${dir}">${idx.change >= 0 ? "+" : ""}${idx.change.toFixed(2)}</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">涨跌幅</span><span class="index-detail-value ${dir}">${idx.change >= 0 ? "+" : ""}${idx.change_pct.toFixed(2)}%</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">振幅</span><span class="index-detail-value">${idx.amplitude.toFixed(2)}%</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">今开</span><span class="index-detail-value">${idx.open.toFixed(2)}</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">昨收</span><span class="index-detail-value">${idx.prev_close.toFixed(2)}</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">最高</span><span class="index-detail-value up">${idx.high.toFixed(2)}</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">最低</span><span class="index-detail-value down">${idx.low.toFixed(2)}</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">成交量</span><span class="index-detail-value">${idx.volume.toFixed(0)} 万手</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">成交额</span><span class="index-detail-value">${idx.amount.toFixed(0)} 亿</span></div>
                    </div>
                    <div style="font-size:10px;color:#bbb;text-align:right;">${idx.trade_date}</div>`;
                $indexModal.classList.add("show");
            } catch (e) { showToast("获取详情失败"); }
        });
    });
    $indexModalClose.addEventListener("click", () => $indexModal.classList.remove("show"));
    $indexModal.addEventListener("click", e => { if (e.target === $indexModal) $indexModal.classList.remove("show"); });

    // --- Metals ---
    async function fetchMetalPrices() {
        if (!$metalsList) return;
        try { const r = await fetch("/api/price/metals"); const data = await r.json(); metalPricesCache = data; renderMetalPrices(data); } catch (e) { console.error("Metals:", e); }
    }

    function renderMetalPrices(data) {
        if (!$metalsList) return;
        if (!data || data.error || !Object.keys(data).length) { $metalsList.innerHTML = '<div class="panel-loading" style="color:#999">暂无行情</div>'; return; }
        const order = ["gold", "gold_cny", "silver", "silver_cny"];
        let html = "";
        for (const key of order) {
            const item = data[key]; if (!item) continue;
            const dir = colorCls(item.change), sign = item.change >= 0 ? "+" : "";
            html += `<div class="metal-card" data-metal="${key}"><div class="metal-left"><span class="metal-name">${item.name}</span><span class="metal-unit">${item.unit}</span></div><div class="metal-right"><span class="metal-price ${dir}">${item.price.toFixed(2)}</span><span class="metal-change ${dir}">${sign}${item.change.toFixed(2)} (${sign}${item.change_pct.toFixed(2)}%)</span></div></div>`;
        }
        if (data.usdcny) html += `<div style="text-align:center;font-size:8px;color:#bbb;margin-top:2px;">USD/CNY ${data.usdcny}</div>`;
        $metalsList.innerHTML = html;

        // Metal click → detail modal
        $metalsList.querySelectorAll(".metal-card").forEach(card => {
            card.addEventListener("click", function () {
                const metalKey = this.dataset.metal;
                openMetalModal(metalKey);
            });
        });
    }

    async function openMetalModal(metalKey) {
        const item = metalPricesCache[metalKey];
        if (!item) return;

        // Map to trend API key - gold_cny/silver_cny should use CNY trend
        const trendKeyMap = { "gold": "gold", "gold_cny": "gold_cny", "silver": "silver", "silver_cny": "silver_cny" };
        const trendKey = trendKeyMap[metalKey] || "gold";
        const dir = colorCls(item.change), sign = item.change >= 0 ? "+" : "";

        $metalModalTitle.textContent = item.name + " 趋势";
        $metalModalBody.innerHTML = `
            <div class="metal-detail-header">
                <div><div class="metal-detail-price ${dir}">${item.price.toFixed(2)}</div><div style="font-size:10px;color:var(--text3)">${item.unit}</div></div>
                <div class="metal-detail-change ${dir}">${sign}${item.change.toFixed(2)} (${sign}${item.change_pct.toFixed(2)}%)</div>
            </div>
            <div class="period-btns" style="margin-bottom:8px;">
                <button class="period-btn" data-period="7d">7天</button>
                <button class="period-btn" data-period="15d">15天</button>
                <button class="period-btn active" data-period="1m">1月</button>
                <button class="period-btn" data-period="3m">3月</button>
                <button class="period-btn" data-period="6m">6月</button>
                <button class="period-btn" data-period="1y">1年</button>
            </div>
            <div class="chart-wrap" style="height:180px;"><canvas id="metalChart"></canvas></div>
            <div class="metal-advice" id="metalAdvice"><div class="metal-advice-title">加载建议中...</div></div>`;
        $metalModal.classList.add("show");

        loadMetalTrend(trendKey, "1m", item);

        $metalModalBody.querySelectorAll(".period-btn").forEach(btn => {
            btn.addEventListener("click", function () {
                $metalModalBody.querySelectorAll(".period-btn").forEach(b => b.classList.remove("active"));
                this.classList.add("active");
                loadMetalTrend(trendKey, this.dataset.period, item);
            });
        });
    }

    async function loadMetalTrend(metalKey, period, metalItem) {
        try {
            const r = await fetch(`/api/price/metals/trend?metal=${metalKey}&period=${period}`);
            const data = await r.json();
            if (!data.trend || !data.trend.length) return;

            const canvas = document.getElementById("metalChart");
            if (!canvas) return;
            if (metalChart) metalChart.destroy();

            const labels = data.trend.map(p => p.date);
            const closes = data.trend.map(p => p.close);
            const startPrice = closes[0] || 0;
            const endPrice = closes[closes.length - 1] || 0;
            const lineColor = endPrice >= startPrice ? "#e74c3c" : "#27ae60";

            metalChart = new Chart(canvas, {
                type: "line",
                data: { labels, datasets: [{ data: closes, borderColor: lineColor, backgroundColor: lineColor + "15", borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.3 }] },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
                    scales: { x: { ticks: { maxTicksLimit: 6, font: { size: 9 } }, grid: { display: false } }, y: { ticks: { maxTicksLimit: 5, font: { size: 9 } }, grid: { color: "#f0f0f0" } } },
                    interaction: { mode: "nearest", axis: "x" },
                    onHover(event, elements, chart) {
                        const { x, y } = event.native ? { x: event.native.offsetX, y: event.native.offsetY } : { x: 0, y: 0 };
                        chart._crosshair = { x, y };
                        chart.draw();
                    },
                }
            });
            canvas.addEventListener("mouseleave", () => { if (metalChart) { metalChart._crosshair = null; metalChart.draw(); } });

            // Generate advice
            const adviceEl = document.getElementById("metalAdvice");
            if (adviceEl) {
                const changeFromStart = ((endPrice - startPrice) / startPrice * 100);
                const isGold = metalKey.includes("gold");
                const metalName = isGold ? "黄金" : "白银";
                let advice = "";
                if (metalItem.change_pct > 2) {
                    advice = `<strong>短期涨幅较大（${fmtMoney(metalItem.change_pct)}%）</strong>，追高风险较高。建议等待回调后再考虑入手，或分批建仓。`;
                } else if (metalItem.change_pct < -2) {
                    advice = `<strong>短期跌幅较大（${fmtMoney(metalItem.change_pct)}%）</strong>，如看好${metalName}中长期走势，可考虑逢低分批买入。`;
                } else if (changeFromStart > 10) {
                    advice = `${metalName}近期涨幅${changeFromStart.toFixed(1)}%，<strong>处于相对高位</strong>。建议观望或少量配置，不宜重仓追入。`;
                } else if (changeFromStart < -5) {
                    advice = `${metalName}近期回调${Math.abs(changeFromStart).toFixed(1)}%，<strong>处于相对低位</strong>。如看好避险需求，可考虑逐步建仓。`;
                } else {
                    advice = `${metalName}近期波动较小（${changeFromStart >= 0 ? "+" : ""}${changeFromStart.toFixed(1)}%），<strong>走势平稳</strong>。可根据个人资产配置需要适量持有。`;
                }
                advice += `<br><br><span style="color:var(--text3);font-size:10px;">提示：贵金属投资有风险，建议配置比例不超过总资产的10-15%。</span>`;
                adviceEl.innerHTML = `<div class="metal-advice-title">💡 入手建议</div>${advice}`;
            }
        } catch (e) { console.error("Metal trend:", e); }
    }

    $metalModalClose.addEventListener("click", () => { $metalModal.classList.remove("show"); if (metalChart) { metalChart.destroy(); metalChart = null; } });
    $metalModal.addEventListener("click", e => { if (e.target === $metalModal) { $metalModal.classList.remove("show"); if (metalChart) { metalChart.destroy(); metalChart = null; } } });

    // --- Hot Sectors ---
    async function fetchSectors() {
        if (!$sectorList) return;
        try { const r = await fetch("/api/market/sectors"); const data = await r.json(); renderSectors(data); } catch (e) { console.error("Sectors:", e); $sectorList.innerHTML = '<div class="panel-loading" style="color:#999">加载失败</div>'; }
    }

    function renderSectors(sectors) {
        if (!$sectorList) return;
        if (!sectors || !sectors.length) { $sectorList.innerHTML = '<span style="color:#999;font-size:10px;">暂无数据</span>'; return; }
        const top17 = sectors.slice(0, 17);
        const rest = sectors.slice(17);
        const chipHTML = (s) => {
            const dir = colorCls(s.change_pct), sign = s.change_pct >= 0 ? "+" : "";
            return `<div class="sector-chip"><span class="sector-chip-name">${s.name}</span><span class="sector-chip-change ${dir}">${sign}${s.change_pct.toFixed(2)}%</span>${s.leader_name ? `<span class="sector-chip-leader">${s.leader_name}</span>` : ""}</div>`;
        };
        let row1Chips = top17.map(chipHTML).join("");
        if (rest.length) {
            row1Chips += `<div class="sector-chip sector-more-btn" id="sectorMoreBtn">更多 ▾</div>`;
        }
        let restHTML = "";
        if (rest.length) {
            restHTML = `<div class="sector-row2" id="sectorRow2" style="display:none;">` + rest.map(chipHTML).join("") + `</div>`;
        }
        $sectorList.innerHTML = `<div class="sector-row1">${row1Chips}</div>${restHTML}`;

        const moreBtn = document.getElementById('sectorMoreBtn');
        const row2 = document.getElementById('sectorRow2');
        if (moreBtn) {
            moreBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (row2) {
                    const visible = row2.style.display !== 'none';
                    row2.style.display = visible ? 'none' : 'flex';
                    this.textContent = visible ? '更多 ▾' : '收起 ▴';
                }
            });
        }
    }

    // --- Recommend ---
    let allRecommendData = [];
    let recMeta = null;

    async function fetchRecommendations() {
        if (!$recommendList) return;
        try { const r = await fetch("/api/fund/recommend"); const resp = await r.json(); allRecommendData = resp.items || resp; recMeta = resp.meta || null; applyRecFilter(); } catch (e) { console.error("Recommend:", e); $recommendList.innerHTML = '<div class="panel-loading" style="color:#999">加载失败</div>'; }
    }

    function applyRecFilter() {
        const filter = $("recFilter") ? $("recFilter").value : "all";
        let filtered = allRecommendData;
        if (filter !== "all") {
            filtered = allRecommendData.filter(item => item.recommend_level === filter);
        }
        const countEl = $("recFilterCount");
        if (countEl) {
            if (recMeta && recMeta.total_scored) {
                countEl.textContent = `${filtered.length}只（共评估${recMeta.total_scored}只）`;
            } else {
                countEl.textContent = `${filtered.length}/${allRecommendData.length}`;
            }
        }
        renderRecommendations(filtered);
    }

    // Bind filter change
    const $recFilter = $("recFilter");
    if ($recFilter) { $recFilter.addEventListener("change", applyRecFilter); }

    function renderRecommendations(items) {
        if (!$recommendList) return;
        if (!items || !items.length) { $recommendList.innerHTML = '<div class="panel-loading" style="color:#999">暂无推荐</div>'; return; }
        const alreadyHeld = new Set(holdings.map(h => h.code));
        $recommendList.innerHTML = items.map(item => {
            const held = alreadyHeld.has(item.code), chgDir = colorCls(+item.estimated_change_pct || 0);
            const level = item.recommend_level || "hold";
            const label = item.recommend_label || "观望";
            const labelClass = level === "strong_buy" ? "rec-strong" : level === "buy" ? "rec-buy" : level === "watch" ? "rec-watch" : "rec-hold";
            const wScore = item.weighted_score || item.buy_score || 50;
            let factorRows = "";
            if (item.factors && item.factors.length) { factorRows = item.factors.map(f => { const fDir = f.score >= 55 ? "up" : f.score <= 45 ? "down" : "flat"; return `<div class="recommend-expand-row"><span class="recommend-expand-name">${f.name}</span><div class="recommend-expand-bar-bg"><div class="recommend-expand-bar ${fDir}" style="width:${Math.max(5, Math.min(100, f.score))}%"></div></div><span class="recommend-expand-score" style="color:var(--${fDir})">${f.score}</span></div>`; }).join(""); }
            return `<div class="recommend-card ${labelClass}" data-code="${item.code}">
                <div class="recommend-card-head"><span class="recommend-card-name">${item.name}</span><span class="recommend-card-label ${labelClass}">${label}</span></div>
                <div class="recommend-card-info"><span class="recommend-card-code">${item.code}</span><span class="recommend-card-type">${item.type}</span><span>净值 ${item.nav}</span><span class="${chgDir}">${fmtMoney(+item.estimated_change_pct || 0)}%</span><span class="rec-score">评分${wScore.toFixed(0)}</span></div>
                <div class="recommend-card-factors">共${item.factor_total || 0}项指标，<span class="bull">${item.bullish_count || 0}项看多</span>，<span class="bear">${item.bearish_count || 0}项看空</span>。今日估值${fmtMoney(+item.estimated_change_pct || 0)}%。</div>
                ${item.reference_rule ? `<div class="recommend-card-rule">${item.reference_rule}</div>` : ""}
                <div class="recommend-card-expand" id="recExpand-${item.code}">${factorRows}</div>
                <div class="recommend-card-bottom"><span class="recommend-card-signal ${labelClass}">${item.signal || item.recommend_label}</span>${held ? '<span style="font-size:9px;color:#999">已持有</span>' : `<button class="recommend-card-add" data-code="${item.code}" data-name="${item.name}">+ 加入持仓</button>`}</div>
            </div>`;
        }).join("");
        $recommendList.querySelectorAll(".recommend-card").forEach(card => { card.addEventListener("click", function (e) { if (e.target.closest(".recommend-card-add")) return; const expand = this.querySelector(".recommend-card-expand"); if (expand) expand.classList.toggle("show"); }); });
        $recommendList.querySelectorAll(".recommend-card-add").forEach(btn => { btn.addEventListener("click", function (e) { e.stopPropagation(); const code = this.dataset.code, name = this.dataset.name; if (holdings.some(h => h.code === code)) { showToast("该基金已存在"); return; } openAddHoldingModal(code, name); }); });
    }

    // --- Add Holding Modal ---
    function openAddHoldingModal(code, name) { $addHoldingModal.classList.add("show"); $addHoldingCode.value = code; $addHoldingName.textContent = name || code; $addHoldingValue.value = ""; $addHoldingProfit.value = ""; $addHoldingValue.focus(); }
    function closeAddHoldingModal() { $addHoldingModal.classList.remove("show"); }
    $addHoldingClose.addEventListener("click", closeAddHoldingModal);
    $addHoldingModal.addEventListener("click", function (e) { if (e.target === $addHoldingModal) closeAddHoldingModal(); });
    $btnConfirmAddHolding.addEventListener("click", async function () {
        const code = $addHoldingCode.value, value = $addHoldingValue.value.trim(), profit = $addHoldingProfit.value.trim();
        if (!value || +value <= 0) { showToast("请输入持有金额"); return; }
        if (holdings.some(h => h.code === code)) { showToast("该基金已存在"); closeAddHoldingModal(); return; }
        this.disabled = true; this.textContent = "添加中...";
        const fd = await fetchFundData(code);
        if (!fd) { showToast("获取基金数据失败"); this.disabled = false; this.textContent = "确认加入"; return; }
        holdings.push({ code, value: +value || 0, profit: +profit || 0 }); fundDataCache[code] = fd; saveHoldings();
        renderFundList(); renderSummary(); fetchRecommendations(); closeAddHoldingModal();
        this.disabled = false; this.textContent = "确认加入"; showToast(`已添加 ${fd.name}`); fetchSignal(code);
    });
    $addHoldingProfit.addEventListener("keydown", e => { if (e.key === "Enter") $btnConfirmAddHolding.click(); });
    $addHoldingValue.addEventListener("keydown", e => { if (e.key === "Enter") $addHoldingProfit.focus(); });

    // --- Alerts ---
    async function fetchAlerts() { try { const r = await fetch("/api/alerts"); alertList = await r.json(); renderAlerts(); } catch (e) { console.error("Alerts:", e); } }
    function renderAlerts() {
        if (!$alertList) return;
        if (!alertList.length) { $alertList.innerHTML = '<div class="alert-empty">暂无提醒</div>'; return; }
        $alertList.innerHTML = alertList.map(a => {
            const condText = a.condition === "above" ? "≥" : "≤";
            return `<div class="alert-item${a.triggered ? " triggered" : ""}" data-id="${a.id}"><div class="alert-item-left"><span class="alert-item-name">${a.name || a.code}</span><span class="alert-item-rule">${a.condition === "above" ? "涨幅" : "跌幅"} ${condText} ${a.threshold}%${a.triggered ? " - 已触发!" : ""}</span></div><button class="btn-danger" data-alert-id="${a.id}">&times;</button></div>`;
        }).join("");
        $alertList.querySelectorAll(".btn-danger").forEach(btn => { btn.addEventListener("click", async function () { const id = this.dataset.alertId; try { await fetch(`/api/alerts/${id}`, { method: "DELETE" }); alertList = alertList.filter(a => a.id != id); renderAlerts(); showToast("提醒已删除"); } catch (e) { showToast("删除失败"); } }); });
    }
    $btnAddAlert.addEventListener("click", async function () {
        const code = $alertCode.value.trim(), condition = $alertCondition.value, threshold = $alertThreshold.value.trim();
        if (!code || !/^\d{6}$/.test(code)) { showToast("请输入6位基金代码"); return; }
        if (!threshold) { showToast("请输入阈值百分比"); return; }
        const fd = await fetchFundData(code), name = fd ? fd.name : code;
        try { const r = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name, condition, threshold: +threshold }) }); const alert = await r.json(); if (alert.error) { showToast(alert.error); return; } alertList.push(alert); renderAlerts(); $alertCode.value = ""; $alertThreshold.value = ""; showToast(`已添加提醒：${name}`); } catch (e) { showToast("添加失败"); }
    });
    async function checkAlerts() { try { const r = await fetch("/api/alerts/check"); const data = await r.json(); if (data.triggered && data.triggered.length) { data.triggered.forEach(a => showToast(`提醒触发：${a.name || a.code} ${fmtMoney(a.trigger_value)}%`)); fetchAlerts(); } } catch (e) { /* */ } }

    // --- Autocomplete ---
    async function searchFunds(q) {
        if (!q || q.length < 1) { $autocomplete.classList.remove("show"); return; }
        try { const r = await fetch(`/api/fund/search?q=${encodeURIComponent(q)}`); const data = await r.json(); if (!data.length) { $autocomplete.classList.remove("show"); return; } $autocomplete.innerHTML = data.map(f => `<div class="ac-item" data-code="${f.code}"><span class="ac-code">${f.code}</span><span class="ac-name">${f.name}</span><span class="ac-type">${f.type}</span></div>`).join(""); $autocomplete.classList.add("show"); $autocomplete.querySelectorAll(".ac-item").forEach(item => { item.addEventListener("click", function () { $fundCode.value = this.dataset.code; $autocomplete.classList.remove("show"); $holdingValue.focus(); }); }); } catch (e) { console.error("Search:", e); }
    }

    // --- Add Fund ---
    async function addFund() {
        const code = $fundCode.value.trim(), value = $holdingValue.value.trim(), profit = $holdingProfit.value.trim();
        if (!code || !/^\d{6}$/.test(code)) { showToast("请输入6位基金代码"); return; }
        if (!value || +value <= 0) { showToast("请输入持有金额"); return; }
        if (holdings.some(h => h.code === code)) { showToast("该基金已存在"); return; }
        $btnAdd.disabled = true; $btnAdd.textContent = "...";
        const fd = await fetchFundData(code);
        if (!fd) { showToast("无法获取基金数据"); $btnAdd.disabled = false; $btnAdd.textContent = "添加"; return; }
        holdings.push({ code, value: +value || 0, profit: +profit || 0 }); fundDataCache[code] = fd; saveHoldings();
        $fundCode.value = ""; $holdingValue.value = ""; $holdingProfit.value = "";
        $btnAdd.disabled = false; $btnAdd.textContent = "添加";
        renderFundList(); renderSummary(); showToast(`已添加 ${fd.name}`); fetchSignal(code);
    }
    async function fetchSignal(code) { try { const r = await fetch(`/api/fund/signal/${code}`); const data = await r.json(); if (!data.error) { signalCache[code] = data; renderFundList(); renderSummary(); } } catch (e) { console.error("Signal:", e); } }

    // --- Import Modal ---
    function openImportModal() { $importModal.classList.add("show"); $importResults.classList.add("hidden"); $previewImage.classList.add("hidden"); uploadedImageBase64 = null; }
    function closeImportModal() { $importModal.classList.remove("show"); }
    function showImportResults(items) { pendingImport = items; $importResults.classList.remove("hidden"); $importList.innerHTML = items.map(item => `<div class="import-item"><div class="import-item-left"><span class="import-item-name">${item.name || "未知基金"}</span><span class="import-item-code">${item.code}</span></div><span class="import-item-val">¥${fmtPlain(item.value)}</span></div>`).join(""); }
    async function parseText() { const text = $importText.value.trim(); if (!text) { showToast("请粘贴持仓数据"); return; } $btnParseText.disabled = true; $btnParseText.textContent = "解析中..."; try { const r = await fetch("/api/import/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }); const data = await r.json(); if (data.error) { showToast(data.error); return; } if (!data.length) { showToast("未识别到基金数据"); return; } showImportResults(data); showToast(`识别到 ${data.length} 只基金`); } catch (e) { showToast("解析失败"); } finally { $btnParseText.disabled = false; $btnParseText.textContent = "解析文本"; } }
    async function parseImage() { if (!uploadedImageBase64) { showToast("请先上传图片"); return; } $btnParseImage.disabled = true; $btnParseImage.textContent = "识别中..."; try { const r = await fetch("/api/import/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: uploadedImageBase64 }) }); const data = await r.json(); if (data.error) { showToast(data.error); return; } if (!data.length) { showToast("未识别到基金数据"); return; } showImportResults(data); showToast(`识别到 ${data.length} 只基金`); } catch (e) { showToast("识别失败"); } finally { $btnParseImage.disabled = false; $btnParseImage.textContent = "识别图片"; } }
    function confirmImport() { let added = 0; pendingImport.forEach(item => { if (!holdings.some(h => h.code === item.code)) { holdings.push({ code: item.code, value: item.value || 0, profit: item.profit || 0 }); added++; } }); saveHoldings(); fetchAllFundData(); closeImportModal(); showToast(`成功导入 ${added} 只基金`); }
    function handleImageUpload(file) { if (!file) return; const reader = new FileReader(); reader.onload = function (e) { uploadedImageBase64 = e.target.result; $previewImage.src = uploadedImageBase64; $previewImage.classList.remove("hidden"); }; reader.readAsDataURL(file); }

    // --- Auto Refresh ---
    function startAutoRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(() => { updateMarketStatus(); fetchAllFundData(); fetchMarketIndex(); fetchMetalPrices(); checkAlerts(); fetchSectors(); }, 60000);
    }

    // --- Events ---
    $btnAdd.addEventListener("click", addFund);
    $btnImport.addEventListener("click", openImportModal);
    $modalClose.addEventListener("click", closeImportModal);
    $importModal.addEventListener("click", function (e) { if (e.target === $importModal) closeImportModal(); });
    $btnParseText.addEventListener("click", parseText);
    $btnParseImage.addEventListener("click", parseImage);
    $btnConfirmImport.addEventListener("click", confirmImport);
    $imageInput.addEventListener("change", function () { if (this.files[0]) handleImageUpload(this.files[0]); });
    if ($uploadZone) { $uploadZone.addEventListener("dragover", function (e) { e.preventDefault(); this.style.borderColor = "var(--primary)"; }); $uploadZone.addEventListener("dragleave", function () { this.style.borderColor = ""; }); $uploadZone.addEventListener("drop", function (e) { e.preventDefault(); this.style.borderColor = ""; if (e.dataTransfer.files[0]) handleImageUpload(e.dataTransfer.files[0]); }); }
    document.querySelectorAll(".modal-tabs .mtab").forEach(tab => { tab.addEventListener("click", function () { document.querySelectorAll(".modal-tabs .mtab").forEach(t => t.classList.remove("active")); this.classList.add("active"); document.querySelectorAll(".tab-pane").forEach(c => c.classList.add("hidden")); document.getElementById(this.dataset.tab).classList.remove("hidden"); }); });
    $fundCode.addEventListener("input", function () { clearTimeout(searchDebounce); searchDebounce = setTimeout(() => searchFunds(this.value.trim()), 300); });
    $fundCode.addEventListener("blur", () => setTimeout(() => $autocomplete.classList.remove("show"), 200));
    $holdingProfit.addEventListener("keydown", e => { if (e.key === "Enter") addFund(); });
    $holdingValue.addEventListener("keydown", e => { if (e.key === "Enter") $holdingProfit.focus(); });
    $fundCode.addEventListener("keydown", e => { if (e.key === "Enter") $holdingValue.focus(); });

    // --- AI Chat Widget ---
    const $aiFloatBtn = $("aiFloatBtn");
    const $aiChatPanel = $("aiChatPanel");
    const $aiChatMessages = $("aiChatMessages");
    const $aiChatInput = $("aiChatInput");
    const $aiChatSend = $("aiChatSend");
    const $aiChatClose = $("aiChatClose");
    const $aiChatClear = $("aiChatClear");
    const $aiChatImgInput = $("aiChatImgInput");

    let aiChatHistory = [];
    let aiChatStreaming = false;
    let aiPendingImage = null; // {base64, previewEl} - pending image to send with next message

    function toggleChatPanel() {
        const isOpen = $aiChatPanel.classList.contains("show");
        if (isOpen) {
            $aiChatPanel.classList.remove("show");
            $aiFloatBtn.classList.remove("open");
        } else {
            $aiChatPanel.classList.add("show");
            $aiFloatBtn.classList.add("open");
            $aiChatInput.focus();
        }
    }

    function renderMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/`([^`]+)`/g, "<code>$1</code>")
            .replace(/\n/g, "<br>");
    }

    function appendChatMessage(role, content) {
        const welcome = $aiChatMessages.querySelector(".ai-chat-welcome");
        if (welcome) welcome.remove();

        const div = document.createElement("div");
        div.className = `ai-msg ai-msg-${role}`;
        if (role === "ai") {
            div.innerHTML = renderMarkdown(content);
        } else {
            div.textContent = content;
        }
        $aiChatMessages.appendChild(div);
        $aiChatMessages.scrollTop = $aiChatMessages.scrollHeight;
        return div;
    }

    function appendTypingIndicator() {
        const div = document.createElement("div");
        div.className = "ai-msg-typing";
        div.innerHTML = '<div class="ai-typing-dots"><span></span><span></span><span></span></div>';
        $aiChatMessages.appendChild(div);
        $aiChatMessages.scrollTop = $aiChatMessages.scrollHeight;
        return div;
    }

    async function sendChatMessage() {
        const text = $aiChatInput.value.trim();
        if ((!text && !aiPendingImage) || aiChatStreaming) return;

        // Build message content
        let userContent;
        if (aiPendingImage) {
            // Multimodal message with image + optional text
            const imgBase64 = aiPendingImage.base64;
            // Show image preview in user message
            const welcome = $aiChatMessages.querySelector(".ai-chat-welcome");
            if (welcome) welcome.remove();
            const msgDiv = document.createElement("div");
            msgDiv.className = "ai-msg ai-msg-user";
            const imgEl = document.createElement("img");
            imgEl.src = imgBase64;
            imgEl.className = "ai-img-preview";
            msgDiv.appendChild(imgEl);
            if (text) {
                const label = document.createElement("div");
                label.textContent = text;
                label.style.fontSize = "12px";
                label.style.marginTop = "4px";
                msgDiv.appendChild(label);
            }
            $aiChatMessages.appendChild(msgDiv);
            $aiChatMessages.scrollTop = $aiChatMessages.scrollHeight;

            userContent = [
                { type: "text", text: text || "请分析这张图片中的内容" },
                { type: "image_url", image_url: { url: imgBase64 } },
            ];
            // Remove preview from input area
            const previewEl = aiPendingImage.previewEl;
            if (previewEl && previewEl.parentNode) previewEl.remove();
            aiPendingImage = null;
            aiChatHistory.push({ role: "user", content: userContent });
        } else {
            appendChatMessage("user", text);
            userContent = text;
            aiChatHistory.push({ role: "user", content: text });
        }
        $aiChatInput.value = "";
        $aiChatInput.style.height = "auto";

        aiChatStreaming = true;
        $aiChatSend.disabled = true;
        const typingEl = appendTypingIndicator();

        try {
            const resp = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: aiChatHistory }),
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error || "请求失败");
            }

            typingEl.remove();
            const aiDiv = appendChatMessage("ai", "");
            let fullContent = "";

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const payload = line.slice(6).trim();
                    if (payload === "[DONE]") continue;
                    try {
                        const chunk = JSON.parse(payload);
                        if (chunk.content) {
                            fullContent += chunk.content;
                            aiDiv.innerHTML = renderMarkdown(fullContent);
                            $aiChatMessages.scrollTop = $aiChatMessages.scrollHeight;
                        }
                    } catch (e) { /* skip */ }
                }
            }

            if (fullContent) {
                aiChatHistory.push({ role: "assistant", content: fullContent });
            }
        } catch (e) {
            typingEl.remove();
            appendChatMessage("ai", "抱歉，发生了错误：" + e.message);
        } finally {
            aiChatStreaming = false;
            $aiChatSend.disabled = false;
            $aiChatInput.focus();
        }
    }

    async function previewChatImage(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            const imgBase64 = e.target.result;
            // Remove any existing preview
            if (aiPendingImage && aiPendingImage.previewEl) {
                aiPendingImage.previewEl.remove();
            }
            // Show preview in input area
            const container = document.createElement("div");
            container.className = "ai-chat-preview-container";
            container.style.cssText = "position:relative;display:inline-block;margin:4px 0;";
            const img = document.createElement("img");
            img.src = imgBase64;
            img.style.cssText = "max-width:80px;max-height:60px;border-radius:6px;border:1px solid #ddd;";
            container.appendChild(img);
            const removeBtn = document.createElement("span");
            removeBtn.textContent = "✕";
            removeBtn.style.cssText = "position:absolute;top:-4px;right:-4px;background:#999;color:#fff;border-radius:50%;width:16px;height:16px;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;";
            removeBtn.onclick = function () {
                container.remove();
                aiPendingImage = null;
            };
            container.appendChild(removeBtn);
            $aiChatInput.parentNode.insertBefore(container, $aiChatInput);
            aiPendingImage = { base64: imgBase64, previewEl: container };
            $aiChatInput.focus();
            $aiChatInput.placeholder = "输入问题后按回车发送图片...";
        };
        reader.readAsDataURL(file);
    }

    $aiFloatBtn.addEventListener("click", toggleChatPanel);
    $aiChatClose.addEventListener("click", toggleChatPanel);
    $aiChatSend.addEventListener("click", sendChatMessage);
    $aiChatInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
    $aiChatInput.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 100) + "px";
    });
    $aiChatClear.addEventListener("click", function () {
        aiChatHistory = [];
        $aiChatMessages.innerHTML = '<div class="ai-chat-welcome"><div class="ai-chat-welcome-icon">🤖</div><div>你好！我是AI基金助手</div><div style="margin-top:4px;">可以问我任何基金投资相关的问题</div></div>';
    });
    $aiChatImgInput.addEventListener("change", function () {
        if (this.files[0]) previewChatImage(this.files[0]);
        this.value = "";
    });

    // --- Init ---
    async function init() {
        updateMarketStatus(); setInterval(updateMarketStatus, 60000);
        renderFundList();
        await fetchAllFundData(); await fetchAllSignals();
        renderFundList(); renderSummary();
        startAutoRefresh();
        fetchRecommendations(); fetchMetalPrices(); fetchMarketIndex(); fetchAlerts(); fetchSectors();
        setInterval(fetchMetalPrices, 60000); setInterval(fetchMarketIndex, 30000); setInterval(checkAlerts, 60000); setInterval(fetchSectors, 120000);
    }
    init();
})();

/**
 * 智能定投模拟器模块 V3
 *
 * 功能：时间区间选择、策略多选、策略介绍、资产增长对比折线图、收益率柱状图、汇总对比表格
 */
import { holdings, fundDataCache } from './state.js';
import { fmtMoney, fmtPlain, colorCls, showToast } from './utils.js';

const STRATEGIES = {
    fixed: { key: "fixed", label: "普通定投", icon: "📌", color: "#1a73e8",
        desc: "最简单的定投方式，每期投入固定金额。不择时、不择额，利用「微笑曲线」摊平成本，适合新手入门。" },
    smart: { key: "smart", label: "慧定投", icon: "📈", color: "#e74c3c",
        desc: "基于均线策略，净值低于均线时加大投入（最多2倍），高于均线时减少投入（最少30%）。低位多买、高位少买，增强收益弹性。" },
    value: { key: "value", label: "价值平均法", icon: "⚖️", color: "#27ae60",
        desc: "设定账户每期目标增长额，实际投入 = 目标市值 - 当前市值。涨多了少投甚至不投，跌多了多投。纪律性最强，追求资产匀速增长。" },
};

const TIME_RANGES = [
    { key: "1m", label: "1个月" },
    { key: "3m", label: "3个月" },
    { key: "6m", label: "6个月" },
    { key: "1y", label: "1年" },
    { key: "2y", label: "2年" },
    { key: "3y", label: "3年" },
    { key: "all", label: "全部" },
];

let chartLineInstance = null;
let chartBarInstance = null;

/**
 * 渲染定投模拟器页面
 */
export function renderBacktest(container) {
    let html = '<div class="backtest-page">';

    // 输入表单
    html += `<div class="backtest-form">
        <div class="section-title">智能定投模拟器</div>
        <div class="backtest-form-grid">
            <div class="backtest-field">
                <label class="backtest-label">基金代码</label>
                <input type="text" id="btCode" class="add-input" placeholder="6位代码" maxlength="6" inputmode="numeric">
                <div class="backtest-hint" id="btCodeHint"></div>
            </div>
            <div class="backtest-field">
                <label class="backtest-label">每期金额（元）</label>
                <input type="number" id="btAmount" class="add-input" value="1000" min="100" step="100" inputmode="decimal">
            </div>
            <div class="backtest-field">
                <label class="backtest-label">定投频率</label>
                <select id="btFrequency" class="add-input">
                    <option value="weekly">每周</option>
                    <option value="biweekly">每两周</option>
                    <option value="monthly" selected>每月</option>
                </select>
            </div>
        </div>

        <div class="backtest-field" style="margin-top:8px">
            <label class="backtest-label">时间区间</label>
            <div class="bt-time-range" id="btTimeRange">
                ${TIME_RANGES.map(r =>
                    `<button class="bt-range-btn${r.key === '3m' ? ' active' : ''}" data-range="${r.key}">${r.label}</button>`
                ).join('')}
            </div>
        </div>

        <div class="backtest-field" style="margin-top:8px">
            <label class="backtest-label">选择策略（可多选）</label>
            <div class="bt-strategy-selector" id="btStrategySelector">
                ${Object.values(STRATEGIES).map(s =>
                    `<button class="bt-strategy-btn active" data-strategy="${s.key}">
                        <span class="bt-strategy-icon">${s.icon}</span>
                        <span class="bt-strategy-name">${s.label}</span>
                        <span class="bt-strategy-check">✓</span>
                    </button>`
                ).join('')}
            </div>
        </div>

        <button class="btn btn-primary" id="btnBacktest" style="margin-top:10px">开始回测</button>
    </div>`;

    // 策略介绍折叠面板
    html += `<details class="bt-info-panel">
        <summary class="bt-info-summary">了解三种定投策略</summary>
        <div class="bt-info-content">
            ${Object.values(STRATEGIES).map(s =>
                `<div class="bt-info-item">
                    <div class="bt-info-title" style="color:${s.color}">${s.icon} ${s.label}</div>
                    <div class="bt-info-desc">${s.desc}</div>
                </div>`
            ).join('')}
        </div>
    </details>`;

    // 持仓快捷选择
    if (holdings.length > 0) {
        html += `<div class="backtest-quick">
            <div class="backtest-quick-label">从持仓选择：</div>`;
        holdings.forEach(h => {
            const fd = fundDataCache[h.code];
            html += `<button class="compare-quick-btn backtest-quick-btn" data-code="${h.code}">${(fd ? fd.name : h.code).substring(0, 8)}</button>`;
        });
        html += `</div>`;
    }

    // 回测结果区
    html += `<div id="backtestResults"></div>`;

    html += '</div>';
    container.innerHTML = html;

    // 事件绑定
    const codeInput = container.querySelector("#btCode");
    const btnRun = container.querySelector("#btnBacktest");

    container.querySelectorAll(".backtest-quick-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            codeInput.value = btn.dataset.code;
            updateCodeHint(btn.dataset.code);
        });
    });

    codeInput.addEventListener("input", () => updateCodeHint(codeInput.value.trim()));

    // 时间区间切换
    container.querySelectorAll(".bt-range-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            container.querySelectorAll(".bt-range-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    // 策略选择切换
    container.querySelectorAll(".bt-strategy-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const active = container.querySelectorAll(".bt-strategy-btn.active");
            if (active.length === 1 && btn.classList.contains("active")) {
                showToast("至少选择一种策略");
                return;
            }
            btn.classList.toggle("active");
            const check = btn.querySelector(".bt-strategy-check");
            check.style.display = btn.classList.contains("active") ? "" : "none";
        });
    });

    btnRun.addEventListener("click", () => runBacktest(container));
}

function updateCodeHint(code) {
    const hint = document.getElementById("btCodeHint");
    if (!hint) return;
    const fd = fundDataCache[code];
    if (fd) {
        hint.textContent = fd.name;
        hint.style.color = "var(--primary)";
    } else {
        hint.textContent = "";
    }
}

function getSelectedStrategies(container) {
    return Array.from(container.querySelectorAll(".bt-strategy-btn.active")).map(b => b.dataset.strategy);
}

function getActiveTimeRange(container) {
    const btn = container.querySelector(".bt-range-btn.active");
    return btn ? btn.dataset.range : "3m";
}

async function runBacktest(container) {
    const code = container.querySelector("#btCode").value.trim();
    const amount = parseFloat(container.querySelector("#btAmount").value) || 1000;
    const frequency = container.querySelector("#btFrequency").value;
    const timeRange = getActiveTimeRange(container);
    const strategies = getSelectedStrategies(container);

    if (!/^\d{6}$/.test(code)) { showToast("请输入6位基金代码"); return; }
    if (!strategies.length) { showToast("请至少选择一种策略"); return; }

    const btn = container.querySelector("#btnBacktest");
    btn.disabled = true;
    btn.textContent = "回测中...";

    const resultsDiv = container.querySelector("#backtestResults");
    resultsDiv.innerHTML = '<div class="panel-loading"><span class="spinner"></span>正在计算回测数据...</div>';

    try {
        const r = await fetch("/api/backtest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, amount, frequency, strategies, time_range: timeRange }),
        });
        const data = await r.json();
        if (data.error) {
            resultsDiv.innerHTML = `<div class="panel-loading" style="color:var(--up)">${data.error}</div>`;
        } else {
            renderBacktestResults(resultsDiv, data, strategies);
        }
    } catch (e) {
        resultsDiv.innerHTML = '<div class="panel-loading" style="color:var(--up)">回测请求失败</div>';
    }

    btn.disabled = false;
    btn.textContent = "开始回测";
}

/* ============================================================
 * 结果渲染
 * ============================================================ */

function renderBacktestResults(container, data, activeKeys) {
    const freqLabel = { weekly: "每周", biweekly: "每两周", monthly: "每月" };
    const rangeLabel = { "1m": "1个月", "3m": "3个月", "6m": "6个月", "1y": "1年", "2y": "2年", "3y": "3年", all: "全部" };
    const n = activeKeys.length;
    const gridClass = n === 1 ? "bt-grid-1" : n === 2 ? "bt-grid-2" : "bt-grid-3";

    let html = `<div class="backtest-results">
        <div class="backtest-header">
            <div class="backtest-title">回测结果</div>
            <div class="backtest-meta">${rangeLabel[data.time_range] || data.time_range} · ${freqLabel[data.frequency] || data.frequency} · 每期${data.amount}元</div>
        </div>`;

    // 策略卡片
    html += `<div class="backtest-compare ${gridClass}">`;
    activeKeys.forEach((key, i) => {
        const result = data.results[key];
        if (!result || result.error) return;
        const s = result.summary;
        const cfg = STRATEGIES[key];
        const maxDD = s.max_drawdown != null ? s.max_drawdown.toFixed(2) : "0.00";
        html += `<div class="backtest-card bt-card-anim" style="animation-delay:${i * 100}ms">
            <div class="backtest-card-title" style="color:${cfg.color}">${cfg.icon} ${result.strategy}</div>
            <div class="backtest-card-row"><span>总投入</span><span class="backtest-val">${fmtMoney(s.total_invested)}元</span></div>
            <div class="backtest-card-row"><span>最终市值</span><span class="backtest-val ${colorCls(s.profit)}">${fmtMoney(s.final_value)}元</span></div>
            <div class="backtest-card-row bt-row-profit"><span>总收益</span><span class="backtest-val ${colorCls(s.profit)}">${fmtMoney(s.profit)}元</span></div>
            <div class="backtest-card-row"><span>收益率</span><span class="backtest-val ${colorCls(s.profit_pct)}">${fmtMoney(s.profit_pct)}%</span></div>
            <div class="backtest-card-row"><span>持有期间最大回撤</span><span class="backtest-val" style="color:var(--up)">${maxDD}%</span></div>
            <div class="backtest-card-row"><span>平均成本</span><span class="backtest-val">${s.avg_cost}</span></div>
            <div class="backtest-card-row"><span>定投期数</span><span class="backtest-val">${s.periods}期</span></div>
        </div>`;
    });
    html += `</div>`;

    // 汇总对比表格
    html += buildSummaryTable(data, activeKeys);

    // 资产增长对比折线图
    html += `<div class="analysis-section" style="margin-top:10px">
        <div class="section-title">资产增长对比</div>
        <div class="backtest-chart-wrap" style="height:260px"><canvas id="backtestLineChart"></canvas></div>
    </div>`;

    // 收益率柱状图
    html += `<div class="analysis-section" style="margin-top:10px">
        <div class="section-title">收益率对比</div>
        <div class="backtest-chart-wrap"><canvas id="backtestBarChart"></canvas></div>
    </div>`;

    html += `</div>`;
    container.innerHTML = html;

    setTimeout(() => {
        try { drawLineChart(data, activeKeys); } catch(e) { console.error('LINE_CHART_ERR:', e.message, e.stack); }
        try { drawBarChart(data, activeKeys); } catch(e) { console.error('BAR_CHART_ERR:', e.message, e.stack); }
    }, 50);
}

/* ============================================================
 * 汇总对比表格
 * ============================================================ */

function buildSummaryTable(data, activeKeys) {
    const rows = [
        { label: "总投入", key: "total_invested", fmt: v => fmtPlain(v) + "元", best: null, highlight: false },
        { label: "最终市值", key: "final_value", fmt: v => fmtPlain(v) + "元", best: "max", highlight: false },
        { label: "总收益", key: "profit", fmt: v => fmtMoney(v) + "元", best: "max", highlight: true },
        { label: "收益率", key: "profit_pct", fmt: v => fmtMoney(v) + "%", best: "max", highlight: false },
        { label: "持有期间最大回撤", key: "_maxdd", fmt: v => v + "%", best: "min", highlight: false },
        { label: "平均成本", key: "avg_cost", fmt: v => Number(v).toFixed(4), best: "min", highlight: false },
        { label: "定投期数", key: "periods", fmt: v => v + "期", best: null, highlight: false },
    ];

    // Read max drawdown from backend results
    const maxDDMap = {};
    activeKeys.forEach(key => {
        const result = data.results[key];
        if (result && !result.error) {
            maxDDMap[key] = result.summary.max_drawdown || 0;
        }
    });

    let html = `<div class="bt-summary-table-wrap"><table class="bt-summary-table">
        <thead><tr><th>指标</th>`;

    activeKeys.forEach(key => {
        const r = data.results[key];
        if (!r || r.error) return;
        html += `<th style="color:${STRATEGIES[key].color}">${STRATEGIES[key].icon} ${r.strategy}</th>`;
    });
    // 差额列：以第一个策略为基准，显示其他策略与基准的差值
    if (activeKeys.length >= 2) {
        const baseKey = activeKeys[0];
        const baseName = STRATEGIES[baseKey].label;
        activeKeys.slice(1).forEach(key => {
            const r = data.results[key];
            if (!r || r.error) return;
            html += `<th class="bt-diff-header">${STRATEGIES[key].label} vs ${baseName}</th>`;
        });
    }
    html += `</tr></thead><tbody>`;

    rows.forEach(row => {
        const rowClass = row.highlight ? ' class="bt-row-highlight"' : '';
        html += `<tr${rowClass}><td class="bt-tbl-label">${row.label}</td>`;

        // Find best value
        let bestVal = null;
        if (row.best) {
            const vals = activeKeys.map(key => {
                const r = data.results[key];
                if (!r || r.error) return null;
                return row.key === "_maxdd" ? maxDDMap[key] : r.summary[row.key];
            }).filter(v => v !== null);
            bestVal = row.best === "max" ? Math.max(...vals) : Math.min(...vals);
        }

        const cellVals = [];
        activeKeys.forEach(key => {
            const r = data.results[key];
            if (!r || r.error) { html += `<td>-</td>`; cellVals.push(null); return; }
            const val = row.key === "_maxdd" ? maxDDMap[key] : r.summary[row.key];
            cellVals.push(val);
            const isBest = bestVal !== null && val === bestVal && activeKeys.filter(k => {
                const rr = data.results[k];
                if (!rr || rr.error) return false;
                const v = row.key === "_maxdd" ? maxDDMap[k] : rr.summary[row.key];
                return v === bestVal;
            }).length === 1;
            html += `<td class="${isBest ? 'bt-best' : ''}">${row.fmt(val)}</td>`;
        });

        // 差额列：以第一个策略为基准，显示每个策略与基准的差值
        if (activeKeys.length >= 2) {
            const baseVal = cellVals[0];
            activeKeys.slice(1).forEach((key, i) => {
                if (baseVal === null || cellVals[i + 1] === null) {
                    html += `<td class="bt-diff-cell">-</td>`;
                    return;
                }
                const diff = cellVals[i + 1] - baseVal;
                const unit = row.key === 'profit_pct' || row.key === '_maxdd' ? '%' : row.key === 'periods' ? '期' : row.key === 'avg_cost' ? '' : '元';
                let formatted;
                if (row.key === 'periods') {
                    formatted = (diff >= 0 ? '+' : '') + Math.round(diff);
                } else if (row.key === '_maxdd' || row.key === 'profit_pct') {
                    formatted = (diff >= 0 ? '+' : '') + diff.toFixed(2);
                } else if (row.key === 'avg_cost') {
                    formatted = (diff >= 0 ? '+' : '') + diff.toFixed(4);
                } else {
                    formatted = fmtMoney(diff);
                }
                const diffCls = diff > 0 ? 'bt-diff-pos' : diff < 0 ? 'bt-diff-neg' : '';
                html += `<td class="bt-diff-cell ${diffCls}">${formatted}${unit}</td>`;
            });
        }
        html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    return html;
}

/* ============================================================
 * 折线图 — 资产增长对比（带十字准线）
 * ============================================================ */

function drawLineChart(data, activeKeys) {
    const canvas = document.getElementById("backtestLineChart");
    if (!canvas) return;
    if (chartLineInstance) chartLineInstance.destroy();

    const datasets = [];
    activeKeys.forEach((key, ki) => {
        const result = data.results[key];
        if (!result || result.error) return;
        const cfg = STRATEGIES[key];
        const details = result.details;
        if (!details || !details.length) return;

        // 计算每个时间点的累计资产市值
        let cumShares = 0;
        const points = details.map(d => {
            cumShares += d.shares || 0;
            return { x: +d.date, y: parseFloat((cumShares * d.nav).toFixed(2)) };
        });

        datasets.push({
            label: result.strategy,
            data: points,
            borderColor: cfg.color,
            backgroundColor: cfg.color + "15",
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.3,
        });
    });

    if (!datasets.length) return;

    // 对齐到同一X轴
    const allDates = [...new Set(datasets.flatMap(ds => ds.data.map(p => p.x)))].sort((a,b) => a - b);

    chartLineInstance = new window.Chart(canvas, {
        type: "line",
        data: {
            labels: allDates.map(d => new Date(d)),
            datasets: datasets.map(ds => ({
                ...ds,
                data: allDates.map(date => {
                    const pt = ds.data.find(p => p.x === date);
                    return pt ? pt.y : null;
                }),
                spanGaps: true,
            })),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 1500, easing: "easeOutQuart" },
            plugins: {
                legend: {
                    display: true,
                    position: "top",
                    labels: { usePointStyle: true, pointStyle: "circle", padding: 12, font: { size: 11 } },
                },
                title: { display: false },
                tooltip: {
                    mode: "index",
                    intersect: false,
                    callbacks: {
                        title: items => {
                            if (items.length) {
                                const d = new Date(items[0].parsed.x || items[0].label);
                                return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
                            }
                            return "";
                        },
                        label: item => item.dataset.label + ": " + fmtMoney(item.parsed.y) + "元",
                    },
                },
            },
            scales: {
                x: {
                    type: "time",
                    time: { unit: "month", displayFormats: { month: "M月" } },
                    ticks: { maxTicksLimit: 8, font: { size: 10 } },
                    grid: { display: false },
                    title: { display: true, text: "日期", font: { size: 11 }, color: "#888" },
                },
                y: {
                    ticks: {
                        maxTicksLimit: 6,
                        font: { size: 10 },
                        callback: v => v >= 10000 ? (v / 10000).toFixed(1) + "万" : v,
                    },
                    grid: { color: "#f0f0f0" },
                    title: { display: true, text: "资产价值（元）", font: { size: 11 }, color: "#888" },
                },
            },
            interaction: { mode: "nearest", axis: "x" },
            onHover(event, elements, chart) {
                const { x, y } = event.native ? { x: event.native.offsetX, y: event.native.offsetY } : { x: 0, y: 0 };
                chart._crosshair = { x, y };
                chart.draw();
            },
        },
    });

    // 十字准线插件已全局注册（chart-config.js），自动生效
    canvas.addEventListener("mouseleave", () => {
        if (chartLineInstance) { chartLineInstance._crosshair = null; chartLineInstance.draw(); }
    });
}

/* ============================================================
 * 柱状图 — 收益率对比
 * ============================================================ */

function drawBarChart(data, activeKeys) {
    const canvas = document.getElementById("backtestBarChart");
    if (!canvas) return;
    if (chartBarInstance) chartBarInstance.destroy();

    const labels = [];
    const values = [];
    const bgColors = [];
    const borderColors = [];

    activeKeys.forEach(key => {
        const result = data.results[key];
        if (!result || result.error) return;
        labels.push(result.strategy);
        values.push(result.summary.profit_pct);
        bgColors.push(STRATEGIES[key].color + "88");
        borderColors.push(STRATEGIES[key].color);
    });

    if (!labels.length) return;

    chartBarInstance = new window.Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "收益率%",
                data: values,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1,
                borderRadius: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 1200, easing: "easeOutQuart" },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: item => "收益率: " + fmtMoney(item.parsed.y) + "%" },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => v + "%", font: { size: 10 } },
                    grid: { color: "#f0f0f0" },
                },
                x: {
                    ticks: { font: { size: 11 } },
                    grid: { display: false },
                },
            },
        },
    });

    // 在柱子顶部/底部绘制百分比标签
    const originalDraw = chartBarInstance.draw.bind(chartBarInstance);
    chartBarInstance.draw = function () {
        originalDraw();
        const ctx = this.ctx;
        ctx.save();
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        this.data.datasets[0].data.forEach((val, i) => {
            const meta = this.getDatasetMeta(0);
            const bar = meta.data[i];
            if (bar) {
                ctx.fillStyle = borderColors[i];
                if (val >= 0) {
                    ctx.textBaseline = "bottom";
                    ctx.fillText(fmtMoney(val) + "%", bar.x, bar.y - 4);
                } else {
                    ctx.textBaseline = "top";
                    ctx.fillText(fmtMoney(val) + "%", bar.x, bar.y + 4);
                }
            }
        });
        ctx.restore();
    };
    chartBarInstance.draw();
}

/**
 * 定投模拟器CSS
 */
export const BACKTEST_CSS = `
.backtest-page { display: flex; flex-direction: column; gap: 10px; }
.backtest-form { background: var(--card); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow); }
.backtest-form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
.backtest-field { display: flex; flex-direction: column; gap: 3px; }
.backtest-label { font-size: 10px; color: var(--text2); font-weight: 500; }
.backtest-hint { font-size: 10px; min-height: 14px; }
.backtest-quick { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.backtest-quick-label { font-size: 11px; color: var(--text3); white-space: nowrap; }
.backtest-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.backtest-title { font-size: 14px; font-weight: 700; }
.backtest-meta { font-size: 11px; color: var(--text3); }
.backtest-compare { display: grid; gap: 8px; }
.bt-grid-3 { grid-template-columns: repeat(3, 1fr); }
.bt-grid-2 { grid-template-columns: repeat(2, 1fr); }
.bt-grid-1 { grid-template-columns: 1fr; }
.backtest-card { background: var(--card); border-radius: var(--radius); padding: 10px; box-shadow: var(--shadow); }
.backtest-card-title { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
.backtest-card-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; color: var(--text2); }
.bt-row-profit { background: linear-gradient(90deg, rgba(255,152,0,0.08), transparent); border-radius: 4px; padding: 3px 4px; margin: 2px -4px; }
.backtest-val { font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
.backtest-chart-wrap { height: 180px; position: relative; }

/* 时间区间选择器 */
.bt-time-range { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 3px; }
.bt-range-btn {
    padding: 4px 10px; border-radius: 12px; border: 1px solid var(--border, #ddd);
    background: var(--card); color: var(--text2); font-size: 11px; cursor: pointer;
    transition: all 0.2s;
}
.bt-range-btn:hover { border-color: var(--primary); color: var(--primary); }
.bt-range-btn.active {
    background: var(--primary); color: #fff; border-color: var(--primary);
}

/* 策略选择器 */
.bt-strategy-selector { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 3px; }
.bt-strategy-btn {
    display: flex; align-items: center; gap: 4px; padding: 6px 12px;
    border-radius: 8px; border: 1.5px solid var(--border, #ddd);
    background: var(--card); color: var(--text2); font-size: 11px;
    cursor: pointer; transition: all 0.2s; user-select: none;
}
.bt-strategy-btn:hover { border-color: var(--primary); }
.bt-strategy-btn.active {
    border-color: var(--primary); background: var(--primary-bg, #e8f0fe); color: var(--primary);
}
.bt-strategy-icon { font-size: 14px; }
.bt-strategy-name { font-weight: 600; }
.bt-strategy-check { font-size: 11px; color: var(--primary); }

/* 策略介绍面板 */
.bt-info-panel {
    background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow);
    overflow: hidden;
}
.bt-info-summary {
    padding: 10px 12px; font-size: 12px; font-weight: 600; color: var(--primary);
    cursor: pointer; list-style: none;
}
.bt-info-summary::before { content: "▸ "; }
.bt-info-panel[open] .bt-info-summary::before { content: "▾ "; }
.bt-info-content { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.bt-info-item { padding: 8px; border-radius: 6px; background: var(--bg, #f8f9fa); }
.bt-info-title { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
.bt-info-desc { font-size: 11px; color: var(--text2); line-height: 1.6; }

/* 卡片入场动画 */
@keyframes btFadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
}
.bt-card-anim {
    animation: btFadeInUp 0.4s ease-out both;
}

/* 汇总对比表格 */
.bt-summary-table-wrap { overflow-x: auto; margin-top: 10px; border-radius: var(--radius); box-shadow: var(--shadow); }
.bt-summary-table {
    width: 100%; border-collapse: collapse; font-size: 13px;
    background: var(--card);
}
.bt-summary-table th, .bt-summary-table td {
    padding: 8px 14px; text-align: center;
}
.bt-summary-table th {
    background: #f0f4f8; font-weight: 600; color: var(--text2); border-bottom: 2px solid var(--border, #e0e0e0);
}
.bt-summary-table td {
    border-bottom: 1px solid #f0f0f0;
    font-variant-numeric: tabular-nums;
}
.bt-summary-table tbody tr:nth-child(even) { background: #fafbfc; }
.bt-summary-table tbody tr:hover { background: var(--primary-bg, #e8f0fe); }
.bt-tbl-label { text-align: left; font-weight: 600; color: var(--text2); white-space: nowrap; }
.bt-row-highlight { background: #fff8e1 !important; }
.bt-row-highlight td { font-weight: 600; }
.bt-best {
    font-weight: 700; color: var(--primary);
}
.bt-diff-header { color: #888 !important; font-size: 11px; }
.bt-diff-cell { font-size: 11px; color: #888; }
.bt-diff-pos { color: #e74c3c !important; font-weight: 600; }
.bt-diff-neg { color: #27ae60 !important; font-weight: 600; }

@media (max-width: 700px) {
    .backtest-form-grid { grid-template-columns: 1fr 1fr; }
    .bt-grid-3, .bt-grid-2 { grid-template-columns: 1fr; }
    .bt-time-range { gap: 3px; }
    .bt-range-btn { padding: 3px 7px; font-size: 10px; }
    .bt-strategy-selector { gap: 4px; }
    .bt-strategy-btn { padding: 4px 8px; font-size: 10px; }
    .bt-summary-table { font-size: 11px; }
    .bt-summary-table th, .bt-summary-table td { padding: 5px 8px; }
}
`;

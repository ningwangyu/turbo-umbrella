/**
 * 基金对比模块 — 选择2-3只基金并排对比
 *
 * 功能：输入补全、持仓快选、预估模块、重仓股对比（含重叠高亮）、
 *       净值走势叠加图（十字线+差额计算）
 */
import { holdings, fundDataCache, signalCache, setFundDataCache } from './state.js';
import { fmtMoney, colorCls, showToast } from './utils.js';

let compareFunds = [];       // 当前对比的基金代码列表
let compareData = {};        // {code: {perf, est, holdings}}
let searchTimer = null;      // 补全防抖计时器
let currentPeriod = "6m";    // 当前选中的周期

// ============================================================
// 数据获取
// ============================================================

/**
 * 获取对比数据：性能走势 + 估值 + 重仓股（三路并发）
 */
export async function fetchCompareData(codes) {
    compareData = {};
    const promises = codes.map(async code => {
        try {
            const [perfResp, estResp, holdResp] = await Promise.all([
                fetch(`/api/fund/performance/${code}`),
                fetch(`/api/fund/${code}`),
                fetch(`/api/fund/holdings/${code}`),
            ]);
            const perf = await perfResp.json();
            const est = await estResp.json();
            const holdData = await holdResp.json();
            compareData[code] = {
                perf,
                est,
                holdings: holdData?.holdings || [],
            };
            // 补充 fundDataCache 中的基金名称
            if (est?.name && !fundDataCache[code]?.name) {
                setFundDataCache(code, { ...(fundDataCache[code] || {}), name: est.name });
            }
        } catch (e) {
            console.error(`Compare fetch ${code}:`, e);
        }
    });
    await Promise.all(promises);
    return compareData;
}

// ============================================================
// 渲染主入口
// ============================================================

export function renderFundCompare(container) {
    let html = '<div class="fund-compare">';

    // —— 选择器区域 ——
    html += `<div class="compare-selector">
        <div class="compare-input-row">
            <div class="compare-input-wrap">
                <input type="text" id="compareFundInput" class="add-input"
                       placeholder="输入代码或名称搜索" maxlength="30" autocomplete="off">
                <div class="compare-autocomplete" id="compareAutocomplete"></div>
            </div>
            <button class="btn btn-add" id="btnAddCompare">对比</button>
        </div>
        <div class="compare-chips" id="compareChips">`;

    compareFunds.forEach(code => {
        const fd = fundDataCache[code];
        const name = fd ? fd.name : code;
        html += `<span class="compare-chip">${name}<button class="compare-chip-x" data-code="${code}">&times;</button></span>`;
    });

    html += `</div>`;

    // —— 持仓快选（始终显示，只要持仓非空且有未选中的基金） ——
    const quickFunds = holdings.filter(h => !compareFunds.includes(h.code));
    if (quickFunds.length > 0) {
        html += `<div class="holdings-quick-select">
            <span class="quick-label">从持仓添加：</span>`;
        quickFunds.forEach(h => {
            const fd = fundDataCache[h.code];
            const name = fd ? fd.name.substring(0, 8) : h.code;
            html += `<button class="compare-quick-btn" data-code="${h.code}">${name}</button>`;
        });
        html += `</div>`;
    }
    html += `</div>`;

    // —— 内容区 ——
    if (compareFunds.length < 2) {
        html += `<div class="empty-state" style="padding:30px">
            <div class="empty-icon">📊</div>
            <p>请添加至少2只基金进行对比</p>
            <p class="empty-hint">输入代码/名称搜索，或从持仓快速添加</p>
        </div>`;
    } else {
        html += `<div class="compare-results">`;

        // ① 预估模块
        html += renderEstSection();

        // ② 基本信息对比表
        html += renderInfoTable();

        // ③ 净值走势叠加图
        html += `<div class="analysis-section">
            <div class="section-title">净值走势对比</div>
            <div class="compare-chart-wrap"><canvas id="compareChart"></canvas></div>
            <div class="compare-diff-bar" id="compareDiffBar"></div>
            <div class="period-btns" style="margin-top:6px">
                <button class="period-btn" data-period="1m">1月</button>
                <button class="period-btn" data-period="3m">3月</button>
                <button class="period-btn active" data-period="6m">6月</button>
                <button class="period-btn" data-period="1y">1年</button>
                <button class="period-btn" data-period="all">全部</button>
            </div>
        </div>`;

        // ④ 重仓股对比
        html += renderHoldingsCompare();

        html += `</div>`;
    }

    html += '</div>';
    container.innerHTML = html;

    bindCompareEvents(container);

    // 渲染叠加图
    if (compareFunds.length >= 2 && Object.keys(compareData).length >= 2) {
        requestAnimationFrame(() => renderCompareChart(currentPeriod));
    }
}

// ============================================================
// 子渲染：预估模块
// ============================================================

function renderEstSection() {
    let html = `<div class="analysis-section"><div class="section-title">实时预估</div>
        <div class="est-cards">`;

    compareFunds.forEach(code => {
        const d = compareData[code];
        const fd = fundDataCache[code];
        const name = fd ? fd.name.substring(0, 8) : code;
        const chg = d?.est?.estimated_change_pct;
        const estNav = d?.est?.estimated_nav;
        const estTime = d?.est?.estimation_time || "";
        const chgNum = chg != null ? parseFloat(chg) : null;

        // 如果用户持有该基金，计算预估收益
        const h = holdings.find(h => h.code === code);
        let estProfit = null;
        if (h && chgNum != null) {
            estProfit = (h.value * chgNum / 100).toFixed(2);
        }

        html += `<div class="est-card">
            <div class="est-card-name">${name}</div>
            <div class="est-card-nav">${estNav || "--"}</div>
            <div class="est-card-chg ${chgNum != null ? colorCls(chgNum) : ""}">${chgNum != null ? fmtMoney(chgNum) + "%" : "--"}</div>
            ${estProfit != null ? `<div class="est-card-profit ${colorCls(estProfit)}">预估收益 ${estProfit > 0 ? "+" : ""}${estProfit}元</div>` : ""}
            ${estTime ? `<div class="est-card-time">${estTime}</div>` : ""}
        </div>`;
    });

    html += `</div></div>`;
    return html;
}

// ============================================================
// 子渲染：基本信息对比表
// ============================================================

function renderInfoTable() {
    let html = `<div class="analysis-section"><div class="section-title">基本信息对比</div>
        <div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>指标</th>`;
    compareFunds.forEach(code => {
        const fd = fundDataCache[code];
        html += `<th>${fd ? fd.name.substring(0, 6) : code}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // 最新净值
    html += `<tr><td>最新净值</td>`;
    compareFunds.forEach(code => {
        const d = compareData[code];
        html += `<td>${d?.est?.nav || "--"}</td>`;
    });
    html += `</tr>`;

    // 各周期收益
    const periods = { "1m": "近1月", "3m": "近3月", "6m": "近6月", "1y": "近1年" };
    for (const [k, lbl] of Object.entries(periods)) {
        html += `<tr><td>${lbl}</td>`;
        compareFunds.forEach(code => {
            const d = compareData[code];
            const ret = d?.perf?.returns?.[k];
            if (ret != null) {
                html += `<td class="${colorCls(ret)}">${fmtMoney(ret)}%</td>`;
            } else {
                html += `<td>--</td>`;
            }
        });
        html += `</tr>`;
    }

    // 信号
    html += `<tr><td>量化信号</td>`;
    compareFunds.forEach(code => {
        const sig = signalCache[code];
        if (sig && !sig.error) {
            html += `<td class="${colorCls(sig.buy_score - 50)}">${sig.signal} (${sig.buy_score})</td>`;
        } else {
            html += `<td>--</td>`;
        }
    });
    html += `</tr>`;

    html += `</tbody></table></div></div>`;
    return html;
}

// ============================================================
// 子渲染：重仓股对比
// ============================================================

function renderHoldingsCompare() {
    // 收集所有重仓股（去重）
    const allStocks = new Map(); // stockCode → {name, funds: {code: pct}}
    compareFunds.forEach(code => {
        const d = compareData[code];
        const hList = d?.holdings || [];
        hList.forEach(h => {
            if (!allStocks.has(h.code)) {
                allStocks.set(h.code, { name: h.name, funds: {} });
            }
            allStocks.get(h.code).funds[code] = h.pct;
            // 补充实时行情
            if (h.price != null) {
                allStocks.get(h.code).price = h.price;
                allStocks.get(h.code).change_pct = h.change_pct;
            }
        });
    });

    if (allStocks.size === 0) return "";

    // 按出现次数排序（重叠的排前面）
    const sorted = Array.from(allStocks.entries())
        .sort((a, b) => Object.keys(b[1].funds).length - Object.keys(a[1].funds).length);

    // 计算重叠度
    const overlapStocks = sorted.filter(([_, v]) => Object.keys(v.funds).length >= 2);
    const totalUnique = sorted.length;
    const overlapPct = totalUnique > 0 ? ((overlapStocks.length / totalUnique) * 100).toFixed(0) : 0;

    let html = `<div class="analysis-section">
        <div class="section-title">重仓股对比
            <span class="holdings-overlap-badge">重叠 ${overlapStocks.length}只 (${overlapPct}%)</span>
        </div>
        <div class="compare-table-wrap"><table class="compare-table holdings-compare-table"><thead><tr>
            <th>股票</th>`;

    compareFunds.forEach(code => {
        const fd = fundDataCache[code];
        html += `<th>${fd ? fd.name.substring(0, 6) : code}</th>`;
    });
    html += `<th>今日涨跌</th></tr></thead><tbody>`;

    sorted.forEach(([stockCode, info]) => {
        const isOverlap = Object.keys(info.funds).length >= 2;
        html += `<tr class="${isOverlap ? "holdings-overlap" : ""}">
            <td>${info.name}<span class="stock-code-hint">${stockCode}</span></td>`;

        compareFunds.forEach(code => {
            const pct = info.funds[code];
            if (pct != null) {
                html += `<td>${pct.toFixed(2)}%</td>`;
            } else {
                `<td class="flat">--</td>`;
                html += `<td class="flat">--</td>`;
            }
        });

        // 今日涨跌
        const chg = info.change_pct;
        html += `<td class="${chg != null ? colorCls(chg) : ""}">${chg != null ? fmtMoney(chg) + "%" : "--"}</td>`;
        html += `</tr>`;
    });

    html += `</tbody></table></div></div>`;
    return html;
}

// ============================================================
// 事件绑定
// ============================================================

function bindCompareEvents(container) {
    // 输入补全
    const input = container.querySelector("#compareFundInput");
    const acBox = container.querySelector("#compareAutocomplete");
    if (input && acBox) {
        input.addEventListener("input", () => {
            const q = input.value.trim();
            clearTimeout(searchTimer);
            if (q.length < 1) { acBox.classList.remove("show"); return; }
            // 如果是纯数字且6位，不触发补全
            if (/^\d{6}$/.test(q)) { acBox.classList.remove("show"); return; }
            searchTimer = setTimeout(() => doSearch(q, acBox, input, container), 300);
        });
        input.addEventListener("blur", () => setTimeout(() => acBox.classList.remove("show"), 200));
        input.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                acBox.classList.remove("show");
                addCompareFund(input.value.trim(), container);
            }
        });
    }

    // 添加对比按钮
    const btnAdd = container.querySelector("#btnAddCompare");
    if (btnAdd && input) {
        btnAdd.addEventListener("click", () => addCompareFund(input.value.trim(), container));
    }

    // 删除对比
    container.querySelectorAll(".compare-chip-x").forEach(btn => {
        btn.addEventListener("click", () => {
            compareFunds = compareFunds.filter(c => c !== btn.dataset.code);
            refreshCompare(container);
        });
    });

    // 快捷添加（持仓）
    container.querySelectorAll(".compare-quick-btn").forEach(btn => {
        btn.addEventListener("click", () => addCompareFund(btn.dataset.code, container));
    });

    // 周期切换
    container.querySelectorAll(".period-btns .period-btn").forEach(btn => {
        btn.addEventListener("click", function () {
            container.querySelectorAll(".period-btns .period-btn").forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            currentPeriod = this.dataset.period;
            renderCompareChart(currentPeriod);
        });
    });
}

// ============================================================
// 搜索补全
// ============================================================

async function doSearch(query, acBox, input, container) {
    try {
        const r = await fetch(`/api/fund/search?q=${encodeURIComponent(query)}`);
        const data = await r.json();
        if (!data.length) { acBox.classList.remove("show"); return; }

        acBox.innerHTML = data.slice(0, 6).map(f =>
            `<div class="ac-item" data-code="${f.code}">
                <span class="ac-code">${f.code}</span>
                <span class="ac-name">${f.name}</span>
                <span class="ac-type">${f.type}</span>
            </div>`
        ).join("");
        acBox.classList.add("show");

        acBox.querySelectorAll(".ac-item").forEach(item => {
            item.addEventListener("click", () => {
                input.value = "";
                acBox.classList.remove("show");
                addCompareFund(item.dataset.code, container);
            });
        });
    } catch (e) {
        console.error("Compare search:", e);
    }
}

// ============================================================
// 添加 / 刷新
// ============================================================

async function addCompareFund(code, container) {
    // 支持纯代码和名称
    let fundCode = code;

    // 如果不是6位数字，尝试搜索
    if (!/^\d{6}$/.test(fundCode)) {
        try {
            const r = await fetch(`/api/fund/search?q=${encodeURIComponent(fundCode)}`);
            const data = await r.json();
            if (data.length > 0) {
                fundCode = data[0].code;
            } else {
                showToast("未找到匹配的基金"); return;
            }
        } catch {
            showToast("搜索失败"); return;
        }
    }

    if (compareFunds.includes(fundCode)) { showToast("已在对比列表中"); return; }
    if (compareFunds.length >= 3) { showToast("最多对比3只基金"); return; }
    compareFunds.push(fundCode);
    await fetchCompareData(compareFunds);
    renderFundCompare(container);
}

async function refreshCompare(container) {
    if (compareFunds.length) {
        await fetchCompareData(compareFunds);
    }
    renderFundCompare(container);
}

// ============================================================
// 净值叠加图（十字线 + 差额）
// ============================================================

function renderCompareChart(period) {
    const canvas = document.getElementById("compareChart");
    if (!canvas) return;

    const colors = ["#1a73e8", "#e74c3c", "#27ae60"];
    const datasets = [];

    // 周期筛选
    const now = Date.now();
    const periodDays = { "1m": 30, "3m": 90, "6m": 180, "1y": 365, "all": 9999 };
    const days = periodDays[period] || 180;
    const cutoff = now - days * 86400000;

    // 收集每只基金的趋势数据
    const fundTrends = [];
    compareFunds.forEach((code, i) => {
        const d = compareData[code];
        if (!d?.perf?.trend) return;
        const fd = fundDataCache[code];
        const name = fd ? fd.name.substring(0, 8) : code;
        let trend = d.perf.trend.filter(t => Number(t.date) >= cutoff);
        if (!trend.length) return;

        const base = trend[0].nav || 1;
        const navMap = new Map();
        trend.forEach(t => {
            navMap.set(Number(t.date), round((t.nav / base) * 100, 2));
        });
        fundTrends.push({ name, navMap, color: colors[i % 3] });
    });

    if (fundTrends.length < 2) return;

    // 构建统一日期轴
    const allDates = new Set();
    fundTrends.forEach(ft => ft.navMap.forEach((_, date) => allDates.add(date)));
    const sortedDates = Array.from(allDates).sort((a, b) => a - b);

    // 插值
    fundTrends.forEach(ft => {
        const dataPoints = [];
        let lastVal = null;
        sortedDates.forEach(date => {
            const val = ft.navMap.get(date);
            if (val != null) {
                lastVal = val;
                dataPoints.push({ x: date, y: val });
            } else if (lastVal != null) {
                dataPoints.push({ x: date, y: lastVal });
            }
        });
        datasets.push({
            label: ft.name,
            data: dataPoints,
            borderColor: ft.color,
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0.3,
        });
    });

    if (!datasets.length) return;

    // 销毁旧图表
    const chartKey = "compareChartInstance";
    if (window[chartKey]) window[chartKey].destroy();

    window[chartKey] = new Chart(canvas, {
        type: "line",
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            parsing: { xAxisKey: "x", yAxisKey: "y" },
            plugins: {
                legend: { display: true, position: "top", labels: { font: { size: 10 }, boxWidth: 12 } },
                tooltip: {
                    mode: "index", intersect: false,
                    callbacks: {
                        title: (items) => {
                            if (items.length) {
                                const d = new Date(items[0].parsed.x);
                                return d.toLocaleDateString("zh-CN");
                            }
                            return "";
                        },
                        footer: (items) => {
                            // 计算基金间差额
                            if (items.length < 2) return "";
                            const vals = items.map(it => it.parsed.y);
                            const diffs = [];
                            for (let i = 0; i < vals.length; i++) {
                                for (let j = i + 1; j < vals.length; j++) {
                                    const diff = round(vals[i] - vals[j], 2);
                                    const label1 = items[i].dataset.label?.substring(0, 4) || `基金${i + 1}`;
                                    const label2 = items[j].dataset.label?.substring(0, 4) || `基金${j + 1}`;
                                    const sign = diff > 0 ? "+" : "";
                                    diffs.push(`${label1} vs ${label2}: ${sign}${diff}`);
                                }
                            }
                            return diffs.join(" | ");
                        },
                    },
                },
            },
            scales: {
                x: {
                    type: "linear",
                    display: false,
                    min: sortedDates[0],
                    max: sortedDates[sortedDates.length - 1],
                },
                y: { beginAtZero: false, grid: { color: "rgba(0,0,0,0.05)" }, ticks: { font: { size: 9 } } },
            },
            interaction: { mode: "nearest", axis: "x", intersect: false },
            onHover(event, elements, chart) {
                const { x, y } = event.native
                    ? { x: event.native.offsetX, y: event.native.offsetY }
                    : { x: 0, y: 0 };
                chart._crosshair = { x, y };
                chart.draw();
                // 更新差额信息栏
                updateDiffBar(elements, chart);
            },
        },
    });

    // 鼠标离开清除十字线
    canvas.addEventListener("mouseleave", () => {
        const chart = window[chartKey];
        if (chart) { chart._crosshair = null; chart.draw(); }
        const diffBar = document.getElementById("compareDiffBar");
        if (diffBar) diffBar.innerHTML = "";
    });
}

/**
 * 更新差额信息栏（图表下方）
 */
function updateDiffBar(elements, chart) {
    const diffBar = document.getElementById("compareDiffBar");
    if (!diffBar) return;

    if (!elements || elements.length < 2) {
        diffBar.innerHTML = "";
        return;
    }

    const activePoints = chart.tooltip?.dataPoints;
    if (!activePoints || activePoints.length < 2) {
        diffBar.innerHTML = "";
        return;
    }

    const vals = activePoints.map(dp => dp.parsed.y);
    const names = activePoints.map(dp => dp.dataset.label?.substring(0, 6) || "");

    let html = "";
    for (let i = 0; i < vals.length; i++) {
        for (let j = i + 1; j < vals.length; j++) {
            const diff = round(vals[i] - vals[j], 2);
            const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
            const sign = diff > 0 ? "+" : "";
            html += `<span class="diff-item">${names[i]} vs ${names[j]}: <span class="${cls}">${sign}${diff}</span></span>`;
        }
    }
    diffBar.innerHTML = html;
}

function round(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }

// ============================================================
// CSS
// ============================================================

export const COMPARE_CSS = `
.fund-compare { display: flex; flex-direction: column; gap: 10px; }

/* 选择器 */
.compare-selector { background: var(--card); border-radius: var(--radius); padding: 10px; box-shadow: var(--shadow); }
.compare-input-row { display: flex; gap: 6px; margin-bottom: 6px; }
.compare-input-wrap { position: relative; flex: 1; }
.compare-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.compare-chip { background: #e8f0fe; color: var(--primary); font-size: 11px; padding: 3px 8px; border-radius: 12px; display: flex; align-items: center; gap: 4px; font-weight: 500; }
.compare-chip-x { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 13px; padding: 0; line-height: 1; }

/* 补全下拉 */
.compare-autocomplete { display: none; position: absolute; top: 100%; left: 0; right: 0; background: var(--card); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); z-index: 100; max-height: 200px; overflow-y: auto; }
.compare-autocomplete.show { display: block; }
.compare-autocomplete .ac-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; font-size: 12px; border-bottom: 1px solid var(--border); }
.compare-autocomplete .ac-item:last-child { border-bottom: none; }
.compare-autocomplete .ac-item:hover { background: var(--bg); }
.compare-autocomplete .ac-code { color: var(--primary); font-weight: 600; font-size: 11px; min-width: 50px; }
.compare-autocomplete .ac-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.compare-autocomplete .ac-type { font-size: 10px; color: var(--text3); background: var(--bg); padding: 1px 5px; border-radius: 4px; }

/* 持仓快选 */
.holdings-quick-select { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); }
.quick-label { font-size: 10px; color: var(--text3); white-space: nowrap; }
.compare-quick-btn { background: none; border: 1px dashed var(--border); border-radius: 6px; padding: 4px 10px; font-size: 10px; color: var(--text2); cursor: pointer; transition: all .15s; font-family: inherit; }
.compare-quick-btn:hover { border-color: var(--primary); color: var(--primary); }

/* 对比结果 */
.compare-results { display: flex; flex-direction: column; gap: 10px; }

/* 预估卡片 */
.est-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.est-card { background: var(--bg); border-radius: 8px; padding: 10px; text-align: center; }
.est-card-name { font-size: 11px; color: var(--text3); margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.est-card-nav { font-size: 16px; font-weight: 700; color: var(--text); }
.est-card-chg { font-size: 14px; font-weight: 600; margin-top: 2px; }
.est-card-profit { font-size: 11px; margin-top: 4px; }
.est-card-time { font-size: 9px; color: var(--text3); margin-top: 2px; }

/* 对比表 */
.compare-table-wrap { overflow-x: auto; }
.compare-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.compare-table th, .compare-table td { padding: 6px 8px; text-align: center; border-bottom: 1px solid var(--border); }
.compare-table th { font-weight: 600; color: var(--text3); font-size: 10px; background: var(--bg); }
.compare-table td:first-child { text-align: left; color: var(--text2); font-weight: 500; }

/* 重仓股对比 */
.holdings-overlap-badge { font-size: 10px; font-weight: 400; color: var(--primary); background: #e8f0fe; padding: 1px 6px; border-radius: 8px; margin-left: 6px; }
.holdings-overlap { background: rgba(26,115,232,0.06); }
.holdings-overlap td:first-child { font-weight: 600; color: var(--primary); }
.stock-code-hint { font-size: 9px; color: var(--text3); margin-left: 3px; }
.holdings-compare-table td { font-size: 10px; }

/* 图表区 */
.compare-chart-wrap { height: 220px; position: relative; }
.compare-diff-bar { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; min-height: 18px; padding: 2px 0; font-size: 11px; }
.diff-item { color: var(--text2); }
.diff-item .up { color: #e74c3c; font-weight: 600; }
.diff-item .down { color: #27ae60; font-weight: 600; }
.diff-item .flat { color: var(--text3); }
`;

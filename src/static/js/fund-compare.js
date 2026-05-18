/**
 * 基金对比模块 — 选择2-3只基金并排对比
 *
 * 功能：输入补全、持仓快选、预估模块、重仓股对比（含重叠高亮）、
 *       净值走势叠加图（十字线+差额计算）
 */
import { holdings, fundDataCache, signalCache, setFundDataCache, setSignalCache } from './state.js';
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
            const [perfResp, estResp, holdResp, sigResp] = await Promise.all([
                fetch(`/api/fund/performance/${code}`),
                fetch(`/api/fund/${code}`),
                fetch(`/api/fund/holdings/${code}`),
                fetch(`/api/fund/signal/${code}`),
            ]);
            const perf = await perfResp.json();
            const est = await estResp.json();
            const holdData = await holdResp.json();
            const sigData = await sigResp.json();
            compareData[code] = {
                perf,
                est,
                holdings: holdData?.holdings || [],
            };
            if (sigData && !sigData.error) {
                setSignalCache(code, sigData);
            }
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
        html += `<div class="compare-empty-state">
            <div class="compare-empty-icon">📊</div>
            <p class="compare-empty-title">请添加至少2只基金进行对比</p>
            <p class="compare-empty-hint">输入代码/名称搜索，或从持仓快速添加</p>
        </div>`;
    } else {
        html += `<div class="compare-results">`;

        // ① 预估模块
        html += renderEstSection();

        // ② 基本信息对比表
        html += renderInfoTable();

        // ②.5 对比参考结论
        html += renderConclusionSection();

        // ③ 净值走势叠加图
        html += `<div class="analysis-section">
            <div class="section-title compare-title">净值走势对比</div>
            <div class="compare-chart-container">
                <div class="compare-chart-wrap"><canvas id="compareChart"></canvas></div>
                <div class="compare-diff-bar" id="compareDiffBar"></div>
            </div>
            <div class="compare-period-btns">
                <button class="compare-period-btn" data-period="1m">1月</button>
                <button class="compare-period-btn" data-period="3m">3月</button>
                <button class="compare-period-btn active" data-period="6m">6月</button>
                <button class="compare-period-btn" data-period="1y">1年</button>
                <button class="compare-period-btn" data-period="all">全部</button>
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
    let html = `<div class="analysis-section"><div class="section-title compare-title">实时预估</div>
        <div class="est-cards">`;

    compareFunds.forEach(code => {
        const d = compareData[code];
        const fd = fundDataCache[code];
        const name = fd ? fd.name.substring(0, 8) : code;
        const chg = d?.est?.estimated_change_pct;
        const estNav = d?.est?.estimated_nav;
        const estTime = d?.est?.estimation_time || "";
        const chgNum = chg != null ? parseFloat(chg) : null;

        const h = holdings.find(h => h.code === code);
        let estProfit = null;
        if (h && chgNum != null) {
            estProfit = (h.value * chgNum / 100).toFixed(2);
        }

        const dir = chgNum != null ? (chgNum > 0 ? "up" : chgNum < 0 ? "down" : "flat") : "flat";

        html += `<div class="est-card est-card-${dir}">
            <div class="est-card-header">
                <span class="est-card-name">${name}</span>
                ${estTime ? `<span class="est-card-time">${estTime}</span>` : ""}
            </div>
            <div class="est-card-body">
                <div class="est-card-nav">${estNav || "--"}</div>
                <div class="est-card-chg ${chgNum != null ? colorCls(chgNum) : ""}">${chgNum != null ? (chgNum > 0 ? "+" : "") + fmtMoney(chgNum) + "%" : "--"}</div>
            </div>
            ${h || estProfit != null ? `<div class="est-card-footer">
                ${h ? `<span class="est-pill est-pill-hold">持仓 ${Number(h.value).toFixed(2)}元</span>` : ""}
                ${estProfit != null ? `<span class="est-pill est-pill-profit ${colorCls(estProfit)}">${estProfit > 0 ? "+" : ""}${estProfit}元</span>` : ""}
            </div>` : ""}
        </div>`;
    });

    html += `</div></div>`;
    return html;
}

// ============================================================
// 子渲染：基本信息对比表
// ============================================================

function renderInfoTable() {
    let html = `<div class="analysis-section"><div class="section-title compare-title">基本信息对比</div>
        <div class="compare-table-wrap"><table class="compare-table compare-table-styled"><thead><tr><th>指标</th>`;
    compareFunds.forEach(code => {
        const fd = fundDataCache[code];
        html += `<th class="compare-th-fund">${fd ? fd.name.substring(0, 6) : code}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // 最新净值
    html += `<tr><td class="compare-td-label">最新净值</td>`;
    compareFunds.forEach(code => {
        const d = compareData[code];
        html += `<td class="compare-td-nav">${d?.est?.nav || "--"}</td>`;
    });
    html += `</tr>`;

    // 各周期收益
    const periods = { "1m": "近1月", "3m": "近3月", "6m": "近6月", "1y": "近1年" };
    for (const [k, lbl] of Object.entries(periods)) {
        html += `<tr><td class="compare-td-label">${lbl}</td>`;
        compareFunds.forEach(code => {
            const d = compareData[code];
            const ret = d?.perf?.returns?.[k];
            if (ret != null) {
                const cls = colorCls(ret);
                html += `<td><span class="compare-badge compare-badge-${cls}">${fmtMoney(ret)}%</span></td>`;
            } else {
                html += `<td class="compare-td-empty">--</td>`;
            }
        });
        html += `</tr>`;
    }

    // 信号
    html += `<tr><td class="compare-td-label">量化信号</td>`;
    compareFunds.forEach(code => {
        const sig = signalCache[code];
        if (sig && !sig.error) {
            const sCls = sig.buy_score >= 55 ? "up" : sig.buy_score <= 45 ? "down" : "flat";
            html += `<td class="signal-cell" data-code="${code}" title="点击查看详情">
                <span class="compare-signal-badge compare-signal-${sCls}">
                    <span class="compare-signal-text">${sig.signal}</span>
                    <span class="compare-signal-score">${sig.buy_score}</span>
                </span>
            </td>`;
        } else {
            html += `<td class="compare-td-empty">--</td>`;
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
        <div class="section-title compare-title">重仓股对比
            <span class="compare-overlap-badge">重叠 ${overlapStocks.length}只 (${overlapPct}%)</span>
        </div>
        <div class="compare-table-wrap"><table class="compare-table compare-table-styled holdings-compare-table"><thead><tr>
            <th class="compare-th-sticky">股票</th>`;

    compareFunds.forEach(code => {
        const fd = fundDataCache[code];
        html += `<th class="compare-th-fund compare-th-sticky">${fd ? fd.name.substring(0, 6) : code}</th>`;
    });
    html += `<th class="compare-th-sticky">今日涨跌</th></tr></thead><tbody>`;

    sorted.forEach(([stockCode, info]) => {
        const isOverlap = Object.keys(info.funds).length >= 2;
        const rowCls = isOverlap ? "holdings-row-overlap" : "holdings-row-single";
        const dotCls = isOverlap ? "holdings-dot-overlap" : "holdings-dot-single";
        html += `<tr class="${rowCls}">
            <td class="compare-td-label"><span class="holdings-dot ${dotCls}"></span>${info.name}<span class="stock-code-hint">${stockCode}</span></td>`;

        compareFunds.forEach(code => {
            const pct = info.funds[code];
            if (pct != null) {
                html += `<td>${pct.toFixed(2)}%</td>`;
            } else {
                html += `<td class="compare-td-empty">--</td>`;
            }
        });

        // 今日涨跌
        const chg = info.change_pct;
        if (chg != null) {
            const cls = colorCls(chg);
            html += `<td><span class="compare-badge compare-badge-${cls}">${fmtMoney(chg)}%</span></td>`;
        } else {
            html += `<td class="compare-td-empty">--</td>`;
        }
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
    container.querySelectorAll(".compare-period-btns .compare-period-btn").forEach(btn => {
        btn.addEventListener("click", function () {
            container.querySelectorAll(".compare-period-btns .compare-period-btn").forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            currentPeriod = this.dataset.period;
            renderCompareChart(currentPeriod);
        });
    });

    // 信号单元格点击
    container.querySelectorAll(".signal-cell").forEach(cell => {
        cell.addEventListener("click", () => openSignalModal(cell.dataset.code));
    });
}

// ============================================================
// 量化信号弹窗
// ============================================================

function openSignalModal(code) {
    const sig = signalCache[code];
    if (!sig || sig.error) return;

    // 移除已有弹窗
    closeSignalModal();

    const fd = fundDataCache[code];
    const name = fd ? fd.name : code;
    const sLabel = sig.signal_en === "strong_buy" || sig.signal_en === "buy" ? "buy"
        : sig.signal_en === "strong_sell" || sig.signal_en === "sell" ? "sell" : "hold";

    let html = '<div class="detail-signal">';
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

    // 参考结论
    const conclusion = generateSignalConclusion(sig);
    html += `<div class="signal-conclusion">${conclusion}</div>`;
    html += '</div>';

    const mask = document.createElement("div");
    mask.className = "modal-mask show";
    mask.id = "compareSignalModal";
    mask.innerHTML = `<div class="modal" style="max-width:520px;">
        <div class="modal-top"><h3>${name} 量化信号详情</h3><button class="modal-close" id="compareSignalClose">&times;</button></div>
        <div class="signal-modal-body">${html}</div>
    </div>`;

    document.body.appendChild(mask);

    mask.querySelector("#compareSignalClose").addEventListener("click", closeSignalModal);
    mask.addEventListener("click", e => { if (e.target === mask) closeSignalModal(); });
}

function closeSignalModal() {
    const m = document.getElementById("compareSignalModal");
    if (m) m.remove();
}

function generateSignalConclusion(sig) {
    const bullish = sig.factors.filter(f => f.score >= 55).length;
    const bearish = sig.factors.filter(f => f.score <= 45).length;
    const total = sig.factors.length;

    let text = "";
    if (sig.buy_score >= 70) {
        text = `${total}项指标中${bullish}项看多、${bearish}项看空，多头信号占优。当前买入评分${sig.buy_score}分，处于偏高区间，综合判断倾向买入。`;
    } else if (sig.buy_score >= 55) {
        text = `${total}项指标中${bullish}项看多、${bearish}项看空，信号偏多但不强烈。当前买入评分${sig.buy_score}分，可适量关注，注意控制仓位。`;
    } else if (sig.buy_score >= 45) {
        text = `${total}项指标中${bullish}项看多、${bearish}项看空，多空分歧不大。当前买入评分${sig.buy_score}分，建议观望为主，等待更明确信号。`;
    } else if (sig.buy_score >= 30) {
        text = `${total}项指标中${bullish}项看多、${bearish}项看空，空头信号占优。当前买入评分${sig.buy_score}分，综合判断倾向卖出，建议减仓规避风险。`;
    } else {
        text = `${total}项指标中${bullish}项看多、${bearish}项看空，空头信号强烈。当前买入评分${sig.buy_score}分，建议尽快卖出止损。`;
    }
    return text;
}

// ============================================================
// 对比参考结论
// ============================================================

function renderConclusionSection() {
    if (compareFunds.length < 2) return "";

    const periodLabels = { "1m": "近1月", "3m": "近3月", "6m": "近6月", "1y": "近1年" };
    const items = [];

    // 各周期收益率排名
    for (const [k, lbl] of Object.entries(periodLabels)) {
        let best = null, bestVal = -Infinity;
        compareFunds.forEach(code => {
            const d = compareData[code];
            const ret = d?.perf?.returns?.[k];
            if (ret != null && ret > bestVal) { bestVal = ret; best = code; }
        });
        if (best) {
            const fd = fundDataCache[best];
            items.push(`${lbl}收益最优：<strong>${fd ? fd.name.substring(0, 8) : best}</strong>（${fmtMoney(bestVal)}%）`);
        }
    }

    // 量化信号排名
    let bestSig = null, worstSig = null, bestScore = -1, worstScore = 101;
    compareFunds.forEach(code => {
        const sig = signalCache[code];
        if (sig && !sig.error) {
            if (sig.buy_score > bestScore) { bestScore = sig.buy_score; bestSig = code; }
            if (sig.buy_score < worstScore) { worstScore = sig.buy_score; worstSig = code; }
        }
    });
    if (bestSig && worstSig && bestSig !== worstSig) {
        const bestFd = fundDataCache[bestSig];
        const worstFd = fundDataCache[worstSig];
        items.push(`量化信号最强：<strong>${bestFd ? bestFd.name.substring(0, 8) : bestSig}</strong>（${signalCache[bestSig].signal} ${bestScore}分）`);
        items.push(`量化信号最弱：<strong>${worstFd ? worstFd.name.substring(0, 8) : worstSig}</strong>（${signalCache[worstSig].signal} ${worstScore}分）`);
    }

    // 重仓股重叠度
    const allStocks = new Map();
    compareFunds.forEach(code => {
        const d = compareData[code];
        (d?.holdings || []).forEach(h => {
            if (!allStocks.has(h.code)) allStocks.set(h.code, 0);
            allStocks.set(h.code, allStocks.get(h.code) + 1);
        });
    });
    const overlapCount = Array.from(allStocks.values()).filter(c => c >= 2).length;
    const totalUnique = allStocks.size;
    if (totalUnique > 0) {
        items.push(`重仓股重叠${overlapCount}只（共${totalUnique}只不重复），相似度${((overlapCount / totalUnique) * 100).toFixed(0)}%`);
    }

    // 持仓收益对比
    const heldFunds = compareFunds.filter(code => holdings.some(h => h.code === code));
    if (heldFunds.length >= 2) {
        let bestH = null, bestEarn = -Infinity;
        heldFunds.forEach(code => {
            const h = holdings.find(h => h.code === code);
            const d = compareData[code];
            const chg = d?.est?.estimated_change_pct;
            if (h && chg != null) {
                const earn = h.value * parseFloat(chg) / 100;
                if (earn > bestEarn) { bestEarn = earn; bestH = code; }
            }
        });
        if (bestH) {
            const fd = fundDataCache[bestH];
            items.push(`今日预估收益最高：<strong>${fd ? fd.name.substring(0, 8) : bestH}</strong>（${fmtMoney(bestEarn)}元）`);
        }
    }

    if (!items.length) return "";

    // 综合结论
    let summary = "";
    if (bestSig && signalCache[bestSig] && signalCache[bestSig].buy_score >= 60) {
        const fd = fundDataCache[bestSig];
        summary = `综合来看，<strong>${fd ? fd.name.substring(0, 8) : bestSig}</strong>在量化信号和收益表现上均占优，可作为优先考虑标的。`;
    } else if (bestSig && signalCache[bestSig] && signalCache[bestSig].buy_score < 40) {
        summary = "综合来看，几只基金信号均偏弱，建议暂时观望，等待更好的入场时机。";
    } else {
        summary = "综合来看，各基金表现各有千秋，建议根据自身风险偏好合理配置。";
    }

    // 根据内容类型选择图标
    const icons = items.map(t => {
        if (t.includes("收益最优")) return `<span class="conclusion-icon conclusion-icon-rank">&#x1F3C6;</span>`;
        if (t.includes("信号最强")) return `<span class="conclusion-icon conclusion-icon-strong">&#x2B06;</span>`;
        if (t.includes("信号最弱")) return `<span class="conclusion-icon conclusion-icon-weak">&#x2B07;</span>`;
        if (t.includes("重仓股重叠")) return `<span class="conclusion-icon conclusion-icon-overlap">&#x1F517;</span>`;
        if (t.includes("预估收益最高")) return `<span class="conclusion-icon conclusion-icon-profit">&#x1F4B0;</span>`;
        return `<span class="conclusion-icon">&#x2022;</span>`;
    });

    return `<div class="analysis-section">
        <div class="section-title compare-title">对比参考结论</div>
        <div class="compare-conclusion">
            <div class="conclusion-items">
                ${items.map((t, i) => `<div class="conclusion-item">${icons[i]}<span>${t}</span></div>`).join("")}
            </div>
            <div class="conclusion-summary">
                <div class="conclusion-summary-icon">&#x1F4A1;</div>
                <div class="conclusion-summary-text">${summary}</div>
            </div>
        </div>
    </div>`;
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
.fund-compare { display: flex; flex-direction: column; gap: 12px; }

/* ===== Section Titles ===== */
.compare-title::before { background: var(--primary); }

/* ===== 选择器 ===== */
.compare-selector { background: var(--card); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow); }
.compare-input-row { display: flex; gap: 6px; margin-bottom: 8px; }
.compare-input-wrap { position: relative; flex: 1; }
.compare-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.compare-chip { background: linear-gradient(135deg, #e8f0fe, #dbeafe); color: var(--primary); font-size: 11px; padding: 4px 10px; border-radius: 12px; display: flex; align-items: center; gap: 4px; font-weight: 600; letter-spacing: .3px; box-shadow: 0 1px 3px rgba(26,115,232,.1); transition: all .2s ease; }
.compare-chip:hover { box-shadow: 0 2px 6px rgba(26,115,232,.2); transform: translateY(-1px); }
.compare-chip-x { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 14px; padding: 0; line-height: 1; opacity: .6; transition: opacity .15s; }
.compare-chip-x:hover { opacity: 1; }

/* ===== 补全下拉 ===== */
.compare-autocomplete { display: none; position: absolute; top: 100%; left: 0; right: 0; background: var(--card); border: 1px solid var(--border); border-radius: 0 0 10px 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.15); z-index: 100; max-height: 200px; overflow-y: auto; }
.compare-autocomplete.show { display: block; }
.compare-autocomplete .ac-item { display: flex; align-items: center; gap: 8px; padding: 9px 12px; cursor: pointer; font-size: 12px; border-bottom: 1px solid var(--border); transition: background .15s; }
.compare-autocomplete .ac-item:last-child { border-bottom: none; }
.compare-autocomplete .ac-item:hover { background: rgba(26,115,232,.05); }
.compare-autocomplete .ac-code { color: var(--primary); font-weight: 700; font-size: 11px; min-width: 50px; font-variant-numeric: tabular-nums; }
.compare-autocomplete .ac-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.compare-autocomplete .ac-type { font-size: 9px; color: var(--text3); background: var(--bg); padding: 2px 6px; border-radius: 4px; font-weight: 500; }

/* ===== 持仓快选 ===== */
.holdings-quick-select { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); }
.quick-label { font-size: 10px; color: var(--text3); white-space: nowrap; }
.compare-quick-btn { background: none; border: 1px dashed var(--border); border-radius: 6px; padding: 4px 10px; font-size: 10px; color: var(--text2); cursor: pointer; transition: all .15s; font-family: inherit; }
.compare-quick-btn:hover { border-color: var(--primary); color: var(--primary); background: rgba(26,115,232,.04); }

/* ===== 对比结果 ===== */
.compare-results { display: flex; flex-direction: column; gap: 12px; }

/* ===== 空状态 ===== */
.compare-empty-state { text-align: center; padding: 40px 16px; animation: compareFadeIn .4s ease-out; }
.compare-empty-icon { font-size: 48px; margin-bottom: 10px; opacity: .85; }
.compare-empty-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
.compare-empty-hint { font-size: 11px; color: var(--text3); }
@keyframes compareFadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

/* ===== 预估卡片 ===== */
.est-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.est-card {
    background: var(--card); border-radius: 10px; padding: 14px 12px;
    box-shadow: var(--shadow); border-left: 4px solid var(--flat);
    transition: all .25s ease; position: relative; overflow: hidden;
}
.est-card-up { border-left-color: var(--up); }
.est-card-down { border-left-color: var(--down); }
.est-card-flat { border-left-color: var(--flat); }
.est-card::after {
    content: ""; position: absolute; top: 0; right: 0; width: 60px; height: 60px;
    border-radius: 0 0 0 60px; opacity: .04; pointer-events: none;
}
.est-card-up::after { background: var(--up); }
.est-card-down::after { background: var(--down); }
.est-card:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,0,0,.1); }
.est-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.est-card-name { font-size: 11px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: .3px; }
.est-card-time { font-size: 8px; color: var(--text3); flex-shrink: 0; margin-left: 4px; }
.est-card-body { text-align: center; margin-bottom: 6px; }
.est-card-nav { font-size: 18px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.est-card-chg { font-size: 16px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; letter-spacing: .5px; }
.est-card-footer { display: flex; justify-content: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
.est-pill {
    font-size: 10px; font-weight: 600; padding: 2px 8px;
    border-radius: 10px; white-space: nowrap;
}
.est-pill-hold { background: rgba(26,115,232,.08); color: var(--primary); }
.est-pill-profit.up { background: rgba(231,76,60,.08); color: var(--up); }
.est-pill-profit.down { background: rgba(39,174,96,.08); color: var(--down); }
.est-pill-profit.flat { background: var(--bg); color: var(--flat); }

/* ===== 对比表（styled） ===== */
.compare-table-wrap { overflow-x: auto; border-radius: 8px; }
.compare-table-styled { width: 100%; border-collapse: collapse; font-size: 11px; border-radius: 8px; overflow: hidden; }
.compare-table-styled thead tr {
    background: linear-gradient(135deg, var(--primary), #1557b0);
}
.compare-table-styled th {
    padding: 10px 12px; text-align: center; font-weight: 600;
    color: rgba(255,255,255,.9); font-size: 11px; border: none;
    white-space: nowrap; letter-spacing: .3px;
}
.compare-table-styled td {
    padding: 10px 12px; text-align: center;
    border-bottom: 1px solid var(--border); border-left: none; border-right: none;
    transition: background .15s;
}
.compare-table-styled tbody tr { transition: background .15s; }
.compare-table-styled tbody tr:hover { background: rgba(26,115,232,.04); }
.compare-td-label { text-align: left !important; color: var(--text2); font-weight: 600; font-size: 11px; }
.compare-td-nav { font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--text); }
.compare-td-empty { color: var(--text3); font-style: italic; }

/* ===== 收益 Badge ===== */
.compare-badge {
    display: inline-block; font-size: 11px; font-weight: 700;
    padding: 3px 10px; border-radius: 10px; font-variant-numeric: tabular-nums;
    letter-spacing: .3px;
}
.compare-badge-up { background: rgba(231,76,60,.1); color: var(--up); }
.compare-badge-down { background: rgba(39,174,96,.1); color: var(--down); }
.compare-badge-flat { background: rgba(153,153,153,.1); color: var(--flat); }

/* ===== 信号 Badge ===== */
.signal-cell { cursor: pointer; transition: opacity .15s; }
.signal-cell:hover { opacity: .8; }
.compare-signal-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 10px; font-weight: 600;
    font-size: 11px; transition: all .15s;
}
.compare-signal-badge:hover { transform: scale(1.05); }
.compare-signal-up { background: rgba(231,76,60,.1); color: var(--up); }
.compare-signal-down { background: rgba(39,174,96,.1); color: var(--down); }
.compare-signal-flat { background: rgba(153,153,153,.1); color: var(--flat); }
.compare-signal-text { font-size: 11px; }
.compare-signal-score {
    font-size: 10px; font-weight: 700; background: rgba(255,255,255,.6);
    padding: 1px 5px; border-radius: 6px; font-variant-numeric: tabular-nums;
}

/* ===== 结论区 ===== */
.compare-conclusion {
    background: var(--card); border-radius: 10px; padding: 14px;
    box-shadow: var(--shadow);
}
.conclusion-items { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.conclusion-item {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 8px 10px; border-radius: 8px; background: var(--bg);
    font-size: 11px; line-height: 1.5; transition: background .15s;
}
.conclusion-item:hover { background: rgba(26,115,232,.04); }
.conclusion-icon { font-size: 14px; flex-shrink: 0; line-height: 1.4; }
.conclusion-summary {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 14px; border-radius: 8px;
    background: rgba(26,115,232,.04);
    border-left: 3px solid var(--primary);
    font-size: 12px; line-height: 1.6; color: var(--text);
}
.conclusion-summary-icon { font-size: 18px; flex-shrink: 0; line-height: 1.5; }
.conclusion-summary-text { flex: 1; }

/* ===== 图表区 ===== */
.compare-chart-container {
    background: var(--card); border-radius: 10px; padding: 12px;
    box-shadow: var(--shadow);
}
.compare-chart-wrap { height: 240px; position: relative; }
.compare-diff-bar { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; min-height: 22px; padding: 6px 0 2px; font-size: 11px; }
.diff-item {
    color: var(--text2); background: var(--bg);
    padding: 3px 10px; border-radius: 10px; font-size: 11px;
    font-weight: 500;
}
.diff-item .up { color: var(--up); font-weight: 700; }
.diff-item .down { color: var(--down); font-weight: 700; }
.diff-item .flat { color: var(--text3); }

/* ===== 周期按钮（胶囊式） ===== */
.compare-period-btns { display: flex; gap: 6px; justify-content: center; margin-top: 10px; }
.compare-period-btn {
    padding: 5px 14px; border-radius: 20px; font-size: 11px;
    border: 1px solid var(--border); background: var(--card);
    cursor: pointer; color: var(--text2); font-family: inherit;
    font-weight: 500; transition: all .2s ease;
    box-shadow: 0 1px 2px rgba(0,0,0,.04);
}
.compare-period-btn:hover { border-color: var(--primary); color: var(--primary); background: rgba(26,115,232,.04); }
.compare-period-btn.active {
    background: linear-gradient(135deg, var(--primary), #1557b0);
    color: #fff; border-color: transparent;
    box-shadow: 0 2px 8px rgba(26,115,232,.3);
}

/* ===== 重仓股对比 ===== */
.compare-overlap-badge {
    font-size: 10px; font-weight: 600; color: var(--primary);
    background: rgba(26,115,232,.1); padding: 2px 8px;
    border-radius: 10px; margin-left: 8px; letter-spacing: .3px;
}
.holdings-row-overlap { background: rgba(26,115,232,.05); }
.holdings-row-overlap td { font-weight: 500; }
.holdings-row-single { opacity: .75; }
.holdings-row-single:hover { opacity: 1; }
.holdings-dot {
    display: inline-block; width: 6px; height: 6px;
    border-radius: 50%; margin-right: 5px; vertical-align: middle;
}
.holdings-dot-overlap { background: var(--primary); }
.holdings-dot-single { background: #ccc; }
.stock-code-hint { font-size: 9px; color: var(--text3); margin-left: 3px; font-variant-numeric: tabular-nums; }
.holdings-compare-table td { font-size: 11px; }
.compare-th-sticky { position: sticky; top: 0; z-index: 2; }
.compare-th-fund { min-width: 70px; }

/* ===== 暗色模式 ===== */
[data-theme="dark"] .compare-chip { background: linear-gradient(135deg, #1a2a4a, #162844); box-shadow: 0 1px 3px rgba(91,155,245,.1); }
[data-theme="dark"] .est-card { box-shadow: 0 1px 6px rgba(0,0,0,.3); }
[data-theme="dark"] .est-card-up::after { opacity: .06; }
[data-theme="dark"] .est-card-down::after { opacity: .06; }
[data-theme="dark"] .est-pill-hold { background: rgba(91,155,245,.15); }
[data-theme="dark"] .est-pill-profit.up { background: rgba(239,83,80,.12); }
[data-theme="dark"] .est-pill-profit.down { background: rgba(102,187,106,.12); }
[data-theme="dark"] .compare-table-styled thead tr { background: linear-gradient(135deg, #1a2a4a, #0d1a30); }
[data-theme="dark"] .compare-table-styled tbody tr:hover { background: rgba(91,155,245,.06); }
[data-theme="dark"] .compare-badge-up { background: rgba(239,83,80,.12); }
[data-theme="dark"] .compare-badge-down { background: rgba(102,187,106,.12); }
[data-theme="dark"] .compare-badge-flat { background: rgba(136,136,136,.12); }
[data-theme="dark"] .compare-signal-up { background: rgba(239,83,80,.12); }
[data-theme="dark"] .compare-signal-down { background: rgba(102,187,106,.12); }
[data-theme="dark"] .compare-signal-flat { background: rgba(136,136,136,.12); }
[data-theme="dark"] .compare-signal-score { background: rgba(255,255,255,.1); }
[data-theme="dark"] .conclusion-item { background: #1a1a24; }
[data-theme="dark"] .conclusion-item:hover { background: #1e2438; }
[data-theme="dark"] .conclusion-summary { background: rgba(91,155,245,.06); }
[data-theme="dark"] .compare-chart-container { box-shadow: 0 1px 6px rgba(0,0,0,.3); }
[data-theme="dark"] .diff-item { background: #1a1a24; }
[data-theme="dark"] .compare-period-btn { background: #1e1e2a; border-color: #2a2a3a; color: var(--text2); }
[data-theme="dark"] .compare-period-btn:hover { border-color: var(--primary); background: rgba(91,155,245,.06); }
[data-theme="dark"] .compare-period-btn.active { background: linear-gradient(135deg, #1a2a4a, #0d1a30); box-shadow: 0 2px 8px rgba(91,155,245,.2); }
[data-theme="dark"] .holdings-row-overlap { background: rgba(91,155,245,.06); }
[data-theme="dark"] .compare-overlap-badge { background: rgba(91,155,245,.15); }
`;

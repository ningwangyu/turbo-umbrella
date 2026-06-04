import { holdings, fundDataCache, signalCache } from '../state.js';
import { fmtMoney, colorCls } from '../utils.js';
import { compareState } from './state.js';
import { bindCompareEvents } from './events.js';
import { renderCompareChart } from './chart.js';

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

    compareState.compareFunds.forEach(code => {
        const fd = fundDataCache[code];
        const name = fd ? fd.name : code;
        html += `<span class="compare-chip">${name}<button class="compare-chip-x" data-code="${code}">&times;</button></span>`;
    });

    html += `</div>`;

    // —— 持仓快选（始终显示，只要持仓非空且有未选中的基金） ——
    const quickFunds = holdings.filter(h => !compareState.compareFunds.includes(h.code));
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
    if (compareState.compareFunds.length < 2) {
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
    if (compareState.compareFunds.length >= 2 && Object.keys(compareState.compareData).length >= 2) {
        requestAnimationFrame(() => renderCompareChart(compareState.currentPeriod));
    }
}

// ============================================================
// 子渲染：预估模块
// ============================================================

export function renderEstSection() {
    let html = `<div class="analysis-section"><div class="section-title compare-title">实时预估</div>
        <div class="est-cards">`;

    compareState.compareFunds.forEach(code => {
        const d = compareState.compareData[code];
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
                <div class="est-card-chg ${chgNum != null ? colorCls(chgNum) : ""}">${chgNum != null ? fmtMoney(chgNum) + "%" : "--"}</div>
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

export function renderInfoTable() {
    let html = `<div class="analysis-section"><div class="section-title compare-title">基本信息对比</div>
        <div class="compare-table-wrap"><table class="compare-table compare-table-styled"><thead><tr><th>指标</th>`;
    compareState.compareFunds.forEach(code => {
        const fd = fundDataCache[code];
        html += `<th class="compare-th-fund">${fd ? fd.name.substring(0, 6) : code}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // 最新净值
    html += `<tr><td class="compare-td-label">最新净值</td>`;
    compareState.compareFunds.forEach(code => {
        const d = compareState.compareData[code];
        html += `<td class="compare-td-nav">${d?.est?.nav || "--"}</td>`;
    });
    html += `</tr>`;

    // 各周期收益
    const periods = { "1m": "近1月", "3m": "近3月", "6m": "近6月", "1y": "近1年" };
    for (const [k, lbl] of Object.entries(periods)) {
        html += `<tr><td class="compare-td-label">${lbl}</td>`;
        compareState.compareFunds.forEach(code => {
            const d = compareState.compareData[code];
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
    compareState.compareFunds.forEach(code => {
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

export function renderConclusionSection() {
    const items = compareState.compareFunds.map(code => {
        const fd = fundDataCache[code];
        const perf = compareState.compareData[code]?.perf?.returns || {};
        const sig = signalCache[code];
        return {
            code,
            name: fd ? fd.name.substring(0, 8) : code,
            r6m: Number(perf["6m"] ?? Number.NEGATIVE_INFINITY),
            score: Number(sig?.buy_score ?? Number.NEGATIVE_INFINITY),
            signal: sig?.signal || "--",
        };
    });

    const bestReturn = [...items].sort((a, b) => b.r6m - a.r6m)[0];
    const bestSignal = [...items].sort((a, b) => b.score - a.score)[0];
    const returnText = bestReturn && Number.isFinite(bestReturn.r6m) ? `${bestReturn.name} 近6月收益领先` : "暂无足够收益数据";
    const signalText = bestSignal && Number.isFinite(bestSignal.score) ? `${bestSignal.name} 信号为 ${bestSignal.signal}` : "暂无量化信号数据";

    return `<div class="analysis-section compare-conclusion">
        <div class="section-title compare-title">对比参考</div>
        <div class="conclusion-items">
            <div class="conclusion-item"><span class="conclusion-icon">📈</span><span>${returnText}</span></div>
            <div class="conclusion-item"><span class="conclusion-icon">🧠</span><span>${signalText}</span></div>
        </div>
        <div class="conclusion-summary"><span class="conclusion-summary-icon">💡</span><span class="conclusion-summary-text">建议结合收益、信号和持仓重叠综合判断，不要只看单一指标。</span></div>
    </div>`;
}

// ============================================================
// 子渲染：重仓股对比
// ============================================================

export function renderHoldingsCompare() {
    // 收集所有重仓股（去重）
    const allStocks = new Map(); // stockCode → {name, funds: {code: pct}}
    compareState.compareFunds.forEach(code => {
        const d = compareState.compareData[code];
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

    compareState.compareFunds.forEach(code => {
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

        compareState.compareFunds.forEach(code => {
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

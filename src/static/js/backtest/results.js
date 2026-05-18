import { fmtMoney, fmtPlain, colorCls } from '../utils.js';
import { STRATEGIES } from './config.js';
import { drawLineChart, drawBarChart } from './charts.js';

export function renderBacktestResults(container, data, activeKeys) {
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

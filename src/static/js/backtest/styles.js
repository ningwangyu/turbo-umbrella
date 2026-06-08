/** 回测样式模块 — 以 JS 字符串随功能懒加载，减少首屏静态 CSS 体积。 */
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
.bt-summary-table-wrap {
    overflow-x: auto;
    margin-top: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: rgba(3, 18, 37, .42);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
}
.bt-summary-table {
    width: 100%; border-collapse: collapse; font-size: 13px;
    background: transparent;
    color: var(--text);
}
.bt-summary-table th, .bt-summary-table td {
    padding: 8px 14px; text-align: center;
    border-bottom: 1px solid rgba(82, 150, 255, .14);
}
.bt-summary-table th {
    background: rgba(56, 189, 248, .1);
    font-weight: 600;
    color: var(--accent-2);
}
.bt-summary-table td {
    font-variant-numeric: tabular-nums;
    color: var(--text2);
}
.bt-summary-table tbody tr:nth-child(even) { background: rgba(125, 211, 252, .035); }
.bt-summary-table tbody tr:hover { background: rgba(56, 189, 248, .09); }
.bt-tbl-label { text-align: left; font-weight: 600; color: var(--text); white-space: nowrap; }
.bt-row-highlight { background: rgba(56, 189, 248, .08) !important; }
.bt-row-highlight td { font-weight: 600; color: var(--text); }
.bt-best {
    font-weight: 700; color: var(--accent);
}
.bt-diff-header { color: var(--text3) !important; font-size: 11px; }
.bt-diff-cell { font-size: 11px; color: var(--text3); }
.bt-diff-pos { color: var(--up) !important; font-weight: 600; }
.bt-diff-neg { color: var(--down) !important; font-weight: 600; }

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

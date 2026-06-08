/** 基金对比样式模块 — 随对比功能按需注入，保持主样式文件聚焦基础布局。 */
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
.compare-chart-empty { color: var(--text3); background: var(--bg); padding: 4px 12px; border-radius: 10px; }
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

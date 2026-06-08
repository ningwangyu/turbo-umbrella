/** 组合分析样式模块 — 以功能级 CSS 字符串支持分析页按需注入。 */
export const PORTFOLIO_CSS = `
/* ===== 组合分析基础 ===== */
.portfolio-analysis { display: flex; flex-direction: column; gap: 12px; padding: 2px 0; }

.pa-analysis-card {
    background: var(--card, #fff); border-radius: 12px;
    padding: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    border: 1px solid var(--border, #e5e7eb);
}
.pa-card-title {
    font-size: 14px; font-weight: 700; color: var(--text, #1a1a1a);
    margin-bottom: 12px; display: flex; align-items: center; gap: 6px;
}
.pa-card-sub { font-size: 11px; color: var(--text3, #999); font-weight: 400; }

/* ===== 风险指标 ===== */
.pa-risk-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.pa-risk-card {
    background: var(--card, #fff); border-radius: 12px; padding: 14px 10px;
    text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    border: 1px solid var(--border, #e5e7eb); position: relative;
    transition: box-shadow 0.2s, transform 0.15s;
}
.pa-risk-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.pa-risk-card.pa-clickable { cursor: pointer; }
.pa-risk-card.pa-clickable:hover { border-color: var(--primary, #3b82f6); }
.pa-risk-label { font-size: 11px; color: var(--text3, #888); margin-bottom: 6px; font-weight: 500; }
.pa-risk-value { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.2; }
.pa-risk-sub { font-size: 10px; color: var(--text3, #999); margin-top: 4px; }
.pa-click-hint { font-size: 9px; color: var(--primary, #3b82f6); margin-top: 6px; opacity: 0.7; }

/* ===== 帮助按钮 ===== */
.pa-help-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--bg, #f5f5f5); color: var(--text3, #999);
    font-size: 10px; font-weight: 700; cursor: pointer;
    position: absolute; top: 8px; right: 8px;
    transition: all 0.15s; line-height: 1;
}
.pa-help-btn:hover { background: var(--primary, #3b82f6); color: #fff; }
.pa-help-inline { position: static; width: 14px; height: 14px; font-size: 9px; vertical-align: middle; margin-left: 2px; }

/* ===== 帮助弹窗 ===== */
.help-tip-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999; animation: fadeIn 0.15s;
}
.help-tip-box {
    background: var(--card, #fff); border-radius: 16px; padding: 20px;
    max-width: 420px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    animation: slideUp 0.2s;
}
.help-tip-content { font-size: 13px; line-height: 1.7; color: var(--text, #333); }
.help-tip-close {
    display: block; margin: 16px auto 0; padding: 8px 24px;
    background: var(--primary, #3b82f6); color: #fff;
    border: none; border-radius: 8px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s;
}
.help-tip-close:hover { opacity: 0.85; }

/* ===== 回撤明细弹窗 — 新版 ===== */
.pa-dd-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45);
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999; animation: fadeIn 0.15s;
}
.pa-dd-modal {
    background: var(--card, #fff); border-radius: 16px;
    max-width: 680px; width: 94%; max-height: 85vh;
    display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04);
    animation: slideUp 0.25s cubic-bezier(0.16,1,0.3,1);
    overflow: hidden;
}
.pa-dd-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 2px solid transparent;
    border-image: linear-gradient(90deg, var(--primary, #3b82f6), var(--up, #ef4444)) 1;
    flex-shrink: 0;
}
.pa-dd-modal-title {
    font-size: 16px; font-weight: 700; color: var(--text, #1a1a1a);
    display: flex; align-items: center; gap: 8px;
}
.pa-dd-close-x {
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--bg, #f5f5f5); border: none;
    font-size: 20px; line-height: 1; color: var(--text3, #999);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
}
.pa-dd-close-x:hover { background: var(--border, #e5e7eb); color: var(--text, #333); }
.pa-dd-modal-body {
    padding: 16px 20px; overflow-y: auto; flex: 1;
}
.pa-dd-modal-footer {
    padding: 12px 20px; border-top: 1px solid var(--border, #e5e7eb);
    display: flex; justify-content: flex-end; flex-shrink: 0;
}

/* 关键指标条 */
.pa-dd-stats-bar {
    display: flex; align-items: center; gap: 0;
    background: var(--bg, #f9f9f9); border-radius: 12px;
    padding: 12px 16px; margin-bottom: 16px;
}
.pa-dd-stat-item { display: flex; flex-direction: column; align-items: center; flex: 1; }
.pa-dd-stat-label { font-size: 11px; color: var(--text3, #888); margin-bottom: 4px; }
.pa-dd-stat-value { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
.pa-dd-stat-divider { width: 1px; height: 32px; background: var(--border, #e5e7eb); flex-shrink: 0; }

/* 区域标题 */
.pa-dd-section-title {
    font-size: 13px; font-weight: 700; color: var(--text, #333);
    margin-bottom: 10px; display: flex; align-items: center; gap: 6px;
}

/* 图表区域 */
.pa-dd-chart-section { margin-bottom: 16px; }
.pa-dd-chart-wrap {
    background: var(--bg, #f9f9f9); border-radius: 12px;
    padding: 12px; position: relative;
}
.pa-dd-chart-wrap canvas { width: 100% !important; display: block; }

/* 峰谷卡片 */
.pa-dd-peak-cards {
    display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
}
.pa-dd-peak-card {
    flex: 1; display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; border-radius: 12px;
    border: 1px solid var(--border, #e5e7eb);
}
.pa-dd-peak-card--peak { border-left: 3px solid #22c55e; }
.pa-dd-peak-card--trough { border-left: 3px solid #ef4444; }
.pa-dd-peak-icon { font-size: 18px; color: #22c55e; flex-shrink: 0; line-height: 1; }
.pa-dd-peak-icon.up { color: #ef4444; }
.pa-dd-peak-info { min-width: 0; }
.pa-dd-peak-label { font-size: 11px; color: var(--text3, #888); }
.pa-dd-peak-date { font-size: 13px; font-weight: 700; color: var(--text, #333); }
.pa-dd-peak-nav { font-size: 12px; color: var(--text2, #666); font-variant-numeric: tabular-nums; }
.pa-dd-peak-arrow {
    display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0; min-width: 48px;
}
.pa-dd-arrow-line { width: 2px; height: 8px; background: var(--border, #ddd); border-radius: 1px; }
.pa-dd-arrow-badge {
    font-size: 13px; font-weight: 800; padding: 3px 8px;
    border-radius: 8px; background: rgba(239,68,68,0.08);
    white-space: nowrap; font-variant-numeric: tabular-nums;
}

/* 公式高亮 */
.pa-dd-formula {
    background: var(--bg, #f9f9f9); border-radius: 10px;
    padding: 10px 14px; margin-bottom: 16px;
    font-size: 12px; color: var(--text2, #555);
    text-align: center; font-variant-numeric: tabular-nums;
}
.pa-dd-formula strong { color: var(--up, #ef4444); font-size: 14px; }

/* 表格 */
.pa-dd-table-wrap { overflow-x: auto; margin-bottom: 12px; border-radius: 10px; border: 1px solid var(--border, #e5e7eb); }
.pa-dd-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pa-dd-table th {
    padding: 10px 12px; text-align: left; font-size: 11px;
    color: var(--text3, #888); background: var(--bg, #f9f9f9);
    font-weight: 600; border-bottom: 1px solid var(--border, #e5e7eb);
    position: sticky; top: 0;
}
.pa-dd-table td { padding: 9px 12px; border-bottom: 1px solid var(--border, #f0f0f0); }
.pa-dd-table tbody tr:hover { background: var(--bg, #fafafa); }
.pa-dd-table-total { font-weight: 700; background: var(--bg, #f9f9f9) !important; }
.pa-dd-table-total td { border-top: 2px solid var(--border, #e5e7eb); padding-top: 10px; }
.pa-dd-name { font-weight: 600; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pa-dd-code { color: var(--text3, #888); font-size: 11px; }
.pa-dd-weight { font-variant-numeric: tabular-nums; }
.pa-dd-value { font-weight: 700; font-variant-numeric: tabular-nums; }
.pa-dd-contrib-bar {
    display: inline-block; height: 6px; border-radius: 3px; vertical-align: middle;
    background: var(--up, #ef4444); opacity: 0.3; margin-right: 4px;
}

/* 折叠说明 */
.pa-dd-note-section { margin-top: 4px; }
.pa-dd-note-toggle {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--text3, #888); cursor: pointer;
    padding: 6px 0; transition: color 0.15s;
}
.pa-dd-note-toggle:hover { color: var(--primary, #3b82f6); }
.pa-dd-note-icon { font-size: 14px; }
.pa-dd-note-arrow { font-size: 10px; transition: transform 0.2s; }
.pa-dd-note-open .pa-dd-note-arrow { transform: rotate(180deg); }
.pa-dd-note-content {
    background: var(--bg, #f9f9f9); border-radius: 10px;
    padding: 12px 14px; font-size: 12px; color: var(--text2, #555);
    line-height: 1.8; margin-top: 6px; animation: slideDown 0.2s ease;
}
.pa-dd-note-content div { margin-bottom: 2px; }

/* 关闭按钮 */
.pa-dd-close-btn {
    padding: 8px 28px; border-radius: 10px;
    background: var(--primary, #3b82f6); color: #fff;
    border: none; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s, transform 0.1s;
}
.pa-dd-close-btn:hover { opacity: 0.85; }
.pa-dd-close-btn:active { transform: scale(0.97); }

/* ===== 多样化评分 ===== */
.pa-div-section {
    background: var(--card, #fff); border-radius: 12px; padding: 14px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid var(--border, #e5e7eb);
}
.pa-div-grid { display: flex; gap: 16px; align-items: center; }
.pa-div-score-wrap { display: flex; flex-direction: column; align-items: center; min-width: 90px; }
.pa-div-ring { width: 80px; height: 80px; position: relative; }
.pa-div-ring svg { width: 100%; height: 100%; }
.pa-ring-progress { transition: stroke-dasharray 0.6s ease; }
.pa-div-score-num {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    font-size: 22px; font-weight: 900; line-height: 1;
}
.pa-div-score-label { font-size: 10px; color: var(--text3, #888); margin-top: 4px; }
.pa-div-score-level { font-size: 13px; font-weight: 700; }
.pa-div-score-desc { font-size: 10px; color: var(--text3, #999); }

.pa-div-indicators { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; flex: 1; }
.pa-div-ind {
    background: var(--bg, #f9f9f9); border-radius: 10px; padding: 10px;
    text-align: center;
}
.pa-div-ind-label { font-size: 11px; color: var(--text3, #888); margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 2px; }
.pa-div-ind-value { font-size: 17px; font-weight: 800; }
.pa-div-ind-sub { font-size: 11px; color: var(--text3, #999); margin-top: 2px; }

/* ===== 集中度预警 ===== */
.pa-conc-warning {
    display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 10px 12px;
    background: #fff7ed; border-radius: 10px; font-size: 12px; color: #c2410c;
    border: 1px solid #fed7aa;
}
[data-theme="dark"] .pa-conc-warning {
    background: #431407; color: #fdba74; border-color: #7c2d12;
}
.pa-conc-icon { font-size: 16px; flex-shrink: 0; }

/* ===== 板块分布 / 资产配置 共用布局 ===== */
.pa-sector-layout { display: flex; gap: 14px; align-items: flex-start; }
.pa-sector-chart-wrap { flex-shrink: 0; }
.pa-sector-bars { flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.pa-sector-row {
    display: flex; align-items: center; gap: 8px; cursor: pointer;
    padding: 5px 8px; border-radius: 8px; transition: background 0.15s;
}
.pa-sector-row:hover { background: var(--bg, #f5f5f5); }
.pa-sector-name { font-size: 12px; font-weight: 600; min-width: 55px; max-width: 90px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pa-sector-track { flex: 1; height: 14px; background: var(--bg, #f0f0f0); border-radius: 7px; overflow: hidden; min-width: 40px; }
.pa-sector-fill { height: 100%; border-radius: 7px; background: var(--bar-color, var(--primary, #3b82f6)); transition: width 0.3s ease; opacity: 0.8; }
.pa-sector-row:hover .pa-sector-fill { opacity: 1; }
.pa-sector-pct { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; min-width: 42px; text-align: right; }
.pa-sector-cnt { font-size: 10px; color: var(--text3, #999); min-width: 46px; text-align: right; }

/* ===== 详情面板 ===== */
.pa-detail-panel {
    margin-top: 10px; padding: 12px; background: var(--bg, #f9f9f9);
    border-radius: 10px; border: 1px solid var(--border, #e5e7eb);
    animation: slideDown 0.2s ease;
}
.pa-detail-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.pa-detail-title { font-size: 14px; font-weight: 700; }
.pa-detail-weight { font-size: 12px; color: var(--primary, #3b82f6); font-weight: 600; }
.pa-detail-close { margin-left: auto; background: none; border: none; font-size: 18px; cursor: pointer; color: var(--text3, #999); line-height: 1; padding: 2px 4px; }
.pa-detail-close:hover { color: var(--text, #333); }
.pa-detail-subtitle { font-size: 12px; font-weight: 600; color: var(--text2, #666); margin: 8px 0 6px; }
.pa-detail-table-wrap { overflow-x: auto; }
.pa-detail-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pa-detail-table th { padding: 6px 10px; text-align: left; font-size: 11px; color: var(--text3, #888); font-weight: 600; background: var(--card, #fff); border-bottom: 2px solid var(--border, #e5e7eb); }
.pa-detail-table td { padding: 6px 10px; border-bottom: 1px solid var(--border, #eee); }
.pa-stock-name { font-weight: 600; }
.pa-code-cell { font-size: 10px; color: var(--text3, #999); }
.pa-pct-cell { font-weight: 600; color: var(--primary, #3b82f6); font-variant-numeric: tabular-nums; }

/* ===== 基金展开（板块详情内） ===== */
.pa-fund-expand {
    border: 1px solid var(--border, #e5e7eb); border-radius: 8px;
    margin-bottom: 6px; overflow: hidden; cursor: pointer;
    transition: border-color 0.15s;
}
.pa-fund-expand:hover { border-color: var(--primary, #3b82f6); }
.pa-fund-expand.pa-expanded { border-color: var(--primary, #3b82f6); }
.pa-fund-row {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
}
.pa-fund-arrow { font-size: 8px; color: var(--text3, #999); flex-shrink: 0; transition: transform 0.2s; }
.pa-fund-name { font-size: 12px; font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pa-fund-holdings {
    padding: 6px 10px 8px 24px; background: var(--card, #fff);
    border-top: 1px solid var(--border, #eee);
}
.pa-no-data { font-size: 11px; color: var(--text3, #999); padding: 6px 0; }

/* ===== 回撤明细列 ===== */
.pa-dd-holding { font-size: 11px; color: var(--text3, #888); }

/* ===== 重叠持仓 ===== */
.pa-overlap-list { display: flex; flex-direction: column; gap: 6px; max-height: 400px; overflow-y: auto; }
.pa-overlap-item {
    border: 1px solid var(--border, #e5e7eb); border-radius: 10px;
    overflow: hidden; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
}
.pa-overlap-item:hover { border-color: var(--primary, #3b82f6); }
.pa-overlap-item.pa-expanded { border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 1px var(--primary, #3b82f6); }
.pa-overlap-main { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; }
.pa-overlap-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.pa-overlap-arrow { font-size: 9px; color: var(--text3, #999); transition: transform 0.2s; flex-shrink: 0; }
.pa-overlap-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pa-overlap-code { font-size: 10px; color: var(--text3, #999); flex-shrink: 0; }
.pa-overlap-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.pa-overlap-badge { background: #fef2f2; color: var(--up, #ef4444); font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 600; }
.pa-overlap-pct { font-size: 13px; font-weight: 700; color: var(--primary, #3b82f6); font-variant-numeric: tabular-nums; }
.pa-overlap-detail {
    padding: 8px 12px 10px 30px; border-top: 1px solid var(--border, #eee);
    background: var(--bg, #fafafa); animation: slideDown 0.2s ease;
}
.pa-overlap-fund { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
.pa-overlap-fund-name { font-size: 12px; color: var(--text2, #555); }
.pa-overlap-fund-pct { font-size: 11px; color: var(--primary, #3b82f6); font-weight: 600; font-variant-numeric: tabular-nums; }

/* ===== 动画 ===== */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 500px; } }

/* ===== 响应式 ===== */
@media (max-width: 600px) {
    .pa-risk-metrics { grid-template-columns: repeat(2, 1fr); }
    .pa-div-grid { flex-direction: column; }
    .pa-sector-layout { flex-direction: column; }
    .pa-sector-chart-wrap { width: 100%; display: flex; justify-content: center; }
    .pa-sector-name { max-width: 60px; }
    .pa-div-indicators { grid-template-columns: repeat(2, 1fr); width: 100%; }
    .pa-dd-modal { width: 98%; max-height: 92vh; border-radius: 12px; }
    .pa-dd-modal-header { padding: 12px 14px; }
    .pa-dd-modal-body { padding: 12px 14px; }
    .pa-dd-stats-bar { flex-direction: column; gap: 8px; padding: 10px; }
    .pa-dd-stat-divider { width: 80%; height: 1px; }
    .pa-dd-peak-cards { flex-direction: column; }
    .pa-dd-peak-arrow { flex-direction: row; min-width: auto; }
    .pa-dd-arrow-line { width: 8px; height: 2px; }
    .pa-dd-table th, .pa-dd-table td { padding: 7px 8px; font-size: 11px; }
    .pa-dd-name { max-width: 100px; }
}
`;

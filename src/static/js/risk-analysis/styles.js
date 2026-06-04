/** 风险分析样式模块 — 随风险分析功能懒加载，隔离风险分析专用样式。 */
export const RISK_ANALYSIS_CSS = `
/* ===== 风险分析页面基础 ===== */
.risk-analysis-page {
    display: flex; flex-direction: column; gap: 12px; padding: 4px 0;
}

/* ===== 内部子标签导航 ===== */
.ra-sub-tabs {
    display: flex; gap: 4px; flex-wrap: wrap;
    background: var(--card); border-radius: var(--radius);
    padding: 8px 10px; box-shadow: var(--shadow);
}
.ra-sub-tab {
    background: var(--bg); color: var(--text3); border: 1px solid var(--border);
    border-radius: 8px; padding: 7px 16px; font-size: 13px;
    font-weight: 600; cursor: pointer; transition: all .15s; white-space: nowrap;
}
.ra-sub-tab:hover { border-color: var(--primary); color: var(--primary); }
.ra-sub-tab.active {
    background: var(--primary); color: #fff; border-color: var(--primary);
}

/* ===== 子面板容器 ===== */
.ra-panel { display: none; }
.ra-panel.active { display: block; }

/* ===== 通用卡片 ===== */
.ra-card {
    background: var(--card); border-radius: var(--radius);
    box-shadow: var(--shadow); overflow: hidden;
}
.ra-card-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid var(--border);
}
.ra-card-header h3 { margin: 0; font-size: 14px; font-weight: 700; color: var(--text); }
.ra-card-subtitle {
    font-size: 11px; color: var(--text3); font-weight: 400; margin-left: 8px;
}
.ra-card-body { padding: 14px; }
.ra-card-body-compact { padding: 10px 12px; }

/* ===== 网格布局 ===== */
.ra-grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ra-grid-2col-wide { display: grid; grid-template-columns: 2fr 3fr; gap: 12px; }
.ra-grid-3col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.ra-grid-4col { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.ra-full { grid-column: 1 / -1; }

/* ===== 指标卡片 ===== */
.ra-metric-card {
    background: var(--bg); border-radius: 10px; padding: 12px;
    text-align: center; border: 1px solid var(--border);
    transition: transform .15s, box-shadow .15s;
}
.ra-metric-card:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.ra-metric-label { font-size: 10px; color: var(--text3); margin-bottom: 4px; }
.ra-metric-value { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--text); line-height: 1.2; }
.ra-metric-value.up { color: var(--up, #ff6b7a); }
.ra-metric-value.down { color: var(--down, #35e89b); }
.ra-metric-desc { font-size: 10px; color: var(--text3); margin-top: 3px; }

/* ===== 图表容器 ===== */
.ra-chart-container { min-height: 280px; position: relative; }
.ra-chart-container canvas { width: 100% !important; height: 100% !important; }

/* ===== 区域标题 ===== */
.ra-section-title {
    font-size: 14px; font-weight: 700; color: var(--text);
    margin-bottom: 12px; display: flex; align-items: center; gap: 6px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
}
.ra-section-sub { font-size: 11px; color: var(--text3); font-weight: 400; margin-left: auto; }

/* ===== 情景卡片（压力测试） ===== */
.ra-scenario-card {
    background: var(--bg); border-radius: 10px; padding: 14px;
    border: 1px solid var(--border); transition: transform .15s, box-shadow .15s;
}
.ra-scenario-card:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.ra-scenario-name { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
.ra-scenario-period { font-size: 11px; color: var(--text3); margin-bottom: 8px; }
.ra-scenario-desc { font-size: 11px; color: var(--text2); line-height: 1.4; margin-bottom: 10px; }
.ra-scenario-metrics { display: flex; gap: 12px; flex-wrap: wrap; }
.ra-scenario-metric { display: flex; flex-direction: column; align-items: center; min-width: 60px; }
.ra-scenario-metric-label { font-size: 9px; color: var(--text3); margin-bottom: 2px; }
.ra-scenario-metric-value { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }

/* 严重程度指示器 */
.ra-severity { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
.ra-severity.extreme { background: rgba(239,68,68,.15); color: #ef4444; }
.ra-severity.severe { background: rgba(249,115,22,.15); color: #f97316; }
.ra-severity.moderate { background: rgba(245,162,85,.15); color: #f59e0b; }

/* ===== 韧性评分仪表 ===== */
.ra-resilience-gauge {
    display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 0;
}
.ra-gauge-ring {
    width: 140px; height: 140px; border-radius: 50%;
    background: conic-gradient(var(--primary, #3b82f6) calc(var(--pct, 0) * 1%), var(--bg) 0);
    display: flex; align-items: center; justify-content: center;
}
.ra-gauge-inner {
    width: 105px; height: 105px; border-radius: 50%; background: var(--card);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.ra-gauge-value { font-size: 28px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
.ra-gauge-label { font-size: 10px; color: var(--text3); }

/* ===== 表格（尾部风险-最差天） ===== */
.ra-table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid var(--border); }
.ra-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ra-table th {
    padding: 10px 12px; text-align: left; font-size: 11px; color: var(--text3);
    background: var(--bg); font-weight: 600; border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 1;
}
.ra-table td { padding: 9px 12px; border-bottom: 1px solid var(--border); }
.ra-table tbody tr { transition: background .12s; }
.ra-table tbody tr:hover { background: var(--bg); }
.ra-table tbody tr:last-child td { border-bottom: none; }

/* ===== 回撤区间时间线 ===== */
.ra-dd-timeline { display: flex; flex-direction: column; gap: 8px; }
.ra-dd-item {
    background: var(--bg); border-radius: 8px; padding: 10px 12px;
    border: 1px solid var(--border); display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.ra-dd-badge {
    background: rgba(239,68,68,.12); color: #ef4444; border-radius: 6px;
    padding: 3px 8px; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;
    min-width: 60px; text-align: center;
}
.ra-dd-detail { flex: 1; min-width: 0; }
.ra-dd-detail-label { font-size: 10px; color: var(--text3); }
.ra-dd-detail-value { font-size: 11px; color: var(--text2); }

/* ===== 窗口切换标签（滚动指标） ===== */
.ra-window-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.ra-window-tab {
    background: var(--bg); color: var(--text3); border: 1px solid var(--border);
    border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: 500;
    cursor: pointer; transition: all .15s;
}
.ra-window-tab:hover { border-color: var(--primary); color: var(--primary); }
.ra-window-tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }

/* ===== 加载/错误/空状态 ===== */
.ra-loading {
    display: flex; align-items: center; justify-content: center;
    padding: 30px 16px; color: var(--text3); font-size: 13px; gap: 8px;
}
.ra-error { text-align: center; padding: 30px 16px; }
.ra-error-msg { color: var(--up, #ff6b7a); font-size: 13px; margin-bottom: 12px; }
.ra-retry-btn {
    background: var(--primary); color: #fff; border: none;
    border-radius: 8px; padding: 8px 24px; font-size: 13px;
    font-weight: 600; cursor: pointer; transition: opacity .15s;
}
.ra-retry-btn:hover { opacity: .85; }
.ra-empty { text-align: center; color: var(--text3); padding: 30px 16px; font-size: 13px; }

/* ===== 涨跌颜色（全局） ===== */
.risk-analysis-page .up { color: var(--up, #ff6b7a); }
.risk-analysis-page .down { color: var(--down, #35e89b); }
.risk-analysis-page .flat { color: var(--flat, #999); }

/* ===== 共享工具类（dashboard 模块同源） ===== */
.dash-section-title {
    font-size: 14px; font-weight: 700; color: var(--text);
    margin-bottom: 12px; display: flex; align-items: center; gap: 6px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
}
.dash-empty { text-align: center; color: var(--text3); padding: 30px 16px; font-size: 13px; }

/* ===== 资产配置 - 子区域结构 ===== */
.dash-alloc-section {
    display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px;
}
.dash-alloc-section:last-child { margin-bottom: 0; }
.dash-alloc-subtitle {
    font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 4px;
}

/* ===== 资产配置 - Doughnut 图表 ===== */
.dash-doughnut-wrap {
    display: flex; align-items: center; gap: 24px; justify-content: center; flex-wrap: wrap;
}
.dash-doughnut-canvas-wrap {
    position: relative; width: 160px; height: 160px; flex-shrink: 0;
}
.dash-doughnut-canvas-wrap canvas { display: block; width: 100% !important; height: 100% !important; }
.dash-doughnut-center {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    text-align: center; pointer-events: none;
}
.dash-doughnut-center-label { font-size: 10px; color: var(--text3); }
.dash-doughnut-center-value {
    font-size: 22px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums;
}

/* ===== 资产配置 - 图例 ===== */
.dash-legend { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.dash-legend-item {
    display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text2);
}
.dash-legend-dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.dash-legend-name {
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dash-legend-pct {
    font-weight: 700; font-variant-numeric: tabular-nums;
    min-width: 42px; text-align: right; color: var(--text);
}

/* ===== 资产配置 - 风险等级条 ===== */
.dash-risk-list { display: flex; flex-direction: column; gap: 8px; }
.dash-risk-row { display: flex; align-items: center; gap: 10px; }
.dash-risk-label {
    font-size: 12px; font-weight: 600; color: var(--text2); min-width: 60px; flex-shrink: 0;
}
.dash-risk-track {
    flex: 1; height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; min-width: 40px;
}
.dash-risk-fill { height: 100%; border-radius: 4px; transition: width .5s ease; }
.dash-risk-fill.high { background: #ef4444; }
.dash-risk-fill.medium { background: #f59e0b; }
.dash-risk-fill.low { background: #22c55e; }
.dash-risk-pct {
    font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;
    min-width: 48px; text-align: right; color: var(--text);
}

/* ===== 资产配置 - 集中度指标 ===== */
.dash-concentration-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.dash-conc-card {
    background: var(--bg); border-radius: 10px; padding: 12px;
    text-align: center; border: 1px solid var(--border);
}
.dash-conc-label { font-size: 10px; color: var(--text3); margin-bottom: 4px; }
.dash-conc-value {
    font-size: 18px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums;
}
.dash-conc-desc { font-size: 10px; color: var(--text3); margin-top: 3px; }

/* ===== 组合健康指标卡片网格 ===== */
.dash-indicator-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px;
}
.dash-indicator-grid:last-child { margin-bottom: 0; }
.dash-indicator-card {
    background: var(--bg); border-radius: 10px; padding: 10px 8px;
    text-align: center; border: 1px solid var(--border);
    transition: transform .15s, box-shadow .15s; cursor: default;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
}
.dash-indicator-card:hover {
    transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,.08);
}
.dash-indicator-label {
    font-size: 11px; color: var(--text3); margin-bottom: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;
}
.dash-indicator-value {
    font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums;
    color: var(--text); line-height: 1.2;
}
.dash-indicator-badge {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 10px; font-weight: 600; margin-top: 4px;
}
.dash-indicator-badge.good { background: rgba(34,197,94,.15); color: #22c55e; }
.dash-indicator-badge.moderate { background: rgba(245,158,11,.15); color: #f59e0b; }
.dash-indicator-badge.poor { background: rgba(239,68,68,.15); color: #ef4444; }

/* ===== MPT 高级分析 - 布局 ===== */
.alloc-metrics-pair { display: flex; gap: 14px; margin-bottom: 14px; }
.alloc-metrics-pair:last-child { margin-bottom: 0; }
.alloc-advanced-card {
    background: var(--bg); border-radius: 12px; padding: 16px;
    border: 1px solid var(--border); flex: 1; min-width: 0;
}
.alloc-advanced-card-title {
    font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 2px;
}
.alloc-advanced-card-subtitle {
    font-size: 11px; color: var(--text3); margin-bottom: 10px;
}

/* ===== MPT 高级分析 - 图表容器 ===== */
.alloc-scatter-wrap, .alloc-bar-wrap {
    position: relative; overflow: hidden; height: 260px;
}
.alloc-scatter-wrap canvas, .alloc-bar-wrap canvas {
    max-width: 100%;
}

/* ===== MPT 高级分析 - 分散化比率仪表盘 ===== */
.alloc-gauge-container {
    display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 0;
}
.alloc-gauge-ring {
    width: 160px; height: 160px; border-radius: 50%;
    background: conic-gradient(var(--primary, #3b82f6) calc(var(--pct, 0) * 1%), var(--bg) 0);
    display: flex; align-items: center; justify-content: center;
}
.alloc-gauge-inner {
    width: 120px; height: 120px; border-radius: 50%; background: var(--bg);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.alloc-gauge-value {
    font-size: 24px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums;
}
.alloc-gauge-label { font-size: 10px; color: var(--text3); }
.alloc-gauge-desc { font-size: 13px; font-weight: 600; color: var(--text2); text-align: center; }
.alloc-gauge-detail { font-size: 11px; color: var(--text3); text-align: center; margin-top: 4px; }

/* ===== MPT 高级分析 - 热力图 ===== */
.alloc-heatmap-full { flex-basis: 100%; width: 100%; }
.alloc-heatmap-wrap {
    overflow: auto; display: flex; justify-content: center; padding: 8px 0;
}
.alloc-heatmap-legend {
    display: flex; align-items: center; gap: 8px; justify-content: center;
    margin-top: 8px; font-size: 10px; color: var(--text3);
}
.alloc-heatmap-legend-bar {
    width: 120px; height: 10px; border-radius: 5px;
    background: linear-gradient(90deg, #3b82f6, #fff, #ef4444);
}

/* ===== MPT 高级分析 - ENB 有效独立赌注 ===== */
.alloc-enb-container { display: flex; flex-direction: column; gap: 10px; }
.alloc-enb-card {
    background: var(--bg); border-radius: 10px; padding: 14px;
    text-align: center; border: 1px solid var(--border);
}
.alloc-enb-value {
    font-size: 28px; font-weight: 800; color: var(--primary); font-variant-numeric: tabular-nums;
}
.alloc-enb-sub { font-size: 11px; color: var(--text3); margin-top: 4px; }
.alloc-enb-eigen-bars { display: flex; flex-direction: column; gap: 6px; }
.alloc-enb-eigen-bar-row { display: flex; align-items: center; gap: 8px; }
.alloc-enb-eigen-label {
    font-size: 11px; font-weight: 600; color: var(--text3); min-width: 24px; text-align: right;
}
.alloc-enb-eigen-track {
    flex: 1; height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden; min-width: 30px;
}
.alloc-enb-eigen-fill {
    height: 100%; border-radius: 3px; background: var(--primary); transition: width .5s ease;
}
.alloc-enb-eigen-val {
    font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums;
    color: var(--text2); min-width: 36px; text-align: right;
}

/* ===== 响应式 ===== */
@media (max-width: 1100px) {
    .ra-grid-2col-wide { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 768px) {
    .ra-grid-2col, .ra-grid-2col-wide { grid-template-columns: 1fr; }
    .ra-grid-3col { grid-template-columns: 1fr 1fr; }
    .ra-grid-4col { grid-template-columns: repeat(2, 1fr); }
    .ra-sub-tabs { flex-wrap: wrap; }
    .ra-scenario-metrics { flex-direction: column; align-items: flex-start; }
    .dash-indicator-grid { grid-template-columns: repeat(2, 1fr); }
    .dash-concentration-grid { grid-template-columns: repeat(2, 1fr); }
    .dash-doughnut-wrap { flex-direction: column; align-items: center; }
    .alloc-metrics-pair { flex-direction: column; }
    .alloc-scatter-wrap, .alloc-bar-wrap { height: 220px; }
}
@media (max-width: 480px) {
    .ra-grid-3col { grid-template-columns: 1fr; }
    .ra-grid-4col { grid-template-columns: 1fr; }
    .ra-metric-value { font-size: 16px; }
    .dash-indicator-grid { grid-template-columns: 1fr; }
    .dash-concentration-grid { grid-template-columns: 1fr; }
    .alloc-gauge-ring { width: 120px; height: 120px; }
    .alloc-gauge-inner { width: 90px; height: 90px; }
    .alloc-gauge-value { font-size: 18px; }
    .alloc-enb-value { font-size: 22px; }
}
`;

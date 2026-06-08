/** 情绪页样式模块 — 随情绪功能懒加载，隔离仪表盘和列表组件样式。 */
export const SENTIMENT_CSS = `
.sentiment-page { display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }

/* 仪表盘卡片 */
.sentiment-gauge-card {
    background: var(--card); border-radius: var(--radius);
    padding: 16px 16px 12px; box-shadow: var(--shadow); text-align: center;
}
.sentiment-gauge-wrap { position: relative; width: 200px; height: 156px; margin: 0 auto 10px; }
.sentiment-gauge-wrap canvas { width: 200px !important; height: 130px !important; }
.sentiment-gauge-center {
    position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%);
    text-align: center; pointer-events: none;
}
.sentiment-score { font-size: 28px; font-weight: 800; line-height: 1; }
.sentiment-label { font-size: 12px; font-weight: 600; margin-top: 2px; }
.sentiment-advice {
    font-size: 12px; color: var(--text2);
    margin-top: 8px; padding: 10px 12px;
    background: var(--bg); border-radius: 8px; line-height: 1.6;
    clear: both;
}

/* 指标卡片 — 3列×2行 */
.sentiment-indicators {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
}
.sentiment-ind-card {
    background: var(--card); border-radius: var(--radius);
    padding: 12px 8px; text-align: center; box-shadow: var(--shadow);
    transition: transform .15s, box-shadow .15s, border-color .15s;
    border: 2px solid transparent;
}
.sentiment-ind-card:hover { transform: translateY(-1px); box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
.sentiment-ind-card.clickable-card { cursor: pointer; }
.sentiment-ind-card.clickable-card:active { transform: scale(0.97); }
.sentiment-ind-card.clickable-card.active {
    border-color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary), 0 2px 12px rgba(26,115,232,0.15);
}
.sentiment-ind-label { font-size: 11px; color: var(--text3); margin-bottom: 6px; }
.sentiment-ind-value { font-size: 13px; font-weight: 700; word-break: break-all; }
.card-expand-hint {
    font-size: 9px; color: var(--primary); margin-top: 4px;
    opacity: 0.7; transition: opacity .15s;
}
.clickable-card:hover .card-expand-hint { opacity: 1; }

/* ===== 详情面板（手风琴） ===== */
.sentiment-detail-panel {
    max-height: 0; overflow: hidden; opacity: 0;
    transition: max-height .35s ease, opacity .25s ease, padding .25s ease;
    background: var(--card); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 0 14px;
}
.sentiment-detail-panel.show {
    max-height: 1600px; opacity: 1; padding: 14px;
}
.detail-panel-header {
    font-size: 14px; font-weight: 700; margin-bottom: 12px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
}
.detail-chart-area { position: relative; margin: 10px 0; }
.detail-empty { text-align: center; color: var(--text3); padding: 20px; font-size: 13px; }

/* 涨跌比详情 */
.breadth-hero-card {
    text-align: center; margin: 4px 0 12px; padding: 14px 12px;
    background: linear-gradient(135deg, var(--bg), rgba(26,115,232,.08));
    border-radius: 12px; border: 1px solid var(--border);
}
.breadth-hero-card.up { background: linear-gradient(135deg, rgba(231,76,60,.08), var(--bg)); }
.breadth-hero-card.down { background: linear-gradient(135deg, rgba(39,174,96,.08), var(--bg)); }
.breadth-hero-label { font-size: 11px; color: var(--text3); margin-bottom: 4px; }
.breadth-hero-value { font-size: 38px; font-weight: 800; line-height: 1; }
.breadth-hero-sub { font-size: 12px; color: var(--text2); margin-top: 6px; }
.breadth-stats-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px;
}
.breadth-stat-card {
    text-align: center; padding: 10px 6px; background: var(--bg);
    border-radius: 10px; border: 1px solid var(--border);
}
.breadth-stat-card strong { display: block; font-size: 20px; font-weight: 800; line-height: 1; color: var(--text); }
.breadth-stat-card span { display: block; font-size: 11px; color: var(--text3); margin-top: 5px; }
.breadth-stat-card.up strong { color: var(--up); }
.breadth-stat-card.down strong { color: var(--down); }
.breadth-stat-card.flat strong { color: var(--flat); }
.breadth-ratio-stack {
    display: flex; height: 18px; overflow: hidden; border-radius: 999px;
    background: var(--bg); border: 1px solid var(--border);
}
.breadth-ratio-segment { min-width: 2px; transition: width .5s ease; }
.breadth-ratio-segment.up { background: linear-gradient(90deg, rgba(231,76,60,.55), rgba(231,76,60,.9)); }
.breadth-ratio-segment.down { background: linear-gradient(90deg, rgba(39,174,96,.55), rgba(39,174,96,.9)); }
.breadth-ratio-segment.flat { background: linear-gradient(90deg, rgba(245,166,35,.55), rgba(245,166,35,.9)); }
.breadth-ratio-legend {
    display: flex; justify-content: center; flex-wrap: wrap; gap: 10px;
    margin: 8px 0 10px; font-size: 11px; color: var(--text2);
}
.legend-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 4px; }
.legend-dot.up { background: var(--up); }
.legend-dot.down { background: var(--down); }
.legend-dot.flat { background: var(--flat); }
.breadth-summary {
    font-size: 12px; color: var(--text2); line-height: 1.7;
    padding: 10px; background: var(--bg); border-radius: 8px;
}

/* 北向资金详情 */
.northbound-main-card {
    text-align: center; padding: 16px 12px; margin: 4px 0 12px;
    border-radius: 14px; border: 1px solid var(--border);
    background: linear-gradient(135deg, var(--bg), rgba(26,115,232,.08));
}
.northbound-main-card.up { background: linear-gradient(135deg, rgba(231,76,60,.1), var(--bg)); }
.northbound-main-card.down { background: linear-gradient(135deg, rgba(39,174,96,.1), var(--bg)); }
.northbound-main-label { font-size: 11px; color: var(--text3); margin-bottom: 4px; }
.northbound-amount { font-size: 40px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.northbound-flow-badge {
    display: inline-block; margin-top: 8px; padding: 3px 10px;
    border-radius: 999px; font-size: 11px; font-weight: 700;
    background: rgba(26,115,232,.12); color: var(--primary);
}
.northbound-flow-badge.up { background: rgba(231,76,60,.12); color: var(--up); }
.northbound-flow-badge.down { background: rgba(39,174,96,.12); color: var(--down); }
.northbound-flow-badge.flat { background: rgba(245,166,35,.14); color: var(--flat); }
.northbound-meta-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px;
}
.northbound-meta-card {
    padding: 10px 8px; background: var(--bg); border: 1px solid var(--border);
    border-radius: 10px; text-align: center; min-width: 0;
}
.northbound-meta-card span { display: block; font-size: 11px; color: var(--text3); margin-bottom: 5px; }
.northbound-meta-card strong { display: block; font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.northbound-summary {
    font-size: 12px; color: var(--text2); line-height: 1.7;
    padding: 10px; background: var(--bg); border-radius: 8px;
}
@media (max-width: 420px) {
    .breadth-stats-grid { grid-template-columns: repeat(2, 1fr); }
    .northbound-meta-grid { grid-template-columns: 1fr; }
}

/* 成交量详情 */
.volume-main-stat { text-align: center; margin: 8px 0 12px; }
.volume-big-num { font-size: 36px; font-weight: 800; color: var(--text); line-height: 1; }
.volume-unit { font-size: 14px; font-weight: 500; color: var(--text3); margin-left: 2px; }
.volume-compare { font-size: 12px; color: var(--text2); margin-top: 6px; }
.vol-tag {
    display: inline-block; font-size: 10px; font-weight: 600;
    padding: 1px 6px; border-radius: 8px; margin-left: 6px;
}
.vol-up { background: rgba(231,76,60,.12); color: var(--up); }
.vol-down { background: rgba(39,174,96,.12); color: var(--down); }
.volume-summary {
    font-size: 12px; color: var(--text2); line-height: 1.7;
    padding: 10px; background: var(--bg); border-radius: 8px; margin-top: 8px;
}

/* 板块涨跌详情 */
.sector-stats-row {
    display: flex; justify-content: center; gap: 20px; margin-bottom: 12px;
}
.sector-stat { text-align: center; }
.sector-stat strong, .sector-stat > div:first-child { font-size: 22px; font-weight: 800; display: block; }
.sector-stat span { font-size: 11px; color: var(--text3); }
.sector-summary {
    font-size: 12px; color: var(--text2); line-height: 1.7;
    padding: 10px; background: var(--bg); border-radius: 8px; margin-top: 8px;
}

/* 赚钱效应详情 */
.effect-score-card { text-align: center; margin: 8px 0 16px; }
.effect-score-num { font-size: 42px; font-weight: 800; line-height: 1; }
.effect-score-label { font-size: 13px; font-weight: 600; margin-top: 4px; }
.effect-compare-section { margin: 0 0 12px; }
.effect-bar-row {
    display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
}
.effect-bar-label { font-size: 11px; color: var(--text3); min-width: 72px; text-align: right; flex-shrink: 0; }
.effect-bar-track {
    flex: 1; height: 14px; background: var(--bg); border-radius: 7px; overflow: hidden;
}
.effect-bar-fill { height: 100%; border-radius: 7px; transition: width .5s ease; }
.effect-bar-fill.up { background: linear-gradient(90deg, rgba(231,76,60,.5), rgba(231,76,60,.85)); }
.effect-bar-fill.down { background: linear-gradient(90deg, rgba(39,174,96,.5), rgba(39,174,96,.85)); }
.effect-bar-val { font-size: 12px; font-weight: 700; min-width: 60px; text-align: left; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.effect-ratio-row { text-align: center; font-size: 13px; color: var(--text2); margin-top: 10px; }
.effect-ratio-divider { margin: 0 10px; color: var(--text3); }
.effect-summary {
    font-size: 12px; color: var(--text2); line-height: 1.7;
    padding: 10px; background: var(--bg); border-radius: 8px;
}

/* 涨跌停详情 */
.limit-detail-numbers {
    display: flex; justify-content: center; align-items: center; gap: 16px; margin: 8px 0 12px;
}
.limit-detail-box { text-align: center; }
.limit-detail-big { font-size: 36px; font-weight: 800; line-height: 1; }
.limit-detail-box.up .limit-detail-big { color: var(--up); }
.limit-detail-box.down .limit-detail-big { color: var(--down); }
.limit-detail-label { font-size: 12px; color: var(--text3); margin-top: 2px; }
.limit-detail-vs { font-size: 14px; font-weight: 700; color: var(--text3); }
.limit-doughnut-wrap { text-align: center; margin: 8px 0; }
.limit-doughnut-wrap canvas { display: inline-block; }
.limit-industry-section { margin: 12px 0 0; }
.limit-industry-title { font-size: 12px; font-weight: 600; color: var(--text2); margin-bottom: 8px; }
.limit-industry-row {
    display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.limit-industry-name { font-size: 11px; min-width: 60px; text-align: right; flex-shrink: 0; color: var(--text2); }
.limit-industry-bar-track {
    flex: 1; height: 12px; background: var(--bg); border-radius: 6px; overflow: hidden;
}
.limit-industry-bar-fill {
    height: 100%; border-radius: 6px;
    background: linear-gradient(90deg, rgba(231,76,60,.4), rgba(231,76,60,.8));
    transition: width .5s ease;
}
.limit-industry-bar-fill.up {
    background: linear-gradient(90deg, rgba(231,76,60,.4), rgba(231,76,60,.8));
}
.limit-industry-bar-fill.down {
    background: linear-gradient(90deg, rgba(39,174,96,.4), rgba(39,174,96,.8));
}
.limit-industry-count { font-size: 11px; font-weight: 600; min-width: 30px; color: var(--text2); }
.limit-summary {
    font-size: 12px; color: var(--text2); line-height: 1.7;
    padding: 10px; background: var(--bg); border-radius: 8px; margin-top: 10px;
}

/* 涨跌停列表 */
.limit-stocks-section { background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow); padding: 12px; }
.limit-stocks-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 10px; font-weight: 700; font-size: 14px;
}
.limit-tabs { display: flex; gap: 4px; }
.limit-tab {
    background: var(--bg); border: 1px solid var(--border); border-radius: 16px;
    padding: 4px 12px; font-size: 12px; cursor: pointer; color: var(--text2);
    transition: all .15s; font-weight: 500;
}
.limit-tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.limit-tab:hover:not(.active) { border-color: var(--primary); }
.limit-count {
    display: inline-block; min-width: 18px; text-align: center;
    font-size: 10px; font-weight: 700; border-radius: 8px; padding: 1px 4px;
}
.limit-count.up { background: rgba(231,76,60,.15); }
.limit-count.down { background: rgba(39,174,96,.15); }
.limit-data-meta { font-size: 11px; color: var(--text3); margin: -4px 0 8px; }

.limit-stocks-list {
    max-height: 320px; overflow-y: auto;
    -webkit-overflow-scrolling: touch;
}
.limit-stock-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border-radius: 8px;
    cursor: pointer; transition: background .12s;
    border-bottom: 1px solid var(--border);
}
.limit-stock-row:last-child { border-bottom: none; }
.limit-stock-row:hover { background: var(--bg); }
.limit-stock-row:active { transform: scale(0.99); }
.limit-stock-up { border-left: 3px solid var(--up); }
.limit-stock-down { border-left: 3px solid var(--down); }
.limit-stock-name { font-weight: 600; font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.limit-stock-code { color: var(--text3); font-size: 11px; flex-shrink: 0; }
.limit-stock-price { font-size: 12px; font-variant-numeric: tabular-nums; min-width: 50px; text-align: right; flex-shrink: 0; }
.limit-stock-change { font-weight: 600; font-size: 12px; font-variant-numeric: tabular-nums; min-width: 55px; text-align: right; flex-shrink: 0; }
.limit-stock-arrow { color: var(--text3); font-size: 16px; flex-shrink: 0; }
.limit-empty { text-align: center; color: var(--text3); padding: 20px; font-size: 13px; }

/* 股票→基金弹窗 */
.stock-funds-list { display: flex; flex-direction: column; gap: 2px; }
.sf-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: 8px;
    border-bottom: 1px solid var(--border);
    transition: background .12s;
}
.sf-row:last-child { border-bottom: none; }
.sf-row:hover { background: var(--bg); }
.sf-info { flex: 1; min-width: 0; }
.sf-name { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sf-meta { display: flex; gap: 6px; align-items: center; margin-top: 3px; }
.sf-code { font-size: 11px; color: var(--text3); }
.sf-type {
    font-size: 10px; background: var(--bg); border-radius: 4px;
    padding: 1px 6px; color: var(--text2);
}
.sf-pct { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; min-width: 50px; text-align: right; color: var(--primary); }
.sf-add-btn {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--primary); color: #fff; border: none;
    font-size: 18px; font-weight: 700; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background .15s, transform .1s;
    line-height: 1;
}
.sf-add-btn:hover { background: var(--primary-dark); }
.sf-add-btn:active { transform: scale(0.9); }

/* ETF区域 */
.etf-section { background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow); padding: 12px; }
.etf-chart-wrap { position: relative; height: 220px; margin: 8px 0; }
.etf-list { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
.etf-item {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 8px; font-size: 11px;
    border-bottom: 1px solid var(--border);
}
.etf-item:last-child { border-bottom: none; }
.etf-rank { width: 18px; text-align: center; font-size: 10px; color: var(--text3); flex-shrink: 0; }
.etf-rank.top3 { color: var(--up); font-weight: 700; }
.etf-name { font-weight: 500; min-width: 0; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 1; }
.etf-code { color: var(--text3); font-size: 9px; flex-shrink: 0; }
.etf-change { font-weight: 600; font-variant-numeric: tabular-nums; min-width: 50px; text-align: right; flex-shrink: 0; }
.etf-inflow-bar-wrap {
    flex: 1; min-width: 80px; position: relative; height: 18px;
    background: var(--bg); border-radius: 9px; overflow: hidden;
}
.etf-inflow-bar {
    height: 100%; border-radius: 9px; transition: width .5s ease;
    min-width: 2px;
}
.etf-inflow-val {
    position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
    font-size: 10px; font-weight: 600; font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

/* ETF总结 */
.etf-summary {
    margin-top: 10px; padding: 12px;
    background: var(--bg); border-radius: 10px;
}
.etf-summary-header { font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.etf-summary-stats {
    display: flex; justify-content: space-around; margin-bottom: 10px;
    padding: 8px 0; border-bottom: 1px solid var(--border);
}
.etf-stat-item { text-align: center; }
.etf-stat-label { font-size: 10px; color: var(--text3); margin-bottom: 2px; }
.etf-stat-value { font-size: 14px; font-weight: 700; }
.etf-summary-text { font-size: 12px; color: var(--text2); line-height: 1.7; }

/* 板块涨跌详情 — 全板块列表 */
.sector-detail-list {
    max-height: 360px; overflow-y: auto;
    -webkit-overflow-scrolling: touch; margin-top: 10px;
}
.sector-detail-row {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 10px; border-radius: 8px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
}
.sector-detail-row:last-child { border-bottom: none; }
.sector-detail-row:hover { background: var(--bg); }
.sector-detail-name { font-weight: 600; font-size: 13px; min-width: 70px; flex-shrink: 0; }
.sector-leader { font-size: 11px; color: var(--text3); flex-shrink: 0; }
.sector-updown { font-size: 11px; flex-shrink: 0; }
.sector-detail-change { font-weight: 700; font-size: 13px; margin-left: auto; font-variant-numeric: tabular-nums; }

/* ETF Tab切换 */
.etf-section-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
}
.etf-tabs { display: flex; gap: 4px; }
.etf-tab {
    background: var(--bg); border: 1px solid var(--border); border-radius: 16px;
    padding: 4px 12px; font-size: 12px; cursor: pointer; color: var(--text2);
    transition: all .15s; font-weight: 500;
}
.etf-tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.etf-tab:hover:not(.active) { border-color: var(--primary); }
.etf-tab-panel { display: none; }
.etf-tab-panel.show { display: block; }

/* ETF持续流入流出 */
.consecutive-filter { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.consecutive-filter-btn {
    background: var(--bg); border: 1px solid var(--border); border-radius: 14px;
    padding: 4px 10px; font-size: 12px; cursor: pointer; color: var(--text2);
    transition: all .15s; font-weight: 500;
}
.consecutive-filter-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.consecutive-filter-btn:hover:not(.active) { border-color: var(--primary); }
.consecutive-flow-tabs { display: flex; gap: 8px; margin: 0 0 12px; }
.consecutive-flow-btn {
    background: var(--bg); border: 1px solid var(--border); border-radius: 14px;
    padding: 4px 12px; font-size: 12px; cursor: pointer; color: var(--text2);
    transition: all .15s; font-weight: 600;
}
.consecutive-flow-btn.up.active { background: rgba(239,68,68,.12); color: var(--up); border-color: var(--up); }
.consecutive-flow-btn.down.active { background: rgba(34,197,94,.12); color: var(--down); border-color: var(--down); }
.consecutive-flow-btn:hover:not(.active) { border-color: var(--primary); }
.consecutive-summary { font-size: 12px; color: var(--text3); margin-bottom: 10px; }
.consecutive-section { margin-bottom: 12px; }
.consecutive-title { font-size: 13px; font-weight: 700; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
.consecutive-row {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 10px; border-radius: 8px;
    border-bottom: 1px solid var(--border); font-size: 12px;
}
.consecutive-row:last-child { border-bottom: none; }
.consecutive-row:hover { background: var(--bg); }
.consecutive-rank { width: 18px; text-align: center; font-size: 10px; color: var(--text3); flex-shrink: 0; }
.consecutive-rank.top3 { color: var(--up); font-weight: 700; }
.consecutive-name { font-weight: 500; min-width: 0; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 1; }
.consecutive-code { color: var(--text3); font-size: 10px; flex-shrink: 0; }
.consecutive-days { font-weight: 700; min-width: 40px; text-align: center; flex-shrink: 0; }
.consecutive-flow { font-weight: 600; margin-left: auto; font-variant-numeric: tabular-nums; flex-shrink: 0; }

@media (max-width: 600px) {
    .sentiment-indicators { grid-template-columns: repeat(2, 1fr); }
    .limit-stock-price { display: none; }
    .etf-chart-wrap { height: 180px; }
    .etf-name { max-width: 70px; }
    .effect-bar-label { min-width: 56px; font-size: 10px; }
    .sector-detail-name { min-width: 55px; font-size: 12px; }
    .consecutive-name { max-width: 80px; }
}
`;

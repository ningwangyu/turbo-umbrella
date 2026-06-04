/** 仪表盘样式模块 — 随仪表盘功能懒加载，隔离仪表盘专用样式。 */
export const DASHBOARD_CSS = `
/* ===== 仪表盘页面基础 ===== */
.dashboard-page {
    display: flex; flex-direction: column; gap: 12px; padding: 4px 0;
}

/* ===== 市场数据栏 ===== */
.dashboard-market-bar {
    background: var(--card); border-radius: var(--radius);
    padding: 12px 14px; box-shadow: var(--shadow);
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 10px;
}
.dash-bar-left {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.dash-bar-right {
    display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.dash-clock {
    font-size: 18px; font-weight: 800; color: var(--text);
    font-variant-numeric: tabular-nums; letter-spacing: .5px;
}
.dash-date {
    font-size: 11px; color: var(--text3); margin-left: 2px;
}
.dash-market-divider {
    width: 1px; height: 28px; background: var(--border); flex-shrink: 0;
}
.dash-index-group {
    display: flex; gap: 14px; flex-wrap: wrap;
}
.dash-index-item {
    display: flex; flex-direction: column; align-items: center;
    min-width: 80px;
}
.dash-index-name {
    font-size: 10px; color: var(--text3); font-weight: 500;
    margin-bottom: 2px; white-space: nowrap;
}
.dash-index-value {
    font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums;
    line-height: 1.2;
}
.dash-index-change {
    font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums;
    margin-top: 1px;
}
.dash-turnover {
    display: flex; flex-direction: column; align-items: center; min-width: 70px;
}
.dash-turnover-label {
    font-size: 10px; color: var(--text3); margin-bottom: 2px;
}
.dash-turnover-value {
    font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums;
    color: var(--text);
}
.dash-refresh-btn {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--bg); border: 1px solid var(--border);
    color: var(--text2); font-size: 14px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all .15s; flex-shrink: 0;
}
.dash-refresh-btn:hover {
    border-color: var(--primary); color: var(--primary);
    background: rgba(26,115,232,.06);
}
.dash-refresh-btn:active { transform: scale(0.92); }
.dash-refresh-btn.spinning { animation: dashSpin .8s linear infinite; }
@keyframes dashSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ===== 汇总卡片 ===== */
.dashboard-summary-cards {
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
}
.dash-summary-card {
    background: var(--card); border-radius: var(--radius);
    padding: 14px 10px; text-align: center; box-shadow: var(--shadow);
    transition: transform .15s, box-shadow .15s;
}
.dash-summary-card:hover {
    transform: translateY(-1px); box-shadow: 0 2px 12px rgba(0,0,0,0.1);
}
.dash-summary-label {
    font-size: 11px; color: var(--text3); margin-bottom: 6px; font-weight: 500;
}
.dash-summary-value {
    font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums;
    color: var(--text); line-height: 1.2;
}
.dash-summary-value.up { color: var(--up, #ff6b7a); }
.dash-summary-value.down { color: var(--down, #35e89b); }

/* ===== 持仓明细表格 ===== */
.dash-holdings-table-wrap {
    overflow-x: auto; -webkit-overflow-scrolling: touch;
    border-radius: 10px; border: 1px solid var(--border);
}
.dash-holdings-table {
    width: 100%; border-collapse: collapse; font-size: 12px;
}
.dash-holdings-table th {
    padding: 10px 12px; text-align: left; font-size: 11px;
    color: var(--text3); background: var(--bg);
    font-weight: 600; border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 1;
    user-select: none; white-space: nowrap;
}
.dash-holdings-table th.sortable {
    cursor: pointer; transition: color .15s;
}
.dash-holdings-table th.sortable:hover {
    color: var(--primary);
}
.dash-holdings-table th.sortable::after {
    content: ''; display: inline-block; margin-left: 4px;
    width: 0; height: 0; vertical-align: middle;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-bottom: 4px solid var(--text3);
    opacity: .4;
}
.dash-holdings-table th.sort-asc::after {
    border-bottom: 4px solid var(--primary); opacity: 1;
    border-top: none;
}
.dash-holdings-table th.sort-desc::after {
    border-top: 4px solid var(--primary); opacity: 1;
    border-bottom: none; border-left: 4px solid transparent; border-right: 4px solid transparent;
}
.dash-holdings-table td {
    padding: 9px 12px; border-bottom: 1px solid var(--border);
}
.dash-holdings-table tbody tr {
    transition: background .12s;
}
.dash-holdings-table tbody tr:hover { background: var(--bg); }
.dash-holdings-table tbody tr:last-child td { border-bottom: none; }
.dash-holding-name {
    font-weight: 600; max-width: 120px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dash-holding-code {
    font-size: 10px; color: var(--text3); margin-left: 4px;
}
.dash-holding-money {
    font-weight: 700; font-variant-numeric: tabular-nums;
}
.dash-holding-pct {
    font-variant-numeric: tabular-nums; font-weight: 600;
}

/* 涨跌通用颜色类 */
.dash-holdings-table .up { color: var(--up, #ff6b7a); }
.dash-holdings-table .down { color: var(--down, #35e89b); }
.dash-holdings-table .flat { color: var(--flat, #999); }

/* ===== 区域标题 ===== */
.dash-section-title {
    font-size: 14px; font-weight: 700; color: var(--text);
    margin-bottom: 12px; display: flex; align-items: center; gap: 6px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
}
.dash-section-sub {
    font-size: 11px; color: var(--text3); font-weight: 400;
    margin-left: auto;
}

/* ===== 加载 / 错误 / 空状态 ===== */
.dash-loading {
    display: flex; align-items: center; justify-content: center;
    padding: 30px 16px; color: var(--text3); font-size: 13px;
    gap: 8px;
}
.dash-error {
    text-align: center; padding: 30px 16px;
}
.dash-error-msg {
    color: var(--up, #ff6b7a); font-size: 13px; margin-bottom: 12px;
}
.dash-retry-btn {
    background: var(--primary); color: #fff; border: none;
    border-radius: 8px; padding: 8px 24px; font-size: 13px;
    font-weight: 600; cursor: pointer; transition: opacity .15s;
}
.dash-retry-btn:hover { opacity: .85; }
.dash-retry-btn:active { transform: scale(0.97); }
.dash-empty {
    text-align: center; color: var(--text3); padding: 30px 16px;
    font-size: 13px;
}

/* ===== 仪表盘卡片容器 ===== */
.dashboard-card {
    background: var(--card);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
}
.dashboard-card-full {
    grid-column: 1 / -1;
}
.dashboard-card-body {
    padding: 14px;
}

/* ===== 涨跌颜色（全局） ===== */
.dashboard-page .up { color: var(--up, #ff6b7a); }
.dashboard-page .down { color: var(--down, #35e89b); }
.dashboard-page .flat { color: var(--flat, #999); }

/* ===== 响应式断点 ===== */
@media (max-width: 768px) {
    .dashboard-summary-cards {
        grid-template-columns: repeat(3, 1fr);
    }
    .dashboard-market-bar {
        flex-direction: column; align-items: stretch;
    }
    .dash-bar-left { justify-content: center; }
    .dash-bar-right { justify-content: center; }
    .dash-index-group { justify-content: center; }
}

@media (max-width: 480px) {
    .dashboard-summary-cards {
        grid-template-columns: repeat(2, 1fr);
    }
    .dash-summary-value { font-size: 15px; }
    .dash-index-value { font-size: 12px; }
    .dash-index-change { font-size: 10px; }
    .dash-holding-name { max-width: 80px; }
}
`;

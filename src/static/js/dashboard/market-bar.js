/**
 * 仪表盘市场数据栏组件 — 显示实时时钟、三大指数、成交额和刷新按钮。
 *
 * 实时时钟每秒自动更新；刷新按钮触发整个仪表盘数据重新加载。
 */
import { fmtTime, colorCls, showToast } from '../utils.js';
import { setIsLoading, isLoading } from './state.js';

/** 定时器句柄，销毁时清理 */
let clockTimer = null;

/**
 * 格式化指数点位（千分位分隔）。
 * @param {number} value - 指数点位
 * @returns {string} 格式化后的字符串
 */
function fmtIndexValue(value) {
    if (value == null) return '--';
    return Number(value).toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/**
 * 格式化涨跌幅（带正负号和百分号）。
 * @param {number} change - 涨跌幅百分比
 * @returns {string} 格式化后的字符串
 */
function fmtChange(change) {
    if (change == null) return '--';
    const n = Number(change);
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

/**
 * 格式化成交额（自动选择亿/万单位）。
 * @param {number} amount - 成交额（元）
 * @returns {string} 格式化后的字符串
 */
function fmtTurnover(amount) {
    if (amount == null) return '--';
    const n = Number(amount);
    if (n >= 100000000) {
        return (n / 100000000).toFixed(2) + '亿';
    }
    if (n >= 10000) {
        return (n / 10000).toFixed(2) + '万';
    }
    return n.toFixed(2);
}

/**
 * 渲染指数项 HTML。
 * @param {Object} index - { name, value, change }
 * @returns {string} HTML 字符串
 */
function renderIndexItem(index) {
    const cls = colorCls(index.change);
    return `
    <div class="dash-index-item">
        <span class="dash-index-name">${index.name || '--'}</span>
        <span class="dash-index-value ${cls}">${fmtIndexValue(index.value)}</span>
        <span class="dash-index-change ${cls}">${fmtChange(index.change)}</span>
    </div>`;
}

/**
 * 渲染市场数据栏。
 * @param {HTMLElement} container - 承载市场栏的 DOM 容器
 * @param {Object} data - overview 接口返回数据
 * @param {Function} onRefresh - 刷新按钮回调（重新加载整个仪表盘）
 */
export function renderMarketBar(container, data, onRefresh) {
    if (!container) return;

    // 清理旧定时器
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }

    const market = data?.market || {};
    const indicesRaw = market.indices || {};
    const indices = Object.values(indicesRaw).map(idx => ({
        name: idx.name,
        value: idx.price,
        change: idx.change_pct,
    }));
    const turnover = market.volume?.today;
    const now = new Date();

    // 构建 HTML
    let html = '<div class="dash-bar-left">';
    html += `<div class="dash-clock-wrap"><span class="dash-clock" id="dashClock">${fmtTime(now)}</span><span class="dash-date">${now.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' })}</span></div>`;
    html += '<div class="dash-market-divider"></div>';
    html += '<div class="dash-index-group">';
    indices.forEach(idx => { html += renderIndexItem(idx); });
    html += '</div>';

    if (turnover != null) {
        html += '<div class="dash-market-divider"></div>';
        html += `<div class="dash-turnover"><span class="dash-turnover-label">成交额</span><span class="dash-turnover-value">${fmtTurnover(turnover)}</span></div>`;
    }
    html += '</div>';

    // 右侧：刷新按钮
    html += `<div class="dash-bar-right">
        <button class="dash-refresh-btn" id="dashRefreshBtn" title="刷新数据">&#x21bb;</button>
    </div>`;

    container.innerHTML = html;

    // 启动实时时钟（每秒更新）
    const clockEl = container.querySelector('#dashClock');
    if (clockEl) {
        clockTimer = setInterval(() => {
            const t = new Date();
            clockEl.textContent = fmtTime(t);
        }, 1000);
    }

    // 绑定刷新按钮
    const refreshBtn = container.querySelector('#dashRefreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (isLoading) return;
            refreshBtn.classList.add('spinning');
            showToast('正在刷新...');
            // 执行回调（由 render.js 传入，会重置状态并重新加载）
            if (onRefresh) onRefresh();
            // 动画 800ms 后移除
            setTimeout(() => refreshBtn.classList.remove('spinning'), 800);
        });
    }
}

/**
 * 清理定时器（页面切换时调用）。
 */
export function cleanupMarketBar() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
}

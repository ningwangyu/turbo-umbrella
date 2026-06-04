/** 仪表盘主渲染模块 — 构建页面骨架，协调子模块渲染和数据加载。 */

import { holdings as holdingsRef } from '../state.js';
import { fetchDashboardOverview, fetchHoldingsDetail, fetchTimeline } from './api.js';
import {
    dashboardData, setDashboardData, setLastUpdateTime,
    isLoading, setIsLoading, loadError, setLoadError, resetDashboardState
} from './state.js';
import { renderMarketBar } from './market-bar.js';
import { renderHoldingsDetail } from './holdings-detail.js';
import { renderTimeline } from './timeline.js';
import { showToast } from '../utils.js';

function getHoldings() {
    return holdingsRef || [];
}

/**
 * 构建仪表盘 HTML 骨架。
 * 布局从上到下：市场数据栏 → 汇总卡片 → 持仓明细 → 事件时间线。
 */
function buildSkeleton() {
    return `
    <div class="dashboard-page">
        <!-- 第1行：市场数据栏 -->
        <div id="dashMarketBar" class="dashboard-market-bar"></div>

        <!-- 第2行：汇总卡片 -->
        <div id="dashSummaryCards" class="dashboard-summary-cards"></div>

        <!-- 第3行：持仓明细（全宽） -->
        <div class="dashboard-card dashboard-card-full">
            <div id="dashHoldingsDetail" class="dashboard-card-body"></div>
        </div>

        <!-- 第4行：事件时间线（全宽） -->
        <div class="dashboard-card dashboard-card-full">
            <div id="dashTimeline" class="dashboard-card-body"></div>
        </div>
    </div>`;
}

/**
 * 渲染汇总卡片区域（总资产、今日收益、收益率、基金数量）。
 */
function renderSummaryCards(container, overview) {
    if (!container || !overview) return;

    const portfolio = overview.portfolio || {};
    const totalValue = portfolio.total_value ?? 0;
    const todayProfit = portfolio.today_return ?? 0;
    const totalProfit = portfolio.total_profit ?? 0;
    const profitRate = portfolio.total_profit_pct ?? 0;
    const fundCount = portfolio.fund_count ?? 0;

    const profitClass = todayProfit >= 0 ? 'up' : 'down';
    const totalProfitClass = totalProfit >= 0 ? 'up' : 'down';
    const rateClass = profitRate >= 0 ? 'up' : 'down';

    container.innerHTML = `
    <div class="dash-summary-card">
        <div class="dash-summary-label">总资产(元)</div>
        <div class="dash-summary-value">${totalValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="dash-summary-card">
        <div class="dash-summary-label">今日收益</div>
        <div class="dash-summary-value ${profitClass}">${todayProfit >= 0 ? '+' : ''}${todayProfit.toFixed(2)}</div>
    </div>
    <div class="dash-summary-card">
        <div class="dash-summary-label">累计收益</div>
        <div class="dash-summary-value ${totalProfitClass}">${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}</div>
    </div>
    <div class="dash-summary-card">
        <div class="dash-summary-label">收益率</div>
        <div class="dash-summary-value ${rateClass}">${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%</div>
    </div>
    <div class="dash-summary-card">
        <div class="dash-summary-label">持仓基金</div>
        <div class="dash-summary-value">${fundCount}只</div>
    </div>`;
}

/**
 * 显示加载状态。
 */
function showLoading(container) {
    const summaryEl = container.querySelector('#dashSummaryCards');
    const holdingsEl = container.querySelector('#dashHoldingsDetail');
    const timelineEl = container.querySelector('#dashTimeline');
    if (summaryEl) summaryEl.innerHTML = '<div class="dash-loading"><span class="spinner"></span>加载中...</div>';
    if (holdingsEl) holdingsEl.innerHTML = '<div class="dash-loading"><span class="spinner"></span>加载持仓明细...</div>';
    if (timelineEl) timelineEl.innerHTML = '<div class="dash-loading"><span class="spinner"></span>加载事件时间线...</div>';
}

/**
 * 显示错误状态与重试按钮。
 */
function showError(container, error) {
    const holdingsEl = container.querySelector('#dashHoldingsDetail');
    const summaryEl = container.querySelector('#dashSummaryCards');
    const errorMsg = error?.message || '加载失败';

    if (summaryEl) summaryEl.innerHTML = '';
    if (holdingsEl) {
        holdingsEl.innerHTML = `<div class="dash-error">
            <div class="dash-error-msg">${errorMsg}</div>
            <button class="dash-retry-btn" id="dashRetryBtn">重试</button>
        </div>`;
    }

    const retryBtn = container.querySelector('#dashRetryBtn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => loadAllData(container));
    }
}

/**
 * 并发加载全部仪表盘数据，成功后触发各子区域渲染。
 */
async function loadAllData(container) {
    if (isLoading) return;
    setIsLoading(true);
    setLoadError(null);
    showLoading(container);

    try {
        const currentHoldings = getHoldings();

        // 核心数据
        const [overview, holdingsDetail] = await Promise.all([
            fetchDashboardOverview(currentHoldings),
            fetchHoldingsDetail(currentHoldings),
        ]);

        setDashboardData('overview', overview);
        setDashboardData('holdingsDetail', holdingsDetail);
        setLastUpdateTime();

        // 渲染核心子区域
        const marketBarEl = container.querySelector('#dashMarketBar');
        const summaryEl = container.querySelector('#dashSummaryCards');
        const holdingsEl = container.querySelector('#dashHoldingsDetail');

        if (marketBarEl) renderMarketBar(marketBarEl, overview, () => {
            resetDashboardState();
            loadAllData(container);
        });
        renderSummaryCards(summaryEl, overview);
        if (holdingsEl) renderHoldingsDetail(holdingsEl, holdingsDetail);

        // 时间线（独立调用，失败不影响整体）
        const [timelineResult] = await Promise.allSettled([
            fetchTimeline(currentHoldings),
        ]);

        const timelineContainer = container.querySelector('#dashTimeline');
        if (timelineContainer) {
            if (timelineResult.status === 'fulfilled' && timelineResult.value) {
                renderTimeline(timelineContainer, timelineResult.value);
            } else {
                timelineContainer.innerHTML = '<div class="dash-error"><div class="dash-error-msg">事件时间线暂时不可用</div></div>';
            }
        }

    } catch (e) {
        setLoadError(e);
        showError(container, e);
        showToast(e.message || '仪表盘加载失败');
    } finally {
        setIsLoading(false);
    }
}

/**
 * 仪表盘页面入口 — 由 app.js 通过懒加载调用。
 */
export function renderDashboard(container) {
    if (!container) return;

    resetDashboardState();

    container.innerHTML = buildSkeleton();
    loadAllData(container);
}

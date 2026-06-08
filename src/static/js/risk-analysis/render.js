/** 风险分析主渲染模块 — 构建页面骨架，协调子模块渲染和数据加载。 */

import { holdings as holdingsRef } from '../state.js';
import {
    fetchAllocation, fetchReturnTrend, fetchForecast, fetchSignalScorecard,
    fetchRebalancing, fetchBenchmark, fetchStressTest, fetchRollingMetrics, fetchTailRisk
} from './api.js';
import {
    analysisData, setAnalysisData, setLastUpdateTime,
    isLoading, setIsLoading, loadError, setLoadError, resetAnalysisState
} from './state.js';
import { destroyAllCharts } from './charts.js';
import { renderAllocation, renderAllocationAdvanced, destroyAllocationCharts } from './allocation.js';
import { renderReturnTrend, destroyReturnTrendCharts } from './return-trend.js';
import { renderForecast, destroyForecastCharts } from './forecast.js';
import { renderSignalScorecard, destroySignalScorecardCharts } from './signal-card.js';
import { renderRebalancing } from './rebalancing.js';
import { renderBenchmark, destroyBenchmarkCharts } from './benchmark.js';
import { renderStressTest, destroyStressTestCharts } from './stress-test.js';
import { renderRollingMetrics, destroyRollingCharts } from './rolling.js';
import { renderTailRisk, destroyTailRiskCharts } from './tail-risk.js';
import { showToast } from '../utils.js';

function getHoldings() {
    return holdingsRef || [];
}

/** 子标签定义 */
const SUB_TABS = [
    { key: 'overview', label: '综合概览', icon: '◐' },
    { key: 'prediction', label: '收益预测', icon: '◔' },
    { key: 'deep-analysis', label: '风险深度分析', icon: '◑' },
    { key: 'stress-rebalance', label: '压力测试与操作', icon: '◒' },
];

/**
 * 构建页面骨架。
 */
function buildSkeleton() {
    const tabsHtml = SUB_TABS.map((t, i) =>
        `<button class="ra-sub-tab${i === 0 ? ' active' : ''}" data-panel="${t.key}">${t.icon} ${t.label}</button>`
    ).join('');

    return `
    <div class="risk-analysis-page">
        <div class="ra-sub-tabs">${tabsHtml}</div>

        <!-- Panel 1: 综合概览 -->
        <div class="ra-panel active" data-panel="overview" id="raPanelOverview">
            <div class="ra-grid-2col-wide">
                <div class="ra-card"><div class="ra-card-header"><h3>资产配置</h3><span class="ra-card-subtitle">类型 · 风险 · 健康指标</span></div>
                    <div id="raAllocation" class="ra-card-body ra-card-body-compact"></div></div>
                <div class="ra-card"><div class="ra-card-header"><h3>信号健康评分卡</h3><span class="ra-card-subtitle">五因子量化信号</span></div>
                    <div id="raSignalScorecard" class="ra-card-body ra-card-body-compact"></div></div>
            </div>
            <div class="ra-card ra-full" style="margin-top:12px">
                <div class="ra-card-header"><h3>高级组合分析</h3><span class="ra-card-subtitle">MPT 风险收益指标 · 国际标准</span></div>
                <div id="raAllocAdvanced" class="ra-card-body"></div>
            </div>
        </div>

        <!-- Panel 2: 收益预测 -->
        <div class="ra-panel" data-panel="prediction" id="raPanelPrediction">
            <div class="ra-grid-2col">
                <div class="ra-card">
                    <div class="ra-card-header"><h3>收益趋势预测</h3><span class="ra-card-subtitle">三模型集成 · 30/90/180天</span></div>
                    <div id="raReturnTrend" class="ra-card-body ra-chart-container"></div>
                </div>
                <div class="ra-card">
                    <div class="ra-card-header"><h3>6个月蒙特卡洛预测</h3><span class="ra-card-subtitle">1000条路径模拟</span></div>
                    <div id="raForecast" class="ra-card-body ra-chart-container"></div>
                </div>
            </div>
        </div>

        <!-- Panel 3: 风险深度分析 -->
        <div class="ra-panel" data-panel="deep-analysis" id="raPanelDeepAnalysis">
            <div class="ra-card" style="margin-bottom:12px">
                <div class="ra-card-header"><h3>基准对比分析</h3><span class="ra-card-subtitle">vs 沪深300 · Alpha/Beta/捕获率</span></div>
                <div id="raBenchmark" class="ra-card-body"></div>
            </div>
            <div class="ra-grid-2col">
                <div class="ra-card">
                    <div class="ra-card-header"><h3>滚动风险指标</h3><span class="ra-card-subtitle">30/60/90日窗口</span></div>
                    <div id="raRolling" class="ra-card-body ra-chart-container"></div>
                </div>
                <div class="ra-card">
                    <div class="ra-card-header"><h3>尾部风险分析</h3><span class="ra-card-subtitle">VaR/CVaR · 回撤区间</span></div>
                    <div id="raTailRisk" class="ra-card-body"></div>
                </div>
            </div>
        </div>

        <!-- Panel 4: 压力测试与操作 -->
        <div class="ra-panel" data-panel="stress-rebalance" id="raPanelStressRebalance">
            <div class="ra-card" style="margin-bottom:12px">
                <div class="ra-card-header"><h3>历史压力测试</h3><span class="ra-card-subtitle">5大A股危机情景 · 韧性评估</span></div>
                <div id="raStressTest" class="ra-card-body"></div>
            </div>
            <div class="ra-card">
                <div class="ra-card-header"><h3>再平衡建议</h3><span class="ra-card-subtitle">现金利用率 · 集中度 · 操作建议</span></div>
                <div id="raRebalancing" class="ra-card-body"></div>
            </div>
        </div>
    </div>`;
}

/** 显示loading状态 */
function showLoading(container) {
    const ids = ['raAllocation', 'raSignalScorecard', 'raAllocAdvanced', 'raReturnTrend',
                 'raForecast', 'raBenchmark', 'raRolling', 'raTailRisk', 'raStressTest', 'raRebalancing'];
    ids.forEach(id => {
        const el = container.querySelector(`#${id}`);
        if (el) el.innerHTML = '<div class="ra-loading"><span class="spinner"></span>加载中...</div>';
    });
}

/** 显示错误 */
function showError(container, error) {
    const overviewEl = container.querySelector('#raAllocation');
    const msg = error?.message || '加载失败';
    if (overviewEl) {
        overviewEl.innerHTML = `<div class="ra-error">
            <div class="ra-error-msg">${msg}</div>
            <button class="ra-retry-btn" id="raRetryBtn">重试</button>
        </div>`;
    }
    const retryBtn = container.querySelector('#raRetryBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => loadAllData(container));
}

/** 绑定子标签切换 */
function bindSubTabs(container) {
    const tabs = container.querySelectorAll('.ra-sub-tab');
    const panels = container.querySelectorAll('.ra-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const panelKey = tab.dataset.panel;

            // 切换tab样式
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // 切换panel可见性
            panels.forEach(p => {
                p.classList.toggle('active', p.dataset.panel === panelKey);
            });

            // 触发lazy load（首次切换到某个panel时加载数据）
            loadPanelDataIfNeeded(container, panelKey);
        });
    });
}

/** 按panel延迟加载数据 */
const loadedPanels = new Set(['overview']); // overview默认加载

async function loadPanelDataIfNeeded(container, panelKey) {
    if (loadedPanels.has(panelKey)) return;

    const currentHoldings = getHoldings();

    if (panelKey === 'prediction') {
        loadedPanels.add('prediction');
        const [rtResult, fcResult] = await Promise.allSettled([
            fetchReturnTrend(currentHoldings),
            fetchForecast(currentHoldings),
        ]);

        const rtEl = container.querySelector('#raReturnTrend');
        if (rtEl) {
            if (rtResult.status === 'fulfilled' && rtResult.value) {
                renderReturnTrend(rtEl, rtResult.value);
            } else {
                rtEl.innerHTML = '<div class="ra-error"><div class="ra-error-msg">收益趋势预测暂时不可用</div></div>';
            }
        }

        const fcEl = container.querySelector('#raForecast');
        if (fcEl) {
            if (fcResult.status === 'fulfilled' && fcResult.value) {
                renderForecast(fcEl, fcResult.value);
            } else {
                fcEl.innerHTML = '<div class="ra-error"><div class="ra-error-msg">蒙特卡洛预测暂时不可用</div></div>';
            }
        }
    }

    if (panelKey === 'deep-analysis') {
        loadedPanels.add('deep-analysis');
        const [bmResult, rmResult, trResult] = await Promise.allSettled([
            fetchBenchmark(currentHoldings),
            fetchRollingMetrics(currentHoldings),
            fetchTailRisk(currentHoldings),
        ]);

        const bmEl = container.querySelector('#raBenchmark');
        if (bmEl) {
            if (bmResult.status === 'fulfilled' && bmResult.value) {
                setAnalysisData('benchmark', bmResult.value);
                renderBenchmark(bmEl, bmResult.value);
            } else {
                bmEl.innerHTML = '<div class="ra-error"><div class="ra-error-msg">基准对比分析暂时不可用</div></div>';
            }
        }

        const rmEl = container.querySelector('#raRolling');
        if (rmEl) {
            if (rmResult.status === 'fulfilled' && rmResult.value) {
                setAnalysisData('rollingMetrics', rmResult.value);
                renderRollingMetrics(rmEl, rmResult.value);
            } else {
                rmEl.innerHTML = '<div class="ra-error"><div class="ra-error-msg">滚动风险指标暂时不可用</div></div>';
            }
        }

        const trEl = container.querySelector('#raTailRisk');
        if (trEl) {
            if (trResult.status === 'fulfilled' && trResult.value) {
                setAnalysisData('tailRisk', trResult.value);
                renderTailRisk(trEl, trResult.value);
            } else {
                trEl.innerHTML = '<div class="ra-error"><div class="ra-error-msg">尾部风险分析暂时不可用</div></div>';
            }
        }
    }

    if (panelKey === 'stress-rebalance') {
        loadedPanels.add('stress-rebalance');
        const [stResult, rbResult] = await Promise.allSettled([
            fetchStressTest(currentHoldings),
            fetchRebalancing(currentHoldings),
        ]);

        const stEl = container.querySelector('#raStressTest');
        if (stEl) {
            if (stResult.status === 'fulfilled' && stResult.value) {
                setAnalysisData('stressTest', stResult.value);
                renderStressTest(stEl, stResult.value);
            } else {
                stEl.innerHTML = '<div class="ra-error"><div class="ra-error-msg">压力测试暂时不可用</div></div>';
            }
        }

        const rbEl = container.querySelector('#raRebalancing');
        if (rbEl) {
            if (rbResult.status === 'fulfilled' && rbResult.value) {
                setAnalysisData('rebalancing', rbResult.value);
                renderRebalancing(rbEl, rbResult.value);
            } else {
                rbEl.innerHTML = '<div class="ra-error"><div class="ra-error-msg">再平衡建议暂时不可用</div></div>';
            }
        }
    }
}

/** 并发加载概览数据（Panel 1: allocation + signalScorecard） */
async function loadAllData(container) {
    if (isLoading) return;
    setIsLoading(true);
    setLoadError(null);
    showLoading(container);

    try {
        const currentHoldings = getHoldings();

        // Panel 1 核心数据
        const [allocationResult, scorecardResult] = await Promise.allSettled([
            fetchAllocation(currentHoldings),
            fetchSignalScorecard(currentHoldings),
        ]);

        // 渲染资产配置
        const allocEl = container.querySelector('#raAllocation');
        if (allocEl) {
            if (allocationResult.status === 'fulfilled' && allocationResult.value) {
                setAnalysisData('allocation', allocationResult.value);
                renderAllocation(allocEl, allocationResult.value);
            } else {
                allocEl.innerHTML = '<div class="ra-error"><div class="ra-error-msg">资产配置数据暂时不可用</div></div>';
            }
        }

        // 渲染高级组合分析
        const advancedEl = container.querySelector('#raAllocAdvanced');
        if (advancedEl && allocationResult.status === 'fulfilled' && allocationResult.value) {
            renderAllocationAdvanced(advancedEl, allocationResult.value);
        }

        // 渲染信号评分卡
        const scEl = container.querySelector('#raSignalScorecard');
        if (scEl) {
            if (scorecardResult.status === 'fulfilled' && scorecardResult.value) {
                setAnalysisData('signalScorecard', scorecardResult.value);
                renderSignalScorecard(scEl, scorecardResult.value);
            } else {
                scEl.innerHTML = '<div class="ra-error"><div class="ra-error-msg">信号评分卡暂时不可用</div></div>';
            }
        }

        setLastUpdateTime();

    } catch (e) {
        setLoadError(e);
        showError(container, e);
        showToast(e.message || '风险分析加载失败');
    } finally {
        setIsLoading(false);
    }
}

/** 销毁所有子模块图表 */
function destroyAllModuleCharts() {
    destroyAllCharts();
    destroyAllocationCharts();
    destroyReturnTrendCharts();
    destroyForecastCharts();
    destroySignalScorecardCharts();
    destroyBenchmarkCharts();
    destroyStressTestCharts();
    destroyRollingCharts();
    destroyTailRiskCharts();
}

/**
 * 风险分析页面入口 — 由 app.js 通过懒加载调用。
 */
export function renderRiskAnalysis(container) {
    if (!container) return;

    // 重置状态
    resetAnalysisState();
    destroyAllModuleCharts();
    loadedPanels.clear();
    loadedPanels.add('overview');

    // 构建骨架
    container.innerHTML = buildSkeleton();

    // 绑定子标签
    bindSubTabs(container);

    // 加载概览数据
    loadAllData(container);
}

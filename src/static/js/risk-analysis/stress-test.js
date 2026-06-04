/**
 * 历史压力测试组件 — 5大A股危机情景卡片 + 韧性评分仪表 + 对比柱状图。
 *
 * @exports renderStressTest(container, data)
 * @exports destroyStressTestCharts()
 */

import { setChartInstance, chartInstances } from './state.js';

/**
 * 渲染压力测试结果。
 */
export function renderStressTest(container, data) {
    if (!container) return;

    if (!data || !data.scenarios || data.scenarios.length === 0) {
        container.innerHTML = '<div class="ra-empty">暂无压力测试数据</div>';
        return;
    }

    const { scenarios, worst_scenario, portfolio_resilience_score, portfolio_beta, vulnerability_summary } = data;

    let html = '';

    // 顶部：韧性评分 + Beta + 脆弱性总结
    html += '<div class="ra-grid-2col" style="margin-bottom:14px">';

    // 韧性评分仪表
    html += `<div class="ra-metric-card">
        <div class="ra-resilience-gauge">
            <div class="ra-gauge-ring" style="--pct: ${portfolio_resilience_score}">
                <div class="ra-gauge-inner">
                    <div class="ra-gauge-value">${portfolio_resilience_score}</div>
                    <div class="ra-gauge-label">韧性评分</div>
                </div>
            </div>
            <div style="font-size:12px;font-weight:600;color:var(--text2)">${getResilienceDesc(portfolio_resilience_score)}</div>
        </div>
    </div>`;

    // Beta + 脆弱性总结 + 最差情景
    html += `<div style="display:flex;flex-direction:column;gap:10px">
        <div class="ra-metric-card">
            <div class="ra-metric-label">组合 Beta</div>
            <div class="ra-metric-value">${portfolio_beta}</div>
            <div class="ra-metric-desc">市场敏感度</div>
        </div>
        ${worst_scenario ? `<div class="ra-metric-card">
            <div class="ra-metric-label">最差情景</div>
            <div class="ra-metric-value down">${worst_scenario.portfolio_drawdown}%</div>
            <div class="ra-metric-desc">${worst_scenario.name} · 恢复约${worst_scenario.recovery_days}天</div>
        </div>` : ''}
        <div style="font-size:12px;color:var(--text2);line-height:1.5;padding:8px 10px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
            ${vulnerability_summary}
        </div>
    </div>`;

    html += '</div>';

    // 情景卡片网格
    html += '<div class="ra-grid-3col" style="margin-bottom:14px">';
    scenarios.forEach(s => {
        html += `<div class="ra-scenario-card">
            <div class="ra-scenario-name">${s.name} <span class="ra-severity ${s.severity}">${getSeverityLabel(s.severity)}</span></div>
            <div class="ra-scenario-period">${s.period}</div>
            <div class="ra-scenario-desc">${s.description}</div>
            <div class="ra-scenario-metrics">
                <div class="ra-scenario-metric">
                    <span class="ra-scenario-metric-label">基准回撤</span>
                    <span class="ra-scenario-metric-value down">${s.benchmark_drawdown}%</span>
                </div>
                <div class="ra-scenario-metric">
                    <span class="ra-scenario-metric-label">组合回撤</span>
                    <span class="ra-scenario-metric-value down">${s.portfolio_drawdown}%</span>
                </div>
                <div class="ra-scenario-metric">
                    <span class="ra-scenario-metric-label">恢复天数</span>
                    <span class="ra-scenario-metric-value">${s.recovery_days}天</span>
                </div>
            </div>
        </div>`;
    });
    html += '</div>';

    // 对比柱状图
    html += '<div class="ra-chart-container" style="height:280px">';
    html += '<canvas id="raStressChart"></canvas>';
    html += '</div>';

    container.innerHTML = html;

    // 创建柱状图
    createStressChart(container, scenarios);
}

function getResilienceDesc(score) {
    if (score >= 80) return '抗压能力优秀';
    if (score >= 60) return '抗压能力良好';
    if (score >= 40) return '抗压能力一般';
    return '抗压能力较弱';
}

function getSeverityLabel(severity) {
    const labels = { extreme: '极端', severe: '严重', moderate: '中等' };
    return labels[severity] || severity;
}

function createStressChart(container, scenarios) {
    const canvas = container.querySelector('#raStressChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: scenarios.map(s => s.name),
            datasets: [
                {
                    label: '基准回撤',
                    data: scenarios.map(s => s.benchmark_drawdown),
                    backgroundColor: 'rgba(245,158,11,0.6)',
                    borderColor: '#f59e0b',
                    borderWidth: 1,
                    borderRadius: 4,
                },
                {
                    label: '组合回撤',
                    data: scenarios.map(s => s.portfolio_drawdown),
                    backgroundColor: 'rgba(239,68,68,0.6)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top', labels: { boxWidth: 14, font: { size: 10 } } },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.82)',
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 11 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx2) => `${ctx2.dataset.label}: ${ctx2.parsed.y}%`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 }, color: '#8fb6d8' },
                },
                y: {
                    grid: { color: 'rgba(125,211,252,.12)' },
                    ticks: {
                        font: { size: 10 }, color: '#8fb6d8',
                        callback: v => v + '%',
                    },
                    title: { display: true, text: '回撤幅度 (%)', font: { size: 11 }, color: '#8fb6d8' },
                },
            },
        },
    });

    setChartInstance('stressChart', chart);
}

export function destroyStressTestCharts() {
    if (chartInstances['stressChart']) {
        try { chartInstances['stressChart'].destroy(); } catch (_) {}
        delete chartInstances['stressChart'];
    }
}

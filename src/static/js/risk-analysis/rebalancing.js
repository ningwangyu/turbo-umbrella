/**
 * 再平衡建议模块 — 展示现金利用率、集中度指标和操作建议卡片
 *
 * 功能：
 * 1. 现金利用率进度条
 * 2. 集中度指标卡片（HHI、有效基金数、前3大权重）
 * 3. 风险等级分布条形图
 * 4. 再平衡建议卡片列表（按优先级排序）
 * 5. 再平衡健康评分
 */

/**
 * 渲染再平衡建议模块
 * @param {HTMLElement} container - 目标容器
 * @param {Object} data - 再平衡数据（来自 fetchRebalancing）
 */
export function renderRebalancing(container, data) {
    if (!container || !data) return;

    const {
        cash_utilization,
        concentration,
        risk_distribution,
        suggestions,
        overall_score,
        updated_at
    } = data;

    // 计算健康评分的颜色和状态
    const scoreColor = overall_score >= 80 ? '#22c55e' : overall_score >= 60 ? '#f5a255' : '#ef4444';
    const scoreLabel = overall_score >= 80 ? '优秀' : overall_score >= 60 ? '良好' : '需优化';

    container.innerHTML = `
        <div class="rebalancing-page">
            <!-- 头部信息 -->
            <div class="rebalancing-header">
                <div class="rebalancing-title">
                    <span class="rebalancing-icon">⚖️</span>
                    <h2>再平衡建议</h2>
                </div>
                <div class="rebalancing-meta">
                    <span class="rebalancing-updated">更新于 ${updated_at}</span>
                    <div class="rebalancing-score-badge" style="background: ${scoreColor}">
                        <span class="score-value">${overall_score}</span>
                        <span class="score-label">${scoreLabel}</span>
                    </div>
                </div>
            </div>

            <!-- 现金利用率和集中度指标 -->
            <div class="rebalancing-metrics-grid">
                <!-- 现金利用率 -->
                <div class="rebalancing-metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">💰</span>
                        <span class="metric-title">现金利用率</span>
                    </div>
                    <div class="metric-content">
                        <div class="cash-utilization-bar">
                            <div class="cash-bar-track">
                                <div class="cash-bar-fill" style="width: ${cash_utilization.effective_weight}%; background: ${cash_utilization.effective_weight > 80 ? '#22c55e' : cash_utilization.effective_weight > 60 ? '#f5a255' : '#ef4444'}"></div>
                            </div>
                            <div class="cash-bar-labels">
                                <span class="cash-label-effective">有效配置 <strong>${cash_utilization.effective_weight.toFixed(1)}%</strong></span>
                                <span class="cash-label-cash">现金 <strong>${cash_utilization.cash_weight.toFixed(1)}%</strong></span>
                            </div>
                        </div>
                        ${cash_utilization.is_cash_heavy ?
                            '<div class="cash-warning">⚠️ 现金占比过高，可能错失市场机会</div>' :
                            '<div class="cash-ok">✅ 现金利用率良好</div>'
                        }
                    </div>
                </div>

                <!-- 集中度指标 -->
                <div class="rebalancing-metric-card">
                    <div class="metric-header">
                        <span class="metric-icon">📊</span>
                        <span class="metric-title">集中度指标</span>
                    </div>
                    <div class="metric-content">
                        <div class="concentration-grid">
                            <div class="conc-item">
                                <div class="conc-label">HHI 指数</div>
                                <div class="conc-value">${concentration.hhi.toFixed(3)}</div>
                                <div class="conc-desc">${concentration.hhi < 0.15 ? '分散良好' : concentration.hhi < 0.25 ? '中等集中' : '高度集中'}</div>
                            </div>
                            <div class="conc-item">
                                <div class="conc-label">有效基金数</div>
                                <div class="conc-value">${concentration.effective_n.toFixed(1)}</div>
                                <div class="conc-desc">等效分散数量</div>
                            </div>
                            <div class="conc-item">
                                <div class="conc-label">前3大权重</div>
                                <div class="conc-value">${concentration.top3_weight.toFixed(1)}%</div>
                                <div class="conc-desc">${concentration.top3_weight > 60 ? '权重集中' : '权重分散'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 风险等级分布 -->
            <div class="rebalancing-risk-section">
                <h3 class="risk-section-title">风险等级分布</h3>
                <div class="risk-distribution-bars">
                    ${Object.entries(risk_distribution).map(([level, weight]) => `
                        <div class="risk-bar-item">
                            <div class="risk-bar-label">${level}</div>
                            <div class="risk-bar-track">
                                <div class="risk-bar-fill" style="width: ${weight}%; background: ${getRiskColor(level)}"></div>
                            </div>
                            <div class="risk-bar-value">${weight.toFixed(1)}%</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 再平衡建议卡片列表 -->
            ${suggestions.length > 0 ? `
                <div class="rebalancing-suggestions-section">
                    <h3 class="suggestions-section-title">操作建议</h3>
                    <div class="suggestions-grid">
                        ${suggestions.map(suggestion => renderSuggestionCard(suggestion)).join('')}
                    </div>
                </div>
            ` : `
                <div class="rebalancing-all-good">
                    <div class="all-good-icon">✨</div>
                    <div class="all-good-text">当前组合配置良好，无需调整</div>
                    <div class="all-good-desc">您的投资组合分散度和风险水平都处于理想状态</div>
                </div>
            `}
        </div>
    `;
}

/**
 * 渲染单个建议卡片
 * @param {Object} suggestion - 建议对象
 * @returns {string} HTML 字符串
 */
function renderSuggestionCard(suggestion) {
    const { type, title, reason, funds, action, priority } = suggestion;

    // 获取优先级对应的样式
    const priorityClass = priority === 'high' ? 'priority-high' : priority === 'medium' ? 'priority-medium' : 'priority-low';
    const priorityLabel = priority === 'high' ? '高优先级' : priority === 'medium' ? '中优先级' : '低优先级';
    const priorityIcon = priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '🟢';

    // 获取类型对应的图标
    const typeIcons = {
        'concentration': '📊',
        'cash': '💰',
        'risk': '⚠️',
        'rebalance': '⚖️'
    };
    const typeIcon = typeIcons[type] || '💡';

    return `
        <div class="suggestion-card ${priorityClass}">
            <div class="suggestion-header">
                <span class="suggestion-type-icon">${typeIcon}</span>
                <div class="suggestion-title-section">
                    <h4 class="suggestion-title">${title}</h4>
                    <span class="suggestion-priority ${priorityClass}">${priorityIcon} ${priorityLabel}</span>
                </div>
            </div>
            <div class="suggestion-body">
                <div class="suggestion-reason">
                    <span class="reason-label">原因：</span>
                    <span class="reason-text">${reason}</span>
                </div>
                ${funds.length > 0 ? `
                    <div class="suggestion-funds">
                        <span class="funds-label">涉及基金：</span>
                        <div class="funds-list">
                            ${funds.map(f => `
                                <span class="fund-tag" title="${f.name} (${f.weight}%)">
                                    ${f.name.substring(0, 8)}${f.name.length > 8 ? '...' : ''} <span class="fund-weight">${f.weight.toFixed(1)}%</span>
                                </span>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                <div class="suggestion-action">
                    <span class="action-icon">💡</span>
                    <span class="action-text">${action}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * 获取风险等级对应的颜色
 * @param {string} level - 风险等级
 * @returns {string} 颜色代码
 */
function getRiskColor(level) {
    const colors = {
        '低风险': 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
        '中风险': 'linear-gradient(90deg, #f5a255 0%, #e8933f 100%)',
        '中高风险': 'linear-gradient(90deg, #f97316 0%, #ea580c 100%)',
        '高风险': 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)'
    };
    return colors[level] || colors['中风险'];
}

// CSS 样式（导出供注入）
export const REBALANCING_CSS = `
/* ===== 再平衡建议模块样式 ===== */
.rebalancing-page {
    padding: 16px;
    max-width: 100%;
}

.rebalancing-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
}

.rebalancing-title {
    display: flex;
    align-items: center;
    gap: 12px;
}

.rebalancing-icon {
    font-size: 28px;
}

.rebalancing-title h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
}

.rebalancing-meta {
    display: flex;
    align-items: center;
    gap: 16px;
}

.rebalancing-updated {
    font-size: 12px;
    color: var(--text3);
}

.rebalancing-score-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 16px;
    border-radius: 12px;
    color: #fff;
    min-width: 60px;
}

.score-value {
    font-size: 24px;
    font-weight: 800;
    line-height: 1;
}

.score-label {
    font-size: 10px;
    font-weight: 600;
    margin-top: 4px;
    opacity: 0.9;
}

/* 指标网格 */
.rebalancing-metrics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
}

.rebalancing-metric-card {
    background: var(--card);
    border-radius: 12px;
    padding: 16px;
    box-shadow: var(--shadow);
}

.metric-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
}

.metric-icon {
    font-size: 20px;
}

.metric-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
}

/* 现金利用率条 */
.cash-utilization-bar {
    margin-bottom: 12px;
}

.cash-bar-track {
    height: 12px;
    background: var(--bg);
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 8px;
}

.cash-bar-fill {
    height: 100%;
    border-radius: 6px;
    transition: width 0.8s ease;
}

.cash-bar-labels {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text3);
}

.cash-label-effective strong,
.cash-label-cash strong {
    color: var(--text);
    font-weight: 700;
}

.cash-warning {
    font-size: 12px;
    color: #f97316;
    background: rgba(249, 115, 22, 0.08);
    padding: 8px 12px;
    border-radius: 8px;
    margin-top: 12px;
}

.cash-ok {
    font-size: 12px;
    color: #22c55e;
    background: rgba(34, 197, 94, 0.08);
    padding: 8px 12px;
    border-radius: 8px;
    margin-top: 12px;
}

/* 集中度指标网格 */
.concentration-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
}

.conc-item {
    text-align: center;
    padding: 12px 8px;
    background: var(--bg);
    border-radius: 10px;
}

.conc-label {
    font-size: 10px;
    color: var(--text3);
    margin-bottom: 6px;
    font-weight: 500;
}

.conc-value {
    font-size: 18px;
    font-weight: 800;
    color: var(--text);
    font-variant-numeric: tabular-nums;
}

.conc-desc {
    font-size: 10px;
    color: var(--text3);
    margin-top: 4px;
}

/* 风险等级分布 */
.rebalancing-risk-section {
    background: var(--card);
    border-radius: 12px;
    padding: 16px;
    box-shadow: var(--shadow);
    margin-bottom: 24px;
}

.risk-section-title {
    margin: 0 0 16px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
}

.risk-distribution-bars {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.risk-bar-item {
    display: flex;
    align-items: center;
    gap: 12px;
}

.risk-bar-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    min-width: 60px;
    flex-shrink: 0;
}

.risk-bar-track {
    flex: 1;
    height: 10px;
    background: var(--bg);
    border-radius: 5px;
    overflow: hidden;
}

.risk-bar-fill {
    height: 100%;
    border-radius: 5px;
    transition: width 0.8s ease;
}

.risk-bar-value {
    font-size: 12px;
    font-weight: 700;
    color: var(--text2);
    min-width: 50px;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

/* 建议卡片列表 */
.rebalancing-suggestions-section {
    margin-bottom: 16px;
}

.suggestions-section-title {
    margin: 0 0 16px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
}

.suggestions-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.suggestion-card {
    background: var(--card);
    border-radius: 12px;
    padding: 16px;
    box-shadow: var(--shadow);
    border-left: 4px solid transparent;
    transition: transform 0.15s, box-shadow 0.15s;
}

.suggestion-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.suggestion-card.priority-high {
    border-left-color: #ef4444;
}

.suggestion-card.priority-medium {
    border-left-color: #f5a255;
}

.suggestion-card.priority-low {
    border-left-color: #22c55e;
}

.suggestion-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
}

.suggestion-type-icon {
    font-size: 24px;
    flex-shrink: 0;
}

.suggestion-title-section {
    flex: 1;
}

.suggestion-title {
    margin: 0 0 4px 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
}

.suggestion-priority {
    font-size: 11px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.suggestion-priority.priority-high {
    color: #ef4444;
}

.suggestion-priority.priority-medium {
    color: #f5a255;
}

.suggestion-priority.priority-low {
    color: #22c55e;
}

.suggestion-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.suggestion-reason {
    font-size: 13px;
    line-height: 1.5;
}

.reason-label {
    color: var(--text3);
    font-weight: 500;
}

.reason-text {
    color: var(--text2);
}

.suggestion-funds {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.funds-label {
    font-size: 12px;
    color: var(--text3);
    font-weight: 500;
}

.funds-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.fund-tag {
    font-size: 11px;
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 4px 10px;
    border-radius: 6px;
    color: var(--text2);
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.fund-weight {
    font-weight: 700;
    color: var(--text);
}

.suggestion-action {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: rgba(26, 115, 232, 0.05);
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 12px;
}

.action-icon {
    font-size: 16px;
    flex-shrink: 0;
    margin-top: 2px;
}

.action-text {
    color: var(--text);
    line-height: 1.5;
}

/* 无建议状态 */
.rebalancing-all-good {
    text-align: center;
    padding: 48px 24px;
    background: var(--card);
    border-radius: 12px;
    box-shadow: var(--shadow);
}

.all-good-icon {
    font-size: 48px;
    margin-bottom: 16px;
}

.all-good-text {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 8px;
}

.all-good-desc {
    font-size: 13px;
    color: var(--text3);
}

/* 响应式设计 */
@media (max-width: 768px) {
    .rebalancing-metrics-grid {
        grid-template-columns: 1fr;
    }

    .rebalancing-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
    }

    .rebalancing-meta {
        width: 100%;
        justify-content: space-between;
    }

    .concentration-grid {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 480px) {
    .rebalancing-page {
        padding: 12px;
    }

    .risk-bar-label {
        min-width: 50px;
        font-size: 11px;
    }
}
`;

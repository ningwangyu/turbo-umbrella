/**
 * 智能事件时间线模块 — 展示持仓相关的重要市场事件
 *
 * 功能：
 * 1. 垂直时间线布局
 * 2. 事件类型颜色编码（大涨/大跌、信号变化、情绪、漂移、里程碑）
 * 3. 事件详情展开/折叠
 * 4. 事件统计摘要
 * 5. 可视化图标和动画
 */

/**
 * 渲染智能事件时间线模块
 * @param {HTMLElement} container - 目标容器
 * @param {Object} data - 时间线数据（来自 fetchTimeline）
 */
export function renderTimeline(container, data) {
    if (!container || !data) return;

    const { events, event_count, summary, updated_at } = data;

    // 获取事件类型统计
    const typeStats = [
        { type: 'price_events', label: '价格事件', icon: '📈', count: summary.price_events, color: '#3b82f6' },
        { type: 'signal_events', label: '信号变化', icon: '🔄', count: summary.signal_events, color: '#f5a255' },
        { type: 'sentiment_events', label: '情绪事件', icon: '😱', count: summary.sentiment_events, color: '#8b5cf6' },
        { type: 'drift_events', label: '权重漂移', icon: '⚖️', count: summary.drift_events, color: '#06b6d4' },
        { type: 'milestone_events', label: '收益里程碑', icon: '🎯', count: summary.milestone_events, color: '#22c55e' }
    ].filter(stat => stat.count > 0);

    container.innerHTML = `
        <div class="timeline-page">
            <!-- 头部信息 -->
            <div class="timeline-header">
                <div class="timeline-title">
                    <span class="timeline-icon">📅</span>
                    <h2>智能事件时间线</h2>
                </div>
                <div class="timeline-meta">
                    <span class="timeline-updated">更新于 ${updated_at}</span>
                    <div class="timeline-event-count">
                        <span class="count-value">${event_count}</span>
                        <span class="count-label">个事件</span>
                    </div>
                </div>
            </div>

            <!-- 事件统计摘要 -->
            ${typeStats.length > 0 ? `
                <div class="timeline-stats-bar">
                    ${typeStats.map(stat => `
                        <div class="stat-chip" style="border-left: 3px solid ${stat.color}">
                            <span class="stat-icon">${stat.icon}</span>
                            <span class="stat-count">${stat.count}</span>
                            <span class="stat-label">${stat.label}</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            <!-- 事件时间线 -->
            ${events.length > 0 ? `
                <div class="timeline-container">
                    <div class="timeline-line"></div>
                    ${events.map((event, index) => renderTimelineEvent(event, index)).join('')}
                </div>
            ` : `
                <div class="timeline-empty">
                    <div class="empty-icon">📭</div>
                    <div class="empty-text">暂无重要事件</div>
                    <div class="empty-desc">最近没有检测到显著的市场变化或持仓事件</div>
                </div>
            `}
        </div>
    `;

    // 绑定事件展开/折叠
    container.querySelectorAll('.event-card-expandable').forEach(card => {
        card.addEventListener('click', () => {
            const details = card.querySelector('.event-details');
            const expandIcon = card.querySelector('.expand-icon');
            if (details) {
                const isExpanded = details.style.maxHeight && details.style.maxHeight !== '0px';
                details.style.maxHeight = isExpanded ? '0px' : details.scrollHeight + 'px';
                details.style.opacity = isExpanded ? '0' : '1';
                if (expandIcon) {
                    expandIcon.textContent = isExpanded ? '▼' : '▲';
                }
            }
        });
    });
}

/**
 * 渲染单个时间线事件
 * @param {Object} event - 事件对象
 * @param {number} index - 索引（用于动画延迟）
 * @returns {string} HTML 字符串
 */
function renderTimelineEvent(event, index) {
    const { type, date, title, description, funds, severity, icon } = event;

    // 获取事件类型对应的样式类
    const typeClass = getEventTypeClass(type);
    const severityClass = `severity-${severity}`;

    // 是否有详情可以展开
    const hasDetails = description || (funds && funds.length > 0);
    const expandableClass = hasDetails ? 'event-card-expandable' : '';

    return `
        <div class="timeline-event ${typeClass} ${severityClass}" style="animation-delay: ${index * 0.08}s">
            <div class="event-timepoint">
                <div class="timepoint-dot"></div>
                <div class="timepoint-date">${formatDate(date)}</div>
            </div>
            <div class="event-card ${expandableClass}">
                <div class="event-card-header">
                    <span class="event-icon">${icon}</span>
                    <div class="event-title-section">
                        <h4 class="event-title">${title}</h4>
                        <span class="event-severity-tag ${severityClass}">${getSeverityLabel(severity)}</span>
                    </div>
                    ${hasDetails ? '<span class="expand-icon">▼</span>' : ''}
                </div>
                ${hasDetails ? `
                    <div class="event-details">
                        ${description ? `<p class="event-description">${description}</p>` : ''}
                        ${funds && funds.length > 0 ? `
                            <div class="event-funds">
                                <span class="funds-label">涉及基金：</span>
                                <div class="funds-tags">
                                    ${funds.map(f => `
                                        <span class="event-fund-tag">
                                            ${f.name || f.code}
                                            ${f.change !== undefined ? `<span class="fund-change ${f.change >= 0 ? 'up' : 'down'}">${f.change >= 0 ? '+' : ''}${f.change.toFixed(2)}%</span>` : ''}
                                            ${f.old_score !== undefined ? `<span class="fund-score-change">${f.old_score} → ${f.new_score}</span>` : ''}
                                            ${f.current_weight !== undefined ? `<span class="fund-weight">权重 ${f.current_weight.toFixed(1)}%</span>` : ''}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * 获取事件类型对应的 CSS 类名
 * @param {string} type - 事件类型
 * @returns {string} CSS 类名
 */
function getEventTypeClass(type) {
    const classMap = {
        'price_surge': 'event-price-surge',
        'price_drop': 'event-price-drop',
        'signal_change': 'event-signal',
        'sentiment': 'event-sentiment',
        'drift': 'event-drift',
        'milestone': 'event-milestone'
    };
    return classMap[type] || 'event-other';
}

/**
 * 获取严重程度标签
 * @param {string} severity - 严重程度
 * @returns {string} 标签文本
 */
function getSeverityLabel(severity) {
    const labels = {
        'high': '高',
        'medium': '中',
        'low': '低'
    };
    return labels[severity] || '中';
}

/**
 * 格式化日期为易读格式
 * @param {string|number} dateStr - 日期字符串 (YYYY-MM-DD) 或时间戳（毫秒）
 * @returns {string} 格式化后的日期
 */
function formatDate(dateStr) {
    if (!dateStr) return '';

    let date;
    // 处理数字类型的时间戳（毫秒级）
    if (typeof dateStr === 'number') {
        date = new Date(dateStr);
    }
    // 处理字符串类型
    else if (typeof dateStr === 'string') {
        // 如果是纯数字字符串，当作时间戳处理
        if (/^\d+$/.test(dateStr)) {
            date = new Date(parseInt(dateStr, 10));
        } else {
            // 否则当作日期字符串（如 "2026-05-19"）
            date = new Date(dateStr);
        }
    } else {
        return String(dateStr);
    }

    // 验证日期是否有效
    if (isNaN(date.getTime())) {
        return String(dateStr);
    }

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // 检查是否是今天或昨天
    if (date.toDateString() === today.toDateString()) {
        return '今天';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return '昨天';
    }

    // 否则返回月/日
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
}

// CSS 样式（导出供注入）
export const TIMELINE_CSS = `
/* ===== 智能事件时间线模块样式 ===== */
.timeline-page {
    padding: 16px;
    max-width: 100%;
}

.timeline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
}

.timeline-title {
    display: flex;
    align-items: center;
    gap: 12px;
}

.timeline-icon {
    font-size: 28px;
}

.timeline-title h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
}

.timeline-meta {
    display: flex;
    align-items: center;
    gap: 16px;
}

.timeline-updated {
    font-size: 12px;
    color: var(--text3);
}

.timeline-event-count {
    display: flex;
    align-items: baseline;
    gap: 4px;
    background: var(--bg);
    padding: 6px 14px;
    border-radius: 8px;
}

.count-value {
    font-size: 18px;
    font-weight: 800;
    color: var(--primary);
    font-variant-numeric: tabular-nums;
}

.count-label {
    font-size: 12px;
    color: var(--text3);
}

/* 事件统计摘要栏 */
.timeline-stats-bar {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
    flex-wrap: wrap;
}

.stat-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--card);
    padding: 8px 14px;
    border-radius: 8px;
    box-shadow: var(--shadow);
    flex-shrink: 0;
}

.stat-icon {
    font-size: 16px;
}

.stat-count {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
}

.stat-label {
    font-size: 11px;
    color: var(--text3);
    font-weight: 500;
}

/* 时间线容器 */
.timeline-container {
    position: relative;
    padding-left: 40px;
}

.timeline-line {
    position: absolute;
    left: 16px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--border);
    transform: translateX(-50%);
}

/* 单个事件 */
.timeline-event {
    position: relative;
    margin-bottom: 20px;
    animation: fadeInUp 0.4s ease-out forwards;
    opacity: 0;
}

@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.event-timepoint {
    position: absolute;
    left: -40px;
    top: 0;
    width: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.timepoint-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--primary);
    border: 3px solid var(--card);
    box-shadow: 0 0 0 2px var(--primary);
    margin-bottom: 6px;
    flex-shrink: 0;
}

.event-price-surge .timepoint-dot {
    background: #22c55e;
    box-shadow: 0 0 0 2px #22c55e;
}

.event-price-drop .timepoint-dot {
    background: #ef4444;
    box-shadow: 0 0 0 2px #ef4444;
}

.event-signal .timepoint-dot {
    background: #f5a255;
    box-shadow: 0 0 0 2px #f5a255;
}

.event-sentiment .timepoint-dot {
    background: #8b5cf6;
    box-shadow: 0 0 0 2px #8b5cf6;
}

.event-drift .timepoint-dot {
    background: #06b6d4;
    box-shadow: 0 0 0 2px #06b6d4;
}

.event-milestone .timepoint-dot {
    background: #fbbf24;
    box-shadow: 0 0 0 2px #fbbf24;
}

.timepoint-date {
    font-size: 10px;
    font-weight: 600;
    color: var(--text3);
    white-space: nowrap;
    text-align: center;
}

/* 事件卡片 */
.event-card {
    background: var(--card);
    border-radius: 12px;
    padding: 14px 16px;
    box-shadow: var(--shadow);
    border-left: 4px solid transparent;
    transition: transform 0.15s, box-shadow 0.15s;
}

.event-card:hover {
    transform: translateX(4px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.event-card-expandable {
    cursor: pointer;
}

.event-price-surge .event-card {
    border-left-color: #22c55e;
}

.event-price-drop .event-card {
    border-left-color: #ef4444;
}

.event-signal .event-card {
    border-left-color: #f5a255;
}

.event-sentiment .event-card {
    border-left-color: #8b5cf6;
}

.event-drift .event-card {
    border-left-color: #06b6d4;
}

.event-milestone .event-card {
    border-left-color: #fbbf24;
}

.event-card-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
}

.event-icon {
    font-size: 20px;
    flex-shrink: 0;
    margin-top: 2px;
}

.event-title-section {
    flex: 1;
}

.event-title {
    margin: 0 0 4px 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.3;
}

.event-severity-tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
}

.event-severity-tag.severity-high {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
}

.event-severity-tag.severity-medium {
    background: rgba(245, 162, 85, 0.1);
    color: #f5a255;
}

.event-severity-tag.severity-low {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
}

.expand-icon {
    font-size: 10px;
    color: var(--text3);
    flex-shrink: 0;
    margin-top: 4px;
    transition: transform 0.2s;
}

/* 事件详情 */
.event-details {
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    transition: max-height 0.3s ease, opacity 0.2s ease;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
}

.event-description {
    margin: 0 0 10px 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text2);
}

.event-funds {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.funds-label {
    font-size: 11px;
    color: var(--text3);
    font-weight: 500;
}

.funds-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.event-fund-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 4px 10px;
    border-radius: 6px;
    color: var(--text2);
}

.fund-change {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.fund-change.up {
    color: var(--up, #ff6b7a);
}

.fund-change.down {
    color: var(--down, #35e89b);
}

.fund-score-change {
    font-weight: 600;
    color: var(--text3);
}

.fund-weight {
    font-weight: 600;
    color: var(--text2);
}

/* 空状态 */
.timeline-empty {
    text-align: center;
    padding: 48px 24px;
    background: var(--card);
    border-radius: 12px;
    box-shadow: var(--shadow);
}

.empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
}

.empty-text {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 8px;
}

.empty-desc {
    font-size: 13px;
    color: var(--text3);
}

/* 响应式设计 */
@media (max-width: 768px) {
    .timeline-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
    }

    .timeline-meta {
        width: 100%;
        justify-content: space-between;
    }

    .timeline-stats-bar {
        flex-direction: column;
        gap: 8px;
    }

    .stat-chip {
        justify-content: flex-start;
    }

    .timeline-container {
        padding-left: 30px;
    }

    .event-timepoint {
        left: -30px;
        width: 30px;
    }

    .timepoint-dot {
        width: 12px;
        height: 12px;
    }

    .timepoint-date {
        font-size: 9px;
    }
}

@media (max-width: 480px) {
    .timeline-page {
        padding: 12px;
    }

    .timeline-container {
        padding-left: 24px;
    }

    .event-timepoint {
        left: -24px;
        width: 24px;
    }

    .event-card {
        padding: 12px;
    }
}
`;

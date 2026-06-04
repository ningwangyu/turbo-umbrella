/**
 * 尾部风险分析组件 — VaR/CVaR指标 + 最差10天表格 + 回撤区间时间线 + 偏度峰度。
 *
 * @exports renderTailRisk(container, data)
 * @exports destroyTailRiskCharts()
 */

/**
 * 渲染尾部风险分析。
 */
export function renderTailRisk(container, data) {
    if (!container) return;

    if (!data || data.return_count === 0) {
        container.innerHTML = '<div class="ra-empty">暂无尾部风险数据（需要30天以上持仓记录）</div>';
        return;
    }

    let html = '';

    // VaR/CVaR 指标卡片
    html += '<div class="ra-grid-4col" style="margin-bottom:12px">';
    html += varCard('VaR 95%', data.var_95, '95%置信水平下最大预期日亏损');
    html += varCard('VaR 99%', data.var_99, '99%置信水平下最大预期日亏损');
    html += varCard('CVaR 95%', data.cvar_95, '尾部平均亏损（比VaR更保守）');
    html += varCard('CVaR 99%', data.cvar_99, '极端尾部平均亏损');
    html += '</div>';

    // 高级指标
    html += '<div class="ra-grid-4col" style="margin-bottom:12px">';
    html += metricItem('Ulcer Index', data.ulcer_index, '', '下行波动持续性');
    html += metricItem('Pain Index', data.pain_index, '', '平均回撤深度');
    html += metricItem('偏度 (Skew)', data.skewness, '', data.skewness < 0 ? '左偏（负尾较重）' : data.skewness > 0 ? '右偏（正尾较重）' : '对称分布');
    html += metricItem('超额峰度 (Kurt)', data.kurtosis, '', data.kurtosis > 0 ? '厚尾（极端事件多于正态）' : '薄尾');
    html += '</div>';

    // 第二行高级指标
    html += '<div class="ra-grid-4col" style="margin-bottom:14px">';
    html += metricItem('尾部比率', data.tail_ratio, '', '95分位/5分位绝对值比');
    html += metricItem('年化波动率', data.annual_volatility, '%', `${data.return_count}个交易日`);
    html += metricItem('最差单日', data.worst_days.length > 0 ? data.worst_days[0].return : null, '%', data.worst_days.length > 0 ? data.worst_days[0].date : '--');
    html += metricItem('回撤区间数', data.drawdown_periods ? data.drawdown_periods.length : 0, '个', '超1%回撤');
    html += '</div>';

    // 最差10天表格
    if (data.worst_days && data.worst_days.length > 0) {
        html += '<div class="ra-section-title">最差10个交易日</div>';
        html += '<div class="ra-table-wrap" style="margin-bottom:14px">';
        html += '<table class="ra-table"><thead><tr>';
        html += '<th>排名</th><th>日期</th><th>日收益率</th>';
        html += '</tr></thead><tbody>';
        data.worst_days.forEach(d => {
            html += `<tr>
                <td>#${d.rank}</td>
                <td>${d.date}</td>
                <td class="down">${d.return}%</td>
            </tr>`;
        });
        html += '</tbody></table></div>';
    }

    // 回撤区间时间线
    if (data.drawdown_periods && data.drawdown_periods.length > 0) {
        html += '<div class="ra-section-title">主要回撤区间</div>';
        html += '<div class="ra-dd-timeline">';
        data.drawdown_periods.forEach((dp, i) => {
            const recovered = dp.recovery_days != null;
            html += `<div class="ra-dd-item">
                <div class="ra-dd-badge">${dp.max_drawdown}%</div>
                <div class="ra-dd-detail">
                    <div class="ra-dd-detail-label">起始</div>
                    <div class="ra-dd-detail-value">${dp.start}</div>
                </div>
                <div class="ra-dd-detail">
                    <div class="ra-dd-detail-label">谷底</div>
                    <div class="ra-dd-detail-value">${dp.trough}</div>
                </div>
                <div class="ra-dd-detail">
                    <div class="ra-dd-detail-label">恢复</div>
                    <div class="ra-dd-detail-value">${recovered ? dp.end : '未恢复'}</div>
                </div>
                <div class="ra-dd-detail">
                    <div class="ra-dd-detail-label">水下天数</div>
                    <div class="ra-dd-detail-value">${dp.underwater_days}天</div>
                </div>
                <div class="ra-dd-detail">
                    <div class="ra-dd-detail-label">恢复天数</div>
                    <div class="ra-dd-detail-value">${recovered ? dp.recovery_days + '天' : '--'}</div>
                </div>
            </div>`;
        });
        html += '</div>';
    }

    container.innerHTML = html;
}

function varCard(label, value, desc) {
    const display = value != null ? `${value}%` : '--';
    return `<div class="ra-metric-card">
        <div class="ra-metric-label">${label}</div>
        <div class="ra-metric-value down">${display}</div>
        <div class="ra-metric-desc">${desc}</div>
    </div>`;
}

function metricItem(label, value, suffix, desc) {
    const display = value != null ? `${value}${suffix}` : '--';
    return `<div class="ra-metric-card">
        <div class="ra-metric-label">${label}</div>
        <div class="ra-metric-value">${display}</div>
        <div class="ra-metric-desc">${desc || ''}</div>
    </div>`;
}

export function destroyTailRiskCharts() {
    // No Chart.js instances to destroy (pure HTML rendering)
}

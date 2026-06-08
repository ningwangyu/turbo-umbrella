/** 情绪详情模块 — 展示指标拆解、行业热度和资金流向的解释性内容。 */
import { colorCls, fmtMoney } from '../utils.js';
import { fetchMarketSectors } from './api.js';
import { sentimentState } from './state.js';
import { destroyDetailChart } from './charts.js';
import { bindLimitTabs } from './limit-stocks.js';

export function toggleDetailPanel(key, data) {
    const panel = document.getElementById('sentimentDetailPanel');
    if (!panel) return;

    // 切换激活态
    document.querySelectorAll('.clickable-card').forEach(c => c.classList.remove('active'));

    // 同一张卡点击 = 收起
    if (sentimentState.currentDetailCard === key) {
        sentimentState.currentDetailCard = null;
        destroyDetailChart();
        panel.innerHTML = '';
        panel.classList.remove('show');
        return;
    }

    sentimentState.currentDetailCard = key;
    document.querySelector(`.clickable-card[data-detail-key="${key}"]`)?.classList.add('active');

    destroyDetailChart();
    panel.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载详情...</div>';
    panel.classList.add('show');

    // 根据类型渲染
    const renderers = {
        "涨跌比": () => renderAdvanceDeclineDetail(panel, data),
        "北向资金": () => renderNorthboundDetail(panel, data),
        "成交量": () => renderVolumeDetail(panel, data),
        "板块涨跌": () => renderSectorDetail(panel, data),
        "赚钱效应": () => renderMoneyEffectDetail(panel, data),
        "涨跌停": () => renderLimitDetail(panel, data),
    };
    if (renderers[key]) renderers[key]();
}


// ==================== 涨跌比详情 ====================

function renderAdvanceDeclineDetail(panel, data) {
    const breadth = data.indicators?.涨跌比;
    if (!breadth) { panel.innerHTML = '<div class="detail-empty">暂无数据</div>'; return; }

    const up = breadth.up_count || 0;
    const down = breadth.down_count || 0;
    const flat = breadth.flat_count || 0;
    const total = breadth.total_count || up + down + flat;
    const upRatio = breadth.up_ratio ?? breadth.ratio ?? (total > 0 ? up / total * 100 : 0);
    const downRatio = breadth.down_ratio ?? (total > 0 ? down / total * 100 : 0);
    const flatRatio = total > 0 ? Math.max(0, 100 - upRatio - downRatio) : 0;
    const breadthCls = up > down ? 'up' : down > up ? 'down' : 'flat';

    if (total <= 0) { panel.innerHTML = '<div class="detail-empty">暂无涨跌家数数据</div>'; return; }

    panel.innerHTML = `
    <div class="detail-panel-header">📊 涨跌比详情</div>
    <div class="breadth-hero-card ${breadthCls}">
        <div class="breadth-hero-label">市场宽度</div>
        <div class="breadth-hero-value ${breadthCls}">${upRatio.toFixed(1)}%</div>
        <div class="breadth-hero-sub">上涨占比 · ${up}涨 / ${down}跌</div>
    </div>
    <div class="breadth-stats-grid">
        <div class="breadth-stat-card up"><strong>${up}</strong><span>上涨</span></div>
        <div class="breadth-stat-card down"><strong>${down}</strong><span>下跌</span></div>
        <div class="breadth-stat-card flat"><strong>${flat}</strong><span>平盘</span></div>
        <div class="breadth-stat-card"><strong>${total}</strong><span>合计</span></div>
    </div>
    <div class="breadth-ratio-stack" aria-label="涨跌占比">
        <div class="breadth-ratio-segment up" style="width:${upRatio}%"></div>
        <div class="breadth-ratio-segment flat" style="width:${flatRatio}%"></div>
        <div class="breadth-ratio-segment down" style="width:${downRatio}%"></div>
    </div>
    <div class="breadth-ratio-legend">
        <span><i class="legend-dot up"></i>上涨 ${upRatio.toFixed(1)}%</span>
        <span><i class="legend-dot flat"></i>平盘 ${flatRatio.toFixed(1)}%</span>
        <span><i class="legend-dot down"></i>下跌 ${downRatio.toFixed(1)}%</span>
    </div>
    <div class="breadth-summary">${generateBreadthSummary(up, down, flat, total, upRatio)}</div>`;
}

function generateBreadthSummary(up, down, flat, total, upRatio) {
    const downRatio = total > 0 ? down / total * 100 : 0;
    let text = `今日样本中 <strong>${up}</strong> 只上涨、<strong>${down}</strong> 只下跌、<strong>${flat}</strong> 只平盘，上涨占比 <strong>${upRatio.toFixed(1)}%</strong>。`;
    if (upRatio >= 70) {
        text += ' 个股普涨，市场广度显著扩散，短线情绪处于强势区间。';
    } else if (upRatio >= 55) {
        text += ' 上涨家数占优，市场偏暖，但仍需观察热点能否持续扩散。';
    } else if (downRatio >= 70) {
        text += ' 个股普跌，亏钱效应扩散，适合降低交易频率并控制仓位。';
    } else if (downRatio >= 55) {
        text += ' 下跌家数占优，市场偏弱，资金风险偏好仍需修复。';
    } else {
        text += ' 涨跌分布接近均衡，市场分歧较大，宜关注成交量和资金方向确认。';
    }
    return text;
}


// ==================== 北向资金详情 ====================

function renderNorthboundDetail(panel, data) {
    const north = data.indicators?.北向资金;
    if (!north) { panel.innerHTML = '<div class="detail-empty">暂无数据</div>'; return; }

    const amount = north.amount;
    const turnover = north.turnover;
    const status = north.status || (amount != null ? 'ok' : 'empty');
    const amountCls = amount > 0 ? 'up' : amount < 0 ? 'down' : 'flat';
    const amountText = amount != null ? `${amount > 0 ? '+' : ''}${amount.toFixed(2)}亿` : north.value || '暂无净流入';
    const statusText = getNorthboundStatusText(status, north.source);

    panel.innerHTML = `
    <div class="detail-panel-header">💰 北向资金详情</div>
    <div class="northbound-main-card ${amountCls}">
        <div class="northbound-main-label">净流入</div>
        <div class="northbound-amount ${amountCls}">${amountText}</div>
        <div class="northbound-flow-badge ${amountCls}">${getNorthboundFlowLabel(amount, status)}</div>
    </div>
    <div class="northbound-meta-grid">
        <div class="northbound-meta-card">
            <span>成交额</span>
            <strong>${turnover != null ? `${turnover.toFixed(2)}亿` : '暂无'}</strong>
        </div>
        <div class="northbound-meta-card">
            <span>数据状态</span>
            <strong>${statusText}</strong>
        </div>
        <div class="northbound-meta-card">
            <span>数据源</span>
            <strong>${formatNorthboundSource(north.source)}</strong>
        </div>
    </div>
    <div class="northbound-summary">${generateNorthboundSummary(amount, turnover, status, north.error)}</div>`;
}

function getNorthboundFlowLabel(amount, status) {
    if (status === 'turnover_only') return '仅成交额';
    if (amount == null) return '等待数据';
    if (amount >= 50) return '大幅流入';
    if (amount > 0) return '小幅流入';
    if (amount <= -50) return '大幅流出';
    if (amount < 0) return '小幅流出';
    return '基本持平';
}

function getNorthboundStatusText(status, source) {
    if (status === 'ok') return '可用';
    if (status === 'turnover_only') return '仅成交额';
    if (status === 'unavailable') return '净流入暂缺';
    if (status === 'error') return '获取失败';
    if (source) return '部分可用';
    return '暂无数据';
}

function formatNorthboundSource(source) {
    if (source === 'eastmoney_rtmin') return '东方财富实时';
    if (source === 'eastmoney_summary') return '东方财富汇总';
    if (source === 'eastmoney') return '东方财富';
    return '暂无';
}

function generateNorthboundSummary(amount, turnover, status, error) {
    if (status === 'error') return `北向资金获取失败${error ? `：${error}` : ''}，可稍后刷新重试。`;
    if (status === 'turnover_only') return turnover != null
        ? `当前仅获取到北向成交额 <strong>${turnover.toFixed(2)}亿</strong>，暂缺净流入方向，建议结合 ETF 资金排行和市场宽度判断资金偏好。`
        : '当前仅获取到北向成交额状态，但具体金额暂缺，建议稍后刷新确认资金方向。';
    if (amount == null) return '当前暂无北向净流入数据，资金方向信号不足，可等待接口更新后再判断。';
    if (amount >= 50) return `北向资金大幅净流入 <strong>${amount.toFixed(2)}亿</strong>，外资风险偏好明显提升，对权重和核心资产支撑较强。`;
    if (amount > 0) return `北向资金小幅净流入 <strong>${amount.toFixed(2)}亿</strong>，资金面偏暖，但力度仍需继续观察。`;
    if (amount <= -50) return `北向资金大幅净流出 <strong>${amount.toFixed(2)}亿</strong>，外资抛压较重，需警惕指数承压。`;
    if (amount < 0) return `北向资金小幅净流出 <strong>${amount.toFixed(2)}亿</strong>，资金面略偏谨慎，适合观察是否继续扩大。`;
    return '北向资金净流入基本持平，外资方向暂不明确，可结合成交量和板块涨跌继续确认。';
}


// ==================== 成交量详情 ====================

function renderVolumeDetail(panel, data) {
    const vol = data.indicators?.成交量;
    if (!vol) { panel.innerHTML = '<div class="detail-empty">暂无数据</div>'; return; }

    const amount = vol.amount || 0;
    const avg = vol.avg_amount || 0;
    const diff = avg > 0 ? ((amount - avg) / avg * 100) : 0;
    const isUp = diff > 0;
    const volLabel = Math.abs(diff) > 20 ? (isUp ? '放量' : '缩量') : '平量';

    let html = `
    <div class="detail-panel-header">📦 成交量详情</div>
    <div class="volume-main-stat">
        <div class="volume-big-num">${amount.toFixed(0)}<span class="volume-unit">亿</span></div>
        <div class="volume-compare">
            5日均值 <strong>${avg.toFixed(0)}亿</strong>
            <span class="${isUp ? 'up' : 'down'}" style="margin-left:6px;">${isUp ? '↑' : '↓'}${Math.abs(diff).toFixed(1)}%</span>
            <span class="vol-tag ${isUp ? 'vol-up' : 'vol-down'}">${volLabel}</span>
        </div>
    </div>
    <div class="detail-chart-area"><canvas id="volumeDetailChart" height="160"></canvas></div>
    <div class="volume-summary">
        ${generateVolumeSummary(amount, avg, diff, volLabel)}
    </div>`;
    panel.innerHTML = html;

    // 绘制柱状图
    const trend = vol.trend || [];
    if (trend.length > 0 && typeof Chart !== 'undefined') {
        const canvas = document.getElementById('volumeDetailChart');
        const labels = trend.map(t => t.date.slice(5)); // MM-DD
        const amounts = trend.map(t => t.amount);
        const avgLine = new Array(trend.length).fill(avg);
        const barColors = amounts.map(a => a >= avg ? 'rgba(231,76,60,0.7)' : 'rgba(39,174,96,0.7)');
        sentimentState.detailChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: '成交额(亿)', data: amounts, backgroundColor: barColors, borderRadius: 4, barPercentage: 0.6 },
                    { label: '5日均值', data: avgLine, type: 'line', borderColor: '#f5a623', borderDash: [5, 3], borderWidth: 1.5, pointRadius: 0, fill: false },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top', labels: { font: { size: 10 } } } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                    y: { ticks: { font: { size: 10 }, callback: v => v + '亿' }, grid: { color: '#f0f0f0' } },
                },
            },
        });
    }
}

function generateVolumeSummary(amount, avg, diff, label) {
    let text = `今日沪深两市成交额 <strong>${amount.toFixed(0)}亿</strong>，`;
    if (label === '放量') {
        text += `较5日均值放量${Math.abs(diff).toFixed(1)}%，市场交投活跃，资金入场意愿较强。放量上涨通常意味着趋势延续，放量下跌则可能加速赶底。`;
    } else if (label === '缩量') {
        text += `较5日均值缩量${Math.abs(diff).toFixed(1)}%，市场交投清淡，多空分歧较小。缩量回调可能是洗盘，缩量反弹则需警惕动能不足。`;
    } else {
        text += `与5日均值基本持平（${diff > 0 ? '+' : ''}${diff.toFixed(1)}%），市场交投正常，暂无明显的放量或缩量信号。`;
    }
    return text;
}


// ==================== 板块涨跌详情 ====================

async function renderSectorDetail(panel, data) {
    const sectorInd = data.indicators?.板块涨跌;
    if (!sectorInd) { panel.innerHTML = '<div class="detail-empty">暂无数据</div>'; return; }

    let sectors = [];
    try {
        sectors = await fetchMarketSectors();
    } catch (e) {
        panel.innerHTML = '<div class="detail-empty">板块数据加载失败</div>';
        return;
    }

    if (!sectors || !sectors.length) { panel.innerHTML = '<div class="detail-empty">板块数据加载较慢，稍后重试</div>'; return; }

    const upSectors = sectors.filter(s => s.change_pct > 0);
    const downSectors = sectors.filter(s => s.change_pct < 0);
    const flatSectors = sectors.filter(s => s.change_pct === 0);

    let html = `
    <div class="detail-panel-header">🏢 板块涨跌详情</div>
    <div class="sector-stats-row">
        <div class="sector-stat up">${upSectors.length}<span>个涨</span></div>
        <div class="sector-stat down">${downSectors.length}<span>个跌</span></div>
        <div class="sector-stat flat">${flatSectors.length}<span>个平</span></div>
    </div>
    <div class="sector-summary">${generateSectorSummary(upSectors, downSectors, sectors)}</div>
    <div class="sector-detail-list">`;

    sectors.forEach(s => {
        const cls = s.change_pct > 0 ? 'up' : s.change_pct < 0 ? 'down' : 'flat';
        const leaderText = s.leader_name ? `<span class="sector-leader">领涨: ${s.leader_name}</span>` : '';
        const upDown = (s.up_count != null && s.down_count != null)
            ? `<span class="sector-updown"><span class="up">${s.up_count}涨</span>/<span class="down">${s.down_count}跌</span></span>`
            : '';
        html += `<div class="sector-detail-row">
            <span class="sector-detail-name">${s.name}</span>
            ${leaderText}
            ${upDown}
            <span class="sector-detail-change ${cls}">${fmtMoney(s.change_pct)}%</span>
        </div>`;
    });

    html += `</div>`;
    panel.innerHTML = html;
}

function generateSectorSummary(upSectors, downSectors, all) {
    const ratio = all.length > 0 ? (upSectors.length / all.length * 100).toFixed(0) : 0;
    const topUp = upSectors[0];
    const topDown = downSectors[downSectors.length - 1];
    let text = `今日共 <strong>${upSectors.length}</strong> 个板块上涨、<strong>${downSectors.length}</strong> 个板块下跌，上涨占比 ${ratio}%。`;
    if (topUp) text += `领涨板块为 <strong>${topUp.name}</strong>（${fmtMoney(topUp.change_pct)}%）`;
    if (topDown) text += `，领跌板块为 <strong>${topDown.name}</strong>（${fmtMoney(topDown.change_pct)}%）。`;
    if (upSectors.length > downSectors.length * 2) {
        text += ' 板块普涨，市场赚钱效应扩散，属于强势行情特征。';
    } else if (downSectors.length > upSectors.length * 2) {
        text += ' 板块普跌，市场情绪低迷，建议控制仓位等待企稳信号。';
    } else {
        text += ' 板块分化明显，建议关注资金集中流入的板块方向。';
    }
    return text;
}


// ==================== 赚钱效应详情 ====================

function renderMoneyEffectDetail(panel, data) {
    const effect = data.indicators?.赚钱效应;
    const limitInd = data.indicators?.涨跌停;
    if (!effect) { panel.innerHTML = '<div class="detail-empty">暂无数据</div>'; return; }

    const avgUp = effect.avg_up || 0;
    const avgDown = Math.abs(effect.avg_down || 0);
    const limitUp = limitInd?.limit_up_count || 0;
    const limitDown = limitInd?.limit_down_count || 0;
    const total = limitUp + limitDown;

    // 赚钱效应强度评分（0-100）
    let effectScore = 50;
    if (limitUp > 0) effectScore += Math.min(avgUp * 1.5, 25);
    if (limitDown > 0) effectScore -= Math.min(avgDown * 1.5, 25);
    if (limitUp > limitDown) effectScore += 10;
    if (limitDown > limitUp) effectScore -= 10;
    effectScore = Math.max(5, Math.min(95, Math.round(effectScore)));

    const effectColor = effectScore >= 65 ? 'var(--up)' : effectScore <= 35 ? 'var(--down)' : 'var(--flat)';
    const effectLabel = effectScore >= 70 ? '赚钱效应强' : effectScore >= 50 ? '赚钱效应中性' : effectScore >= 30 ? '赚钱效应弱' : '亏钱效应强';

    // 进度条宽度
    const upBarW = Math.min(avgUp / 10 * 100, 100);
    const downBarW = Math.min(avgDown / 10 * 100, 100);

    let html = `
    <div class="detail-panel-header">🔥 赚钱效应详情</div>
    <div class="effect-score-card">
        <div class="effect-score-num" style="color:${effectColor}">${effectScore}</div>
        <div class="effect-score-label" style="color:${effectColor}">${effectLabel}</div>
    </div>
    <div class="effect-compare-section">
        <div class="effect-bar-row">
            <div class="effect-bar-label">涨停均涨幅</div>
            <div class="effect-bar-track">
                <div class="effect-bar-fill up" style="width:${upBarW}%"></div>
            </div>
            <div class="effect-bar-val up">+${avgUp.toFixed(1)}%</div>
        </div>
        <div class="effect-bar-row">
            <div class="effect-bar-label">跌停均跌幅</div>
            <div class="effect-bar-track">
                <div class="effect-bar-fill down" style="width:${downBarW}%"></div>
            </div>
            <div class="effect-bar-val down">-${avgDown.toFixed(1)}%</div>
        </div>
        <div class="effect-ratio-row">
            <span>涨停 <strong class="up">${limitUp}</strong> 家</span>
            <span class="effect-ratio-divider">/</span>
            <span>跌停 <strong class="down">${limitDown}</strong> 家</span>
        </div>
    </div>
    <div class="effect-summary">${generateEffectSummary(effectScore, avgUp, avgDown, limitUp, limitDown)}</div>`;
    panel.innerHTML = html;
}

function generateEffectSummary(score, avgUp, avgDown, limitUp, limitDown) {
    let text = '';
    if (score >= 70) {
        text = `赚钱效应<span class="up"><strong>强</strong></span>：涨停${limitUp}家（均涨+${avgUp.toFixed(1)}%），`;
        text += `远多于跌停${limitDown}家。市场热点持续性好，短线资金活跃，可积极参与强势板块。`;
    } else if (score >= 50) {
        text = `赚钱效应<span class="flat"><strong>中性</strong></span>：涨停${limitUp}家 vs 跌停${limitDown}家，`;
        text += `多空力量相对均衡。建议精选个股，避免盲目追高，关注有业绩支撑的方向。`;
    } else if (score >= 30) {
        text = `赚钱效应<span class="down"><strong>偏弱</strong></span>：涨停仅${limitUp}家（均涨+${avgUp.toFixed(1)}%），`;
        text += `跌停${limitDown}家。市场亏钱效应蔓延，建议控制仓位，以防守为主。`;
    } else {
        text = `亏钱效应<span class="down"><strong>强烈</strong></span>：跌停${limitDown}家（均跌-${avgDown.toFixed(1)}%），`;
        text += `涨停仅${limitUp}家。市场恐慌情绪浓厚，此时往往是逆向布局优质资产的机会。`;
    }
    return text;
}


// ==================== 涨跌停详情 ====================

function renderLimitDetail(panel, data) {
    const limitInd = data.indicators?.涨跌停;
    if (!limitInd) { panel.innerHTML = '<div class="detail-empty">暂无数据</div>'; return; }

    const limitUp = limitInd.limit_up_count || 0;
    const limitDown = limitInd.limit_down_count || 0;
    const total = limitUp + limitDown;
    const industryStats = limitInd.industry_stats || [];
    const downIndustryStats = limitInd.down_industry_stats || [];

    let html = `
    <div class="detail-panel-header">📈 涨跌停详情</div>
    <div class="limit-detail-numbers">
        <div class="limit-detail-box up">
            <div class="limit-detail-big">${limitUp}</div>
            <div class="limit-detail-label">涨停</div>
        </div>
        <div class="limit-detail-vs">VS</div>
        <div class="limit-detail-box down">
            <div class="limit-detail-big">${limitDown}</div>
            <div class="limit-detail-label">跌停</div>
        </div>
    </div>`;

    // 环形图
    if (total > 0) {
        html += `<div class="limit-doughnut-wrap"><canvas id="limitDoughnutChart" width="200" height="200"></canvas></div>`;
    }

    // 涨停行业分组 — 全部行业
    if (industryStats.length > 0) {
        html += `<div class="limit-industry-section">
            <div class="limit-industry-title">涨停股行业分布（${industryStats.length}个行业）</div>`;
        const maxCount = industryStats[0]?.count || 1;
        industryStats.forEach(ind => {
            const w = (ind.count / maxCount * 100);
            html += `<div class="limit-industry-row">
                <span class="limit-industry-name">${ind.name}</span>
                <div class="limit-industry-bar-track">
                    <div class="limit-industry-bar-fill up" style="width:${w}%"></div>
                </div>
                <span class="limit-industry-count">${ind.count}家</span>
            </div>`;
        });
        html += `</div>`;
    }

    // 跌停行业分组 — 全部行业
    if (downIndustryStats.length > 0) {
        html += `<div class="limit-industry-section">
            <div class="limit-industry-title">跌停股行业分布（${downIndustryStats.length}个行业）</div>`;
        const maxCount = downIndustryStats[0]?.count || 1;
        downIndustryStats.forEach(ind => {
            const w = (ind.count / maxCount * 100);
            html += `<div class="limit-industry-row">
                <span class="limit-industry-name">${ind.name}</span>
                <div class="limit-industry-bar-track">
                    <div class="limit-industry-bar-fill down" style="width:${w}%"></div>
                </div>
                <span class="limit-industry-count">${ind.count}家</span>
            </div>`;
        });
        html += `</div>`;
    }

    html += `<div class="limit-summary">${generateLimitSummary(limitUp, limitDown, industryStats, downIndustryStats)}</div>`;
    panel.innerHTML = html;

    // 环形图
    if (total > 0 && typeof Chart !== 'undefined') {
        const canvas = document.getElementById('limitDoughnutChart');
        sentimentState.detailChartInstance = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: ['涨停', '跌停'],
                datasets: [{
                    data: [limitUp, limitDown],
                    backgroundColor: ['rgba(231,76,60,0.8)', 'rgba(39,174,96,0.8)'],
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: false,
                cutout: '65%',
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
                    tooltip: { callbacks: { label: item => `${item.label}：${item.raw}家` } },
                },
            },
        });
    }
}

function generateLimitSummary(limitUp, limitDown, industryStats, downIndustryStats) {
    const total = limitUp + limitDown;
    let text = `今日共 <strong>${total}</strong> 只个股涨跌停，`;
    if (limitUp > limitDown * 3) {
        text += `涨停数远超跌停，市场情绪亢奋，短期赚钱效应强。`;
    } else if (limitUp > limitDown) {
        text += `涨停多于跌停，市场情绪偏暖，赚钱效应尚可。`;
    } else if (limitDown > limitUp * 3) {
        text += `跌停数远超涨停，市场恐慌情绪蔓延，亏钱效应强烈。`;
    } else if (limitDown > limitUp) {
        text += `跌停多于涨停，市场情绪偏冷，操作难度加大。`;
    } else {
        text += `涨跌停持平，多空博弈激烈。`;
    }
    if (industryStats && industryStats.length > 0) {
        text += `涨停股集中在 <strong>${industryStats[0].name}</strong>`;
        if (industryStats.length > 1) text += `、<strong>${industryStats[1].name}</strong>`;
        text += ` 等板块，资金方向明确。`;
    }
    if (downIndustryStats && downIndustryStats.length > 0) {
        text += ` 跌停股集中在 <strong>${downIndustryStats[0].name}</strong>`;
        if (downIndustryStats.length > 1) text += `、<strong>${downIndustryStats[1].name}</strong>`;
        text += ` 等板块，注意规避风险。`;
    }
    return text;
}

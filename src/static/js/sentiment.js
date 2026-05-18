/**
 * 市场情绪监控模块 — 恐慌/贪婪仪表盘、多维指标、涨跌停列表、ETF排行
 *
 * 交互：点击成交量/板块涨跌/赚钱效应/涨跌停卡片展开详情面板
 * ETF排行：图文并茂（水平柱状图+进度条+总结）
 */
import { fmtMoney, colorCls, showToast } from './utils.js';

let currentLimitTab = 'up';
let limitDataCache = { up: null, down: null };
let currentDetailCard = null; // 当前展开的详情卡 key
let detailChartInstance = null; // 详情面板中的 Chart.js 实例
let etfChartInstance = null; // ETF 图表实例
const ETF_CONSECUTIVE_DAY_OPTIONS = [
    { value: 1, label: '1天' },
    { value: 3, label: '3天' },
    { value: 7, label: '7天' },
    { value: 15, label: '半个月' },
    { value: 30, label: '一个月' },
];
let currentEtfConsecutiveDays = 7;
let etfConsecutiveCache = {};
let etfConsecutiveRequestId = 0;

/**
 * 获取并渲染市场情绪页面
 */
export async function renderSentiment(container) {
    container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载市场情绪数据...</div>';

    try {
        const r = await fetch("/api/market/sentiment");
        const data = await r.json();
        limitDataCache.up = null;
        limitDataCache.down = null;
        currentDetailCard = null;
        etfConsecutiveLoaded = false;
        currentEtfConsecutiveDays = 7;
        etfConsecutiveCache = {};
        etfConsecutiveRequestId = 0;
        renderSentimentPage(container, data);
    } catch (e) {
        container.innerHTML = '<div class="panel-loading" style="color:var(--up)">加载失败</div>';
    }
}

function renderSentimentPage(container, data) {
    let html = '<div class="sentiment-page">';

    // ========== 恐慌/贪婪仪表盘 ==========
    const scoreColor = data.score >= 60 ? "var(--up)" : data.score <= 40 ? "var(--down)" : "var(--flat)";
    html += `<div class="sentiment-gauge-card">
        <div class="sentiment-gauge-wrap">
            <canvas id="sentimentGauge" width="200" height="130"></canvas>
            <div class="sentiment-gauge-center">
                <div class="sentiment-score" style="color:${scoreColor}">${data.score}</div>
                <div class="sentiment-label">${data.emoji} ${data.label}</div>
            </div>
        </div>
        <div class="sentiment-advice">${data.advice}</div>
    </div>`;

    // ========== 多维指标卡片（3列×2行） ==========
    if (data.indicators) {
        html += `<div class="sentiment-indicators">`;

        const cards = [
            { key: "涨跌比", icon: "📊", cls: "" },
            { key: "涨跌停", icon: "📈", cls: "clickable-card", clickable: true },
            { key: "北向资金", icon: "💰", cls: "" },
            { key: "赚钱效应", icon: "🔥", cls: "clickable-card", clickable: true },
            { key: "板块涨跌", icon: "🏢", cls: "clickable-card", clickable: true },
            { key: "成交量", icon: "📦", cls: "clickable-card", clickable: true },
        ];

        cards.forEach(card => {
            const ind = data.indicators[card.key];
            if (!ind) return;
            let valueCls = "";
            if (card.key === "北向资金" && ind.amount != null) {
                valueCls = ind.amount > 0 ? "up" : ind.amount < 0 ? "down" : "flat";
            } else if (card.key === "涨跌停") {
                const up = ind.limit_up_count || 0;
                const down = ind.limit_down_count || 0;
                valueCls = up > down ? "up" : down > up ? "down" : "flat";
            } else if (card.key === "赚钱效应") {
                valueCls = ind.avg_up > Math.abs(ind.avg_down) ? "up" : "down";
            } else if (card.key === "板块涨跌") {
                valueCls = (ind.up_count || 0) > (ind.down_count || 0) ? "up" : "down";
            }
            const activeCls = (card.clickable && currentDetailCard === card.key) ? ' active' : '';
            const clickAttr = card.clickable ? ` data-detail-key="${card.key}"` : '';
            html += `<div class="sentiment-ind-card ${card.cls}${activeCls}"${clickAttr}>
                <div class="sentiment-ind-label">${card.icon} ${card.key}</div>
                <div class="sentiment-ind-value ${valueCls}">${ind.value}</div>
                ${card.clickable ? '<div class="card-expand-hint">点击查看详情 ›</div>' : ''}
            </div>`;
        });
        html += `</div>`;

        // ========== 详情面板容器（手风琴） ==========
        html += `<div id="sentimentDetailPanel" class="sentiment-detail-panel"></div>`;
    }

    // ========== 涨跌停个股列表（Tab切换） ==========
    html += `<div class="analysis-section limit-stocks-section">
        <div class="section-title limit-stocks-header">
            <span>涨跌停个股</span>
            <div class="limit-tabs">
                <button class="limit-tab active" data-dir="up">涨停 <span id="limitUpCount" class="limit-count up">0</span></button>
                <button class="limit-tab" data-dir="down">跌停 <span id="limitDownCount" class="limit-count down">0</span></button>
            </div>
        </div>
        <div id="limitStocksList" class="limit-stocks-list">
            <div class="panel-loading"><span class="spinner"></span>加载中...</div>
        </div>
    </div>`;

    // ========== ETF资金流入排行 ==========
    const etfList = data.indicators?.etf_list || [];
    html += `<div class="analysis-section etf-section">
        <div class="etf-section-header">
            <div class="section-title">ETF资金排行</div>
            <div class="etf-tabs">
                <button class="etf-tab active" data-etf-tab="daily">当日资金流入</button>
                <button class="etf-tab" data-etf-tab="consecutive">持续流入流出</button>
            </div>
        </div>
        <div id="etfTabDaily" class="etf-tab-panel show">`;

    if (etfList.length) {
        html += `<div class="etf-chart-wrap"><canvas id="etfInflowChart" height="220"></canvas></div>`;

        // ETF 总结卡片
        const totalInflow = etfList.reduce((s, e) => s + e.net_inflow, 0);
        const posCount = etfList.filter(e => e.net_inflow > 0).length;
        const negCount = etfList.filter(e => e.net_inflow < 0).length;
        let etfSummary = '';
        if (totalInflow > 50) {
            etfSummary = `资金大幅流入（合计${totalInflow > 0 ? '+' : ''}${totalInflow.toFixed(2)}亿），市场做多情绪强烈，${posCount}只ETF录得净流入。`;
        } else if (totalInflow > 0) {
            etfSummary = `资金小幅流入（合计+${totalInflow.toFixed(2)}亿），整体偏乐观，${posCount}只ETF录得净流入。`;
        } else if (totalInflow > -50) {
            etfSummary = `资金小幅流出（合计${totalInflow.toFixed(2)}亿），市场观望情绪较浓，${negCount}只ETF录得净流出。`;
        } else {
            etfSummary = `资金大幅流出（合计${totalInflow.toFixed(2)}亿），市场抛压较重，${negCount}只ETF录得净流出，注意控制风险。`;
        }
        const topEtf = etfList[0];
        const flowType = /沪深300|中证500|上证50|创业板|科创/i.test(topEtf.name) ? '宽基指数' : '行业主题';
        html += `<div class="etf-summary">
                <div class="etf-summary-header">📋 资金流向总结</div>
                <div class="etf-summary-stats">
                    <div class="etf-stat-item">
                        <div class="etf-stat-label">总净流入</div>
                        <div class="etf-stat-value ${colorCls(totalInflow)}">${totalInflow > 0 ? '+' : ''}${totalInflow.toFixed(2)}亿</div>
                    </div>
                    <div class="etf-stat-item">
                        <div class="etf-stat-label">流入ETF数</div>
                        <div class="etf-stat-value">${posCount}/${etfList.length}</div>
                    </div>
                    <div class="etf-stat-item">
                        <div class="etf-stat-label">资金方向</div>
                        <div class="etf-stat-value">${flowType}</div>
                    </div>
                </div>
                <div class="etf-summary-text">${etfSummary}</div>
            </div>`;
    } else {
        html += `<div class="detail-empty">暂无当日ETF资金流数据，可切换查看持续流入流出</div>`;
    }

    html += `</div>
        <div id="etfTabConsecutive" class="etf-tab-panel">
            <div class="consecutive-filter">
                ${ETF_CONSECUTIVE_DAY_OPTIONS.map(opt => `<button class="consecutive-filter-btn ${opt.value === currentEtfConsecutiveDays ? 'active' : ''}" data-days="${opt.value}">${opt.label}</button>`).join('')}
            </div>
            <div id="etfConsecutiveContent">
                <div class="panel-loading"><span class="spinner"></span>加载持续流入流出数据...</div>
            </div>
        </div>
    </div>`;

    html += `<div class="update-info">${data.updated_at} 更新</div>`;
    html += '</div>';
    container.innerHTML = html;

    // 绘制仪表盘
    requestAnimationFrame(() => drawSentimentGauge(data.score));

    // 更新涨跌停计数
    const ind = data.indicators;
    if (ind?.涨跌停) {
        const upEl = document.getElementById('limitUpCount');
        const downEl = document.getElementById('limitDownCount');
        if (upEl) upEl.textContent = ind.涨跌停.limit_up_count || 0;
        if (downEl) downEl.textContent = ind.涨跌停.limit_down_count || 0;
    }

    // 绑定指标卡点击事件
    bindCardClicks(data);
    // 绑定Tab切换事件
    bindLimitTabs();
    // 初始加载涨停列表
    loadLimitStocks('up');
    // 绘制ETF图表
    requestAnimationFrame(() => drawEtfChart(etfList));
    // 绑定ETF Tab
    bindEtfTabs();
}


// ==================== 指标卡点击展开详情 ====================

function bindCardClicks(data) {
    document.querySelectorAll('.clickable-card').forEach(card => {
        card.addEventListener('click', function () {
            const key = this.dataset.detailKey;
            toggleDetailPanel(key, data);
        });
    });
}

function toggleDetailPanel(key, data) {
    const panel = document.getElementById('sentimentDetailPanel');
    if (!panel) return;

    // 切换激活态
    document.querySelectorAll('.clickable-card').forEach(c => c.classList.remove('active'));

    // 同一张卡点击 = 收起
    if (currentDetailCard === key) {
        currentDetailCard = null;
        destroyDetailChart();
        panel.innerHTML = '';
        panel.classList.remove('show');
        return;
    }

    currentDetailCard = key;
    document.querySelector(`.clickable-card[data-detail-key="${key}"]`)?.classList.add('active');

    destroyDetailChart();
    panel.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载详情...</div>';
    panel.classList.add('show');

    // 根据类型渲染
    const renderers = {
        "成交量": () => renderVolumeDetail(panel, data),
        "板块涨跌": () => renderSectorDetail(panel, data),
        "赚钱效应": () => renderMoneyEffectDetail(panel, data),
        "涨跌停": () => renderLimitDetail(panel, data),
    };
    if (renderers[key]) renderers[key]();
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
    if (trend.length > 0) {
        const canvas = document.getElementById('volumeDetailChart');
        const labels = trend.map(t => t.date.slice(5)); // MM-DD
        const amounts = trend.map(t => t.amount);
        const avgLine = new Array(trend.length).fill(avg);
        const barColors = amounts.map(a => a >= avg ? 'rgba(231,76,60,0.7)' : 'rgba(39,174,96,0.7)');
        detailChartInstance = new Chart(canvas, {
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
        const r = await fetch('/api/market/sectors');
        sectors = await r.json();
    } catch (e) {
        panel.innerHTML = '<div class="detail-empty">板块数据加载失败</div>';
        return;
    }

    if (!sectors || !sectors.length) { panel.innerHTML = '<div class="detail-empty">暂无数据</div>'; return; }

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
        const sign = s.change_pct > 0 ? '+' : '';
        const leaderText = s.leader_name ? `<span class="sector-leader">领涨: ${s.leader_name}</span>` : '';
        const upDown = (s.up_count != null && s.down_count != null)
            ? `<span class="sector-updown"><span class="up">${s.up_count}涨</span>/<span class="down">${s.down_count}跌</span></span>`
            : '';
        html += `<div class="sector-detail-row">
            <span class="sector-detail-name">${s.name}</span>
            ${leaderText}
            ${upDown}
            <span class="sector-detail-change ${cls}">${sign}${fmtMoney(s.change_pct)}%</span>
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
    if (total > 0) {
        const canvas = document.getElementById('limitDoughnutChart');
        detailChartInstance = new Chart(canvas, {
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


// ==================== 涨跌停Tab切换 ====================

function bindLimitTabs() {
    document.querySelectorAll('.limit-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.limit-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            const dir = this.dataset.dir;
            currentLimitTab = dir;
            loadLimitStocks(dir);
        });
    });
}

async function loadLimitStocks(direction) {
    const listEl = document.getElementById('limitStocksList');
    if (!listEl) return;

    // 缓存命中
    if (limitDataCache[direction]) {
        renderLimitStocksList(listEl, limitDataCache[direction], direction);
        return;
    }

    listEl.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载中...</div>';

    try {
        const r = await fetch(`/api/market/sentiment/limits?direction=${direction}`);
        const data = await r.json();
        limitDataCache[direction] = data;
        renderLimitStocksList(listEl, data, direction);
    } catch (e) {
        listEl.innerHTML = '<div class="panel-loading" style="color:var(--up)">加载失败</div>';
    }
}

function renderLimitStocksList(container, stocks, direction) {
    if (!stocks || !stocks.length) {
        container.innerHTML = '<div class="limit-empty">暂无数据</div>';
        return;
    }

    let html = '';
    stocks.forEach(s => {
        const cls = direction === 'up' ? 'limit-stock-up' : 'limit-stock-down';
        html += `<div class="limit-stock-row ${cls}" data-code="${s.code}" data-name="${s.name}">
            <span class="limit-stock-name">${s.name}</span>
            <span class="limit-stock-code">${s.code}</span>
            <span class="limit-stock-price">${s.price}</span>
            <span class="limit-stock-change ${colorCls(s.change_pct)}">${fmtMoney(s.change_pct)}%</span>
            <span class="limit-stock-arrow">›</span>
        </div>`;
    });
    container.innerHTML = html;

    // 绑定点击事件：查看重仓基金
    container.querySelectorAll('.limit-stock-row').forEach(row => {
        row.addEventListener('click', () => {
            showStockFundsModal(row.dataset.code, row.dataset.name);
        });
    });
}


// ==================== 股票→基金弹窗 ====================

async function showStockFundsModal(stockCode, stockName) {
    // 创建或复用modal
    let modal = document.getElementById('stockFundsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stockFundsModal';
        modal.className = 'modal-mask';
        modal.innerHTML = `<div class="modal" style="max-width:520px;">
            <div class="modal-top"><h3 id="stockFundsTitle">重仓基金</h3><button class="modal-close" id="stockFundsClose">&times;</button></div>
            <div id="stockFundsBody"></div>
        </div>`;
        document.body.appendChild(modal);
        // 绑定关闭事件
        document.getElementById('stockFundsClose').addEventListener('click', () => {
            modal.classList.remove('show');
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    }

    document.getElementById('stockFundsTitle').textContent = `持有 ${stockName}(${stockCode}) 的基金`;
    document.getElementById('stockFundsBody').innerHTML = '<div class="panel-loading"><span class="spinner"></span>查询持有基金...</div>';
    modal.classList.add('show');

    try {
        const r = await fetch(`/api/market/sentiment/stock-funds?stock_code=${stockCode}`);
        const funds = await r.json();

        if (funds.error) {
            document.getElementById('stockFundsBody').innerHTML = `<div class="limit-empty">${funds.error}</div>`;
            return;
        }

        if (!funds || !funds.length) {
            document.getElementById('stockFundsBody').innerHTML = '<div class="limit-empty">暂未找到持有该股的基金</div>';
            return;
        }

        let html = '<div class="stock-funds-list">';
        funds.forEach(f => {
            const typeTag = f.fund_type ? `<span class="sf-type">${f.fund_type}</span>` : '';
            html += `<div class="sf-row" data-fund-code="${f.fund_code}" data-fund-name="${f.fund_name}">
                <div class="sf-info">
                    <div class="sf-name">${f.fund_name}</div>
                    <div class="sf-meta">
                        <span class="sf-code">${f.fund_code}</span>
                        ${typeTag}
                    </div>
                </div>
                <div class="sf-pct">${f.holding_pct ? f.holding_pct.toFixed(2) + '%' : '--'}</div>
                <button class="sf-add-btn" title="加入持仓">+</button>
            </div>`;
        });
        html += '</div>';
        document.getElementById('stockFundsBody').innerHTML = html;

        // 绑定"加入持仓"按钮
        document.querySelectorAll('.sf-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = btn.closest('.sf-row');
                const code = row.dataset.fundCode;
                const name = row.dataset.fundName;
                // 触发主页面的加入持仓弹窗
                if (window._addHoldingFromSentiment) {
                    window._addHoldingFromSentiment(code, name);
                } else {
                    showToast(`基金 ${name}(${code})，请在首页添加`);
                }
            });
        });

    } catch (e) {
        document.getElementById('stockFundsBody').innerHTML = '<div class="limit-empty" style="color:var(--up)">查询失败</div>';
    }
}


// ==================== ETF图表 ====================

function drawEtfChart(etfList) {
    if (!etfList || !etfList.length) return;
    const canvas = document.getElementById('etfInflowChart');
    if (!canvas) return;

    if (etfChartInstance) { etfChartInstance.destroy(); etfChartInstance = null; }

    const labels = etfList.map(e => e.name.length > 8 ? e.name.slice(0, 8) + '…' : e.name);
    const values = etfList.map(e => e.net_inflow);
    const barColors = values.map(v => v >= 0 ? 'rgba(231,76,60,0.75)' : 'rgba(39,174,96,0.75)');

    etfChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: '净流入(亿)', data: values, backgroundColor: barColors, borderRadius: 3, barPercentage: 0.6 }],
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: item => `${item.parsed.x > 0 ? '+' : ''}${item.parsed.x.toFixed(2)}亿` } },
            },
            scales: {
                x: { grid: { color: '#f0f0f0' }, ticks: { font: { size: 10 }, callback: v => v + '亿' } },
                y: { grid: { display: false }, ticks: { font: { size: 10 } } },
            },
        },
    });
}


// ==================== ETF Tab切换 ====================

let etfConsecutiveLoaded = false;

function bindEtfTabs() {
    document.querySelectorAll('.etf-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            const tabKey = this.dataset.etfTab;
            document.querySelectorAll('.etf-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.etf-tab-panel').forEach(p => p.classList.remove('show'));
            const target = tabKey === 'daily' ? document.getElementById('etfTabDaily') : document.getElementById('etfTabConsecutive');
            if (target) target.classList.add('show');
            if (tabKey === 'consecutive' && !etfConsecutiveLoaded) {
                loadEtfConsecutive(currentEtfConsecutiveDays);
            }
        });
    });

    document.querySelectorAll('.consecutive-filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const days = Number(this.dataset.days) || 7;
            if (days === currentEtfConsecutiveDays && etfConsecutiveCache[days]) return;
            currentEtfConsecutiveDays = days;
            document.querySelectorAll('.consecutive-filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            loadEtfConsecutive(days);
        });
    });
}

async function loadEtfConsecutive(days = currentEtfConsecutiveDays) {
    const panel = document.getElementById('etfConsecutiveContent');
    if (!panel) return;

    if (etfConsecutiveCache[days]) {
        renderEtfConsecutive(panel, etfConsecutiveCache[days]);
        etfConsecutiveLoaded = true;
        return;
    }

    const requestId = ++etfConsecutiveRequestId;
    panel.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载持续流入流出数据...</div>';

    try {
        const r = await fetch(`/api/market/sentiment/etf-consecutive?days=${days}`);
        const data = await r.json();
        if (requestId !== etfConsecutiveRequestId || days !== currentEtfConsecutiveDays) return;
        if (!r.ok) throw new Error(data.error || '加载失败');
        etfConsecutiveCache[days] = data;
        etfConsecutiveLoaded = true;
        renderEtfConsecutive(panel, data);
    } catch (e) {
        if (requestId !== etfConsecutiveRequestId || days !== currentEtfConsecutiveDays) return;
        panel.innerHTML = `<div class="panel-loading" style="color:var(--up)">${e.message || '加载失败'}</div>`;
    }
}

function renderEtfConsecutive(panel, data) {
    const days = data.days || currentEtfConsecutiveDays;
    const inflow = data.inflow || [];
    const outflow = data.outflow || [];

    if (!inflow.length && !outflow.length) {
        panel.innerHTML = `<div class="detail-empty">暂无连续${formatConsecutiveDays(days)}流入/流出数据</div>`;
        return;
    }

    let html = `<div class="consecutive-summary">筛选：连续${formatConsecutiveDays(days)}及以上</div>`;

    // 持续流入排行
    if (inflow.length > 0) {
        html += `<div class="consecutive-section">
            <div class="consecutive-title up">持续流入排行</div>`;
        inflow.forEach((etf, i) => {
            const rank = i < 3 ? "top3" : "";
            html += `<div class="consecutive-row">
                <span class="consecutive-rank ${rank}">${i + 1}</span>
                <span class="consecutive-name">${etf.name}</span>
                <span class="consecutive-code">${etf.code}</span>
                <span class="consecutive-days up">${etf.consecutive_days}天</span>
                <span class="consecutive-flow up">+${etf.total_flow}亿</span>
            </div>`;
        });
        html += `</div>`;
    }

    // 持续流出排行
    if (outflow.length > 0) {
        html += `<div class="consecutive-section">
            <div class="consecutive-title down">持续流出排行</div>`;
        outflow.forEach((etf, i) => {
            const rank = i < 3 ? "top3" : "";
            html += `<div class="consecutive-row">
                <span class="consecutive-rank ${rank}">${i + 1}</span>
                <span class="consecutive-name">${etf.name}</span>
                <span class="consecutive-code">${etf.code}</span>
                <span class="consecutive-days down">${etf.consecutive_days}天</span>
                <span class="consecutive-flow down">${etf.total_flow}亿</span>
            </div>`;
        });
        html += `</div>`;
    }

    panel.innerHTML = html;
}

function formatConsecutiveDays(days) {
    return ETF_CONSECUTIVE_DAY_OPTIONS.find(opt => opt.value === days)?.label || `${days}天`;
}


// ==================== Canvas仪表盘 ====================

function drawSentimentGauge(score) {
    const canvas = document.getElementById("sentimentGauge");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const cx = 100, cy = 100, r = 75, lw = 10;

    // 背景弧
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.strokeStyle = "#eee";
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.stroke();

    // 分段颜色
    const segments = [
        { end: 0.2, color: "#27ae60" },
        { end: 0.4, color: "#66bb6a" },
        { end: 0.6, color: "#f5a623" },
        { end: 0.8, color: "#ef5350" },
        { end: 1.0, color: "#e74c3c" },
    ];
    let prevEnd = Math.PI;
    segments.forEach(seg => {
        const angle = Math.PI + seg.end * Math.PI;
        ctx.beginPath();
        ctx.arc(cx, cy, r, prevEnd, angle, false);
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = lw;
        ctx.lineCap = "butt";
        ctx.stroke();
        prevEnd = angle;
    });

    // 指针
    const needleAngle = Math.PI + (score / 100) * Math.PI;
    const nx = cx + (r - 20) * Math.cos(needleAngle);
    const ny = cy + (r - 20) * Math.sin(needleAngle);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();

    // 中心圆
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#333";
    ctx.fill();
}


// ==================== Chart实例销毁 ====================

function destroyDetailChart() {
    if (detailChartInstance) {
        detailChartInstance.destroy();
        detailChartInstance = null;
    }
}


// ==================== CSS样式 ====================

export const SENTIMENT_CSS = `
.sentiment-page { display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }

/* 仪表盘卡片 */
.sentiment-gauge-card {
    background: var(--card); border-radius: var(--radius);
    padding: 16px 16px 12px; box-shadow: var(--shadow); text-align: center;
}
.sentiment-gauge-wrap { position: relative; width: 200px; height: 130px; margin: 0 auto 8px; }
.sentiment-gauge-wrap canvas { width: 200px !important; height: 130px !important; }
.sentiment-gauge-center {
    position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
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
.consecutive-filter { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
.consecutive-filter-btn {
    background: var(--bg); border: 1px solid var(--border); border-radius: 14px;
    padding: 4px 10px; font-size: 12px; cursor: pointer; color: var(--text2);
    transition: all .15s; font-weight: 500;
}
.consecutive-filter-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.consecutive-filter-btn:hover:not(.active) { border-color: var(--primary); }
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

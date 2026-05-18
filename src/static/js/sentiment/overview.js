import { fmtMoney, colorCls } from '../utils.js';
import { ETF_CONSECUTIVE_DAY_OPTIONS, sentimentState } from './state.js';
import { drawSentimentGauge, drawEtfChart } from './charts.js';
import { toggleDetailPanel } from './details.js';
import { bindEtfTabs } from './etf.js';
import { bindLimitTabs, loadLimitStocks } from './limit-stocks.js';

export function renderSentimentPage(container, data) {
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
            { key: "涨跌比", icon: "📊", cls: "clickable-card", clickable: true },
            { key: "涨跌停", icon: "📈", cls: "clickable-card", clickable: true },
            { key: "北向资金", icon: "💰", cls: "clickable-card", clickable: true },
            { key: "赚钱效应", icon: "🔥", cls: "clickable-card", clickable: true },
            { key: "板块涨跌", icon: "🏢", cls: "clickable-card", clickable: true },
            { key: "成交量", icon: "📦", cls: "clickable-card", clickable: true },
        ];

        cards.forEach(card => {
            const ind = data.indicators[card.key];
            if (!ind) return;
            let valueCls = "";
            if (card.key === "涨跌比") {
                const up = ind.up_count || 0;
                const down = ind.down_count || 0;
                if (up || down) {
                    valueCls = up > down ? "up" : down > up ? "down" : "flat";
                } else if (ind.up_ratio != null || ind.ratio != null) {
                    const ratio = ind.up_ratio ?? ind.ratio;
                    valueCls = ratio > 50 ? "up" : ratio < 50 ? "down" : "flat";
                }
            } else if (card.key === "北向资金" && ind.amount != null) {
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
            const activeCls = (card.clickable && sentimentState.currentDetailCard === card.key) ? ' active' : '';
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
    const limitInd = data.indicators?.涨跌停 || {};
    const limitUpdatedText = limitInd.updated_at ? `数据库更新：${String(limitInd.updated_at).slice(0, 16)}` : '等待后台刷新数据库';
    html += `<div class="analysis-section limit-stocks-section">
        <div class="section-title limit-stocks-header">
            <span>涨跌停个股</span>
            <div class="limit-tabs">
                <button class="limit-tab active" data-dir="up">涨停 <span id="limitUpCount" class="limit-count up">0</span></button>
                <button class="limit-tab" data-dir="down">跌停 <span id="limitDownCount" class="limit-count down">0</span></button>
            </div>
        </div>
        <div class="limit-data-meta">${limitUpdatedText}</div>
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
                ${ETF_CONSECUTIVE_DAY_OPTIONS.map(opt => `<button class="consecutive-filter-btn ${opt.value === sentimentState.currentEtfConsecutiveDays ? 'active' : ''}" data-days="${opt.value}">${opt.label}</button>`).join('')}
            </div>
            <div class="consecutive-flow-tabs">
                <button class="consecutive-flow-btn up ${sentimentState.currentEtfConsecutiveFlow === 'inflow' ? 'active' : ''}" data-flow="inflow">持续流入</button>
                <button class="consecutive-flow-btn down ${sentimentState.currentEtfConsecutiveFlow === 'outflow' ? 'active' : ''}" data-flow="outflow">持续流出</button>
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

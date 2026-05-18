import { fetchMarketSentiment } from './sentiment/api.js';
import { resetSentimentState } from './sentiment/state.js';
import { renderSentimentPage } from './sentiment/overview.js';
export { SENTIMENT_CSS } from './sentiment/styles.js';

export async function renderSentiment(container) {
    container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载市场情绪数据...</div>';

    try {
        const data = await fetchMarketSentiment();
        resetSentimentState();
        renderSentimentPage(container, normalizeSentimentData(data));
    } catch (e) {
        container.innerHTML = `<div class="panel-loading sentiment-load-error" style="color:var(--up)">${e.message || '加载失败，点击市场情绪可重试'}</div>`;
    }
}

function normalizeSentimentData(data) {
    const safeData = data && typeof data === 'object' ? data : {};
    const indicators = safeData.indicators && typeof safeData.indicators === 'object' ? safeData.indicators : {};
    return {
        score: Number.isFinite(Number(safeData.score)) ? Number(safeData.score) : 50,
        label: safeData.label || '中性',
        emoji: safeData.emoji || '😐',
        advice: safeData.advice || '暂无完整市场情绪数据，可稍后刷新重试',
        indicators: {
            "涨跌比": {
                value: '暂无数据',
                up_count: 0,
                down_count: 0,
                flat_count: 0,
                total_count: 0,
                up_ratio: null,
                down_ratio: null,
                ratio: null,
                ...indicators["涨跌比"],
            },
            "涨跌停": { value: '涨停0/跌停0', limit_up_count: 0, limit_down_count: 0, ...indicators["涨跌停"] },
            "北向资金": { value: '暂无数据', amount: null, ...indicators["北向资金"] },
            "赚钱效应": { value: '暂无数据', avg_up: 0, avg_down: 0, ...indicators["赚钱效应"] },
            "板块涨跌": { value: '暂无数据', up_count: 0, down_count: 0, flat_count: 0, ...indicators["板块涨跌"] },
            "成交量": { value: '暂无数据', amount: 0, avg_amount: 0, trend: [], ...indicators["成交量"] },
            etf_list: Array.isArray(indicators.etf_list) ? indicators.etf_list : [],
        },
        updated_at: safeData.updated_at || '暂无更新时间',
    };
}

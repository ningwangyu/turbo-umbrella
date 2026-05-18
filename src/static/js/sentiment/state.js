// 市场情绪模块内状态，避免污染全局 state.js。
export const ETF_CONSECUTIVE_DAY_OPTIONS = [
    { value: 1, label: '1天' },
    { value: 3, label: '3天' },
    { value: 7, label: '7天' },
    { value: 15, label: '半个月' },
    { value: 30, label: '一个月' },
];

export const sentimentState = {
    currentLimitTab: 'up',
    limitDataCache: { up: null, down: null },
    currentDetailCard: null,
    detailChartInstance: null,
    etfChartInstance: null,
    currentEtfConsecutiveDays: 7,
    currentEtfConsecutiveFlow: 'inflow',
    etfConsecutiveCache: {},
    etfConsecutiveRequestId: 0,
    etfConsecutiveLoaded: false,
};

export function resetSentimentState() {
    sentimentState.currentLimitTab = 'up';
    sentimentState.limitDataCache = { up: null, down: null };
    sentimentState.currentDetailCard = null;
    sentimentState.etfConsecutiveLoaded = false;
    sentimentState.currentEtfConsecutiveDays = 7;
    sentimentState.currentEtfConsecutiveFlow = 'inflow';
    sentimentState.etfConsecutiveCache = {};
    sentimentState.etfConsecutiveRequestId = 0;
}

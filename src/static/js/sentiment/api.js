// 市场情绪 API 请求封装。
export async function fetchMarketSentiment() {
    return fetchJson("/api/market/sentiment");
}

export async function fetchLimitStocks(direction) {
    return fetchJson(`/api/market/sentiment/limits?direction=${direction}`);
}

export async function fetchStockFunds(stockCode) {
    return fetchJson(`/api/market/sentiment/stock-funds?stock_code=${stockCode}`);
}

export async function fetchEtfConsecutive(days) {
    return fetchJson(`/api/market/sentiment/etf-consecutive?days=${days}`);
}

export async function fetchMarketSectors() {
    return fetchJson('/api/market/sectors');
}

async function fetchJson(url) {
    const response = await fetch(url);
    let data;
    try {
        data = await response.json();
    } catch (e) {
        throw new Error(`HTTP ${response.status}`);
    }
    if (!response.ok || data?.error) {
        throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data;
}

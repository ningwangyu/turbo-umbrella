/** 基金对比 API 模块 — 批量拉取估值、走势和信号数据，供对比页统一消费。 */
import { compareState } from './state.js';
import { fundDataCache, setFundDataCache, setSignalCache } from '../state.js';

async function fetchJson(url, required = true) {
    const resp = await fetch(url);
    let data = null;

    try {
        data = await resp.json();
    } catch (e) {
        if (required) throw new Error(`Invalid JSON from ${url}`);
        console.warn(`Compare optional fetch ${url}:`, e);
        return null;
    }

    if (!resp.ok || data?.error) {
        const message = data?.error || `HTTP ${resp.status}`;
        if (required) throw new Error(message);
        console.warn(`Compare optional fetch ${url}:`, message);
        return null;
    }

    return data;
}

export async function fetchCompareData(codes) {
    compareState.compareData = {};
    const promises = codes.map(async code => {
        try {
            const [perf, est] = await Promise.all([
                fetchJson(`/api/fund/performance/${code}`),
                fetchJson(`/api/fund/${code}`),
            ]);

            compareState.compareData[code] = { perf, est, holdings: [] };

            const [holdData, sigData] = await Promise.all([
                fetchJson(`/api/fund/holdings/${code}`, false),
                fetchJson(`/api/fund/signal/${code}`, false),
            ]);

            compareState.compareData[code].holdings = holdData?.holdings || [];

            if (sigData && !sigData.error) {
                setSignalCache(code, sigData);
            }

            if (est?.name && !fundDataCache[code]?.name) {
                setFundDataCache(code, { ...(fundDataCache[code] || {}), name: est.name });
            }
        } catch (e) {
            console.error(`Compare fetch ${code}:`, e);
        }
    });
    await Promise.all(promises);
    return compareState.compareData;
}

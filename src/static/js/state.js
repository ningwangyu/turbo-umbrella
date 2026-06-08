/**
 * 共享状态管理模块 — 所有前端功能共用的可变状态、MySQL 持仓同步和 DOM 缓存。
 *
 * 设计边界：业务数据以服务端 MySQL 为准，localStorage 只作为旧版本迁移来源；
 * 所有状态修改通过 setter 暴露，避免不同模块直接重建引用导致渲染不同步。
 */

export const STORAGE_KEY = "fund_holdings";

// ===== 可变共享状态 =====
export let holdings = loadLegacyHoldings();
export let fundDataCache = {};
export let signalCache = {};
export let refreshTimer = null;
export let searchDebounce = null;
export let chartInstances = {};
export let alertList = [];
export let metalPricesCache = {};
export let allRecommendData = [];
export let recMeta = null;
export let pendingImport = [];
export let uploadedImageBase64 = null;
export let metalChart = null;
export let detailChartInstance = null;
export let aiChatHistory = [];
export let aiChatStreaming = false;
export let aiPendingImage = null;

// ===== 状态修改器 =====
export function setHoldings(val) { holdings = val; }
export function setFundDataCache(code, data) { fundDataCache[code] = data; }
export function setSignalCache(code, data) { signalCache[code] = data; }
export function deleteFundCache(code) { delete fundDataCache[code]; delete signalCache[code]; if (chartInstances[code]) { chartInstances[code].destroy(); delete chartInstances[code]; } }
export function setAlertList(val) { alertList = val; }
export function setMetalPricesCache(val) { metalPricesCache = val; }
export function setMetalChart(val) { metalChart = val; }
export function setDetailChartInstance(val) { detailChartInstance = val; }
export function setAllRecommendData(val) { allRecommendData = val; }
export function setRecMeta(val) { recMeta = val; }
export function setPendingImport(val) { pendingImport = val; }
export function setUploadedImageBase64(val) { uploadedImageBase64 = val; }
export function setSearchDebounce(val) { searchDebounce = val; }
export function setRefreshTimer(val) { refreshTimer = val; }
export function getMetalChart() { return metalChart; }
export function getDetailChartInstance() { return detailChartInstance; }
export function getPendingImport() { return pendingImport; }
export function getUploadedImagBase64() { return uploadedImageBase64; }
export function getAiPendingImage() { return aiPendingImage; }
export function getAiChatHistory() { return aiChatHistory; }
export function getAiChatStreaming() { return aiChatStreaming; }
export function setAiChatHistory(val) { aiChatHistory = val; }
export function setAiChatStreaming(val) { aiChatStreaming = val; }
export function setAiPendingImage(val) { aiPendingImage = val; }

// ===== MySQL持仓同步 =====
function loadLegacyHoldings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
}

async function requestHoldings(url, options = {}) {
    const r = await fetch(url, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    if (!r.ok || (data && data.error)) {
        throw new Error(data?.error || `持仓请求失败(${r.status})`);
    }
    return data;
}

function normalizeHoldings(items) {
    return (items || [])
        .filter(h => /^\d{6}$/.test(String(h.code || "")))
        .map(h => {
            const item = {
                code: String(h.code),
                value: parseFloat(h.value) || 0,
                profit: parseFloat(h.profit) || 0,
            };
            if (h.name) item.name = h.name;
            if (h.fund_type || h.type) item.fund_type = h.fund_type || h.type;
            if (h.source) item.source = h.source;
            if (h.metadata) item.metadata = h.metadata;
            return item;
        });
}

export async function loadHoldingsFromServer() {
    const serverHoldings = normalizeHoldings(await requestHoldings("/api/holdings"));
    const legacyHoldings = normalizeHoldings(loadLegacyHoldings());

    // 只要当前浏览器还有旧 localStorage 持仓，就合并迁移到 MySQL。
    // 同代码以浏览器旧数据为准，避免用户最近在该浏览器里添加的数据被忽略。
    if (legacyHoldings.length) {
        const mergedMap = new Map();
        serverHoldings.forEach(item => mergedMap.set(item.code, item));
        legacyHoldings.forEach(item => mergedMap.set(item.code, { ...item, source: item.source || "browser_migration" }));
        const migrated = await replaceHoldingsOnServer([...mergedMap.values()]);
        localStorage.removeItem(STORAGE_KEY);
        return migrated;
    }

    setHoldings(serverHoldings);
    return holdings;
}

export async function saveHoldingToServer(item) {
    const saved = await requestHoldings("/api/holdings", {
        method: "POST",
        body: JSON.stringify(item),
    });
    const next = holdings.filter(h => h.code !== saved.code);
    next.push(saved);
    setHoldings(next);
    localStorage.removeItem(STORAGE_KEY);
    return saved;
}

export async function replaceHoldingsOnServer(items) {
    const saved = normalizeHoldings(await requestHoldings("/api/holdings", {
        method: "PUT",
        body: JSON.stringify({ holdings: normalizeHoldings(items) }),
    }));
    setHoldings(saved);
    localStorage.removeItem(STORAGE_KEY);
    return holdings;
}

export async function deleteHoldingFromServer(code) {
    await requestHoldings(`/api/holdings/${encodeURIComponent(code)}`, { method: "DELETE" });
    setHoldings(holdings.filter(h => h.code !== code));
    localStorage.removeItem(STORAGE_KEY);
}

// 兼容旧调用：后端保存失败时不再写浏览器存储，避免产生双数据源。
export function saveHoldings() {}

// ===== DOM缓存 =====
export const $ = (sel) => document.getElementById(sel);

// DOM引用（module执行时DOM已就绪，因为type="module"默认defer）
export const $fundCode = $("fundCode");
export const $holdingValue = $("holdingValue");
export const $holdingProfit = $("holdingProfit");
export const $btnAdd = $("btnAdd");
export const $btnImport = $("btnImport");
export const $fundList = $("fundList");
export const $emptyState = $("emptyState");
export const $totalAssets = $("totalAssets");
export const $totalProfit = $("totalProfit");
export const $todayEarnings = $("todayEarnings");
export const $todayLabel = $("todayLabel");
export const $fundCount = $("fundCount");
export const $profitRate = $("profitRate");
export const $updateTime = $("updateTime");
export const $autocomplete = $("autocompleteList");
export const $toast = $("toast");
export const $importModal = $("importModal");
export const $modalClose = $("modalClose");
export const $importText = $("importText");
export const $btnParseText = $("btnParseText");
export const $btnParseImage = $("btnParseImage");
export const $imageInput = $("imageInput");
export const $previewImage = $("previewImage");
export const $importResults = $("importResults");
export const $importList = $("importList");
export const $btnConfirmImport = $("btnConfirmImport");
export const $uploadZone = $("uploadZone");
export const $recommendList = $("recommendList");
export const $metalsList = $("metalsList");
export const $sectorList = $("sectorList");
export const $addHoldingModal = $("addHoldingModal");
export const $addHoldingClose = $("addHoldingClose");
export const $addHoldingCode = $("addHoldingCode");
export const $addHoldingName = $("addHoldingName");
export const $addHoldingValue = $("addHoldingValue");
export const $addHoldingProfit = $("addHoldingProfit");
export const $btnConfirmAddHolding = $("btnConfirmAddHolding");
export const $alertCode = $("alertCode");
export const $alertAutocomplete = $("alertAutocompleteList");
export const $alertCondition = $("alertCondition");
export const $alertThreshold = $("alertThreshold");
export const $btnAddAlert = $("btnAddAlert");
export const $alertListEl = $("alertList");
export const $indexModal = $("indexModal");
export const $indexModalTitle = $("indexModalTitle");
export const $indexModalBody = $("indexModalBody");
export const $indexModalClose = $("indexModalClose");
export const $metalModal = $("metalModal");
export const $metalModalTitle = $("metalModalTitle");
export const $metalModalBody = $("metalModalBody");
export const $metalModalClose = $("metalModalClose");
export const $fundDetailModal = $("fundDetailModal");
export const $fundDetailTitle = $("fundDetailTitle");
export const $fundDetailBody = $("fundDetailBody");
export const $fundDetailClose = $("fundDetailClose");
export const $aiFloatBtn = $("aiFloatBtn");
export const $aiChatPanel = $("aiChatPanel");
export const $aiChatMessages = $("aiChatMessages");
export const $aiChatInput = $("aiChatInput");
export const $aiChatSend = $("aiChatSend");
export const $aiChatClose = $("aiChatClose");
export const $aiChatClear = $("aiChatClear");
export const $aiChatImgInput = $("aiChatImgInput");
export const $recFilter = $("recFilter");

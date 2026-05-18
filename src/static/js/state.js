/**
 * 共享状态管理模块 — 所有模块共享的可变状态 + localStorage + DOM缓存
 */

export const STORAGE_KEY = "fund_holdings";

// ===== 可变共享状态 =====
export let holdings = loadHoldings();
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

// ===== State Mutators =====
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

// ===== localStorage =====
function loadHoldings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
}
export function saveHoldings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
}

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

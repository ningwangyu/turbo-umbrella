/**
 * 基金收益预测助手 V4 — 入口模块
 *
 * 导入所有功能模块，绑定全局事件，启动初始化流程
 */
import {
    holdings, searchDebounce, refreshTimer, signalCache,
    $fundCode, $holdingValue, $holdingProfit, $btnAdd, $autocomplete,
    saveHoldingToServer, loadHoldingsFromServer, fundDataCache, setSearchDebounce
} from './state.js';
import { showToast } from './utils.js';
import { renderFundList, renderSummary, fetchFundData, fetchAllFundData, fetchAllSignals, initFundDetailModal, updateMarketStatus } from './fund-card.js';
import { fetchMarketIndex, initIndexModal } from './market.js';
import { fetchMetalPrices, initMetalModal } from './metals.js';
import { fetchSectors } from './sectors.js';
import { fetchRecommendations, initRecommendModule, openAddHoldingModal } from './recommend.js';
import { fetchAlerts, checkAlerts, initAlerts } from './alerts.js';
import { initImportModal } from './import-modal.js';
import { initAIChat } from './ai-chat.js';
import { fetchPortfolioAnalysis, renderPortfolioAnalysis, PORTFOLIO_CSS } from './portfolio-analysis.js';
import { renderFundCompare, fetchCompareData, COMPARE_CSS } from './fund-compare.js';
import { renderBacktest, BACKTEST_CSS } from './backtest.js';
import { renderSentiment, SENTIMENT_CSS } from './sentiment.js';
import { renderDataExport, EXPORT_CSS } from './data-export.js';
import { renderMorningReport, REPORT_CSS } from './morning-report.js';
import { renderDashboard, DASHBOARD_CSS } from './dashboard.js';
import { renderRiskAnalysis, RISK_ANALYSIS_CSS } from './risk-analysis.js';

// ==================== 基金搜索自动补全 ====================
async function searchFunds(q) {
    if (!q || q.length < 1) { $autocomplete.classList.remove("show"); return; }
    try {
        const r = await fetch(`/api/fund/search?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if (!data.length) { $autocomplete.classList.remove("show"); return; }
        $autocomplete.innerHTML = data.map(f => `<div class="ac-item" data-code="${f.code}"><span class="ac-code">${f.code}</span><span class="ac-name">${f.name}</span><span class="ac-type">${f.type}</span></div>`).join("");
        $autocomplete.classList.add("show");
        $autocomplete.querySelectorAll(".ac-item").forEach(item => {
            item.addEventListener("click", function () {
                $fundCode.value = this.dataset.code;
                $autocomplete.classList.remove("show");
                $holdingValue.focus();
            });
        });
    } catch (e) { console.error("Search:", e); }
}

// ==================== 添加基金 ====================
async function addFund() {
    const code = $fundCode.value.trim(), value = $holdingValue.value.trim(), profit = $holdingProfit.value.trim();
    if (!code || !/^\d{6}$/.test(code)) { showToast("请输入6位基金代码"); return; }
    if (!value || +value <= 0) { showToast("请输入持有金额"); return; }
    if (holdings.some(h => h.code === code)) { showToast("该基金已存在"); return; }
    $btnAdd.disabled = true; $btnAdd.textContent = "...";
    try {
        const fd = await fetchFundData(code);
        if (!fd) { showToast("无法获取基金数据"); return; }
        await saveHoldingToServer({ code, value: +value || 0, profit: +profit || 0 });
        fundDataCache[code] = fd;
        $fundCode.value = ""; $holdingValue.value = ""; $holdingProfit.value = "";
        renderFundList(); renderSummary(); showToast(`已添加 ${fd.name}`);
        fetchSignal(code);
    } catch (e) {
        showToast(e.message || "保存持仓失败");
    } finally {
        $btnAdd.disabled = false; $btnAdd.textContent = "添加";
    }
}

async function fetchSignal(code) {
    try { const r = await fetch(`/api/fund/signal/${code}`); const data = await r.json(); if (!data.error) { signalCache[code] = data; renderFundList(); renderSummary(); } } catch (e) { console.error("Signal:", e); }
}

// ==================== 自动刷新 ====================
function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    // refreshTimer is read-only from state, but we set interval directly
    setInterval(() => {
        updateMarketStatus(); fetchAllFundData(); fetchMarketIndex(); fetchMetalPrices(); checkAlerts(); fetchSectors();
    }, 60000);
}

// ==================== 事件绑定 ====================
function bindEvents() {
    // 添加基金
    $btnAdd.addEventListener("click", addFund);
    $fundCode.addEventListener("input", function () {
        clearTimeout(searchDebounce);
        setSearchDebounce(setTimeout(() => searchFunds(this.value.trim()), 300));
    });
    $fundCode.addEventListener("blur", () => setTimeout(() => $autocomplete.classList.remove("show"), 200));
    $holdingProfit.addEventListener("keydown", e => { if (e.key === "Enter") addFund(); });
    $holdingValue.addEventListener("keydown", e => { if (e.key === "Enter") $holdingProfit.focus(); });
    $fundCode.addEventListener("keydown", e => { if (e.key === "Enter") $holdingValue.focus(); });
}

// ==================== 注入模块CSS ====================
function injectModuleCSS() {
    const style = document.createElement("style");
    style.textContent = PORTFOLIO_CSS + COMPARE_CSS + BACKTEST_CSS + SENTIMENT_CSS + EXPORT_CSS + REPORT_CSS + DASHBOARD_CSS + RISK_ANALYSIS_CSS;
    document.head.appendChild(style);
}

// ==================== 视图切换 ====================
function initNavTabs() {
    const tabs = document.querySelectorAll(".nav-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", async function () {
            const view = this.dataset.view;
            // 切换Tab样式
            tabs.forEach(t => t.classList.remove("active"));
            this.classList.add("active");
            // 切换视图显示
            document.querySelectorAll(".view-container").forEach(v => {
                v.classList.remove("active");
                v.style.display = "none";
            });
            const target = document.getElementById(`view-${view}`);
            if (target) {
                target.classList.add("active");
                target.style.display = "block";
            }
            // 懒加载数据
            if (view === "analysis") {
                const container = document.getElementById("analysisContent");
                if (container && !container.hasChildNodes()) {
                    container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载分析数据...</div>';
                    await fetchPortfolioAnalysis();
                    renderPortfolioAnalysis(container);
                }
            } else if (view === "compare") {
                const container = document.getElementById("compareContent");
                if (container) {
                    renderFundCompare(container);
                }
            } else if (view === "backtest") {
                const container = document.getElementById("backtestContent");
                if (container && !container.hasChildNodes()) {
                    renderBacktest(container);
                }
            } else if (view === "sentiment") {
                const container = document.getElementById("sentimentContent");
                const firstChild = container?.firstElementChild;
                const shouldLoad = container && (
                    !container.hasChildNodes()
                    || firstChild?.classList.contains('sentiment-load-error')
                    || (firstChild?.classList.contains('panel-loading') && !container.querySelector('.sentiment-page'))
                );
                if (shouldLoad) {
                    renderSentiment(container);
                }
            } else if (view === "report") {
                const container = document.getElementById("reportContent");
                if (container && !container.hasChildNodes()) {
                    renderMorningReport(container);
                }
            } else if (view === "export") {
                const container = document.getElementById("exportContent");
                if (container && !container.hasChildNodes()) {
                    renderDataExport(container);
                }
            } else if (view === "dashboard") {
                const container = document.getElementById("dashboardContent");
                if (container && !container.hasChildNodes()) {
                    container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载驾驶舱...</div>';
                    renderDashboard(container);
                }
            } else if (view === "risk") {
                const container = document.getElementById("riskContent");
                if (container && !container.hasChildNodes()) {
                    container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载风险分析...</div>';
                    renderRiskAnalysis(container);
                }
            }
        });
    });
}

// ==================== 深色模式切换 ====================
function initTheme() {
    const toggle = document.getElementById("themeToggle");
    const saved = localStorage.getItem("theme");
    if (saved) {
        document.documentElement.setAttribute("data-theme", saved);
        if (toggle) toggle.textContent = saved === "dark" ? "☀️" : "🌙";
    }
    if (toggle) {
        toggle.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme");
            const next = current === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", next);
            localStorage.setItem("theme", next);
            toggle.textContent = next === "dark" ? "☀️" : "🌙";
        });
    }
}

// ==================== 初始化 ====================
async function init() {
    // 初始化主题和注入CSS
    initTheme();
    injectModuleCSS();
    initNavTabs();

    // 全局桥接：市场情绪页面 → 加入持仓弹窗
    window._addHoldingFromSentiment = function(code, name) {
        openAddHoldingModal(code, name);
    };

    // 初始化所有模块的事件监听
    initIndexModal();
    initMetalModal();
    initRecommendModule();
    initAlerts();
    initImportModal();
    initAIChat();
    initFundDetailModal();
    bindEvents();

    // 初始状态：先从 MySQL 读取持仓；若数据库为空且浏览器有旧数据，会自动迁移。
    try {
        await loadHoldingsFromServer();
    } catch (e) {
        showToast(e.message || "加载持仓失败");
    }
    updateMarketStatus();
    setInterval(updateMarketStatus, 60000);
    renderFundList();

    // 加载数据
    await fetchAllFundData();
    await fetchAllSignals();
    renderFundList();
    renderSummary();
    startAutoRefresh();

    // 并行加载各模块数据
    fetchRecommendations();
    fetchMetalPrices();
    fetchMarketIndex();
    fetchAlerts();
    fetchSectors();

    // 各模块独立刷新
    setInterval(fetchMetalPrices, 60000);
    setInterval(fetchMarketIndex, 30000);
    setInterval(checkAlerts, 60000);
    setInterval(fetchSectors, 120000);
}

init();

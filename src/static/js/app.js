/**
 * 基金收益预测助手 V2 — 前端入口模块
 *
 * 初始化顺序：先恢复主题和注入功能样式，再绑定 Tab 懒加载与模块事件，最后加载持仓、估值和信号数据。
 * 这样可以保证首屏尽快可交互，组合分析、回测、情绪等重模块只在用户切换到对应视图时渲染。
 */
import {
    holdings, searchDebounce, refreshTimer, signalCache,
    $fundCode, $holdingValue, $holdingProfit, $btnAdd, $autocomplete,
    saveHoldingToServer, loadHoldingsFromServer, fundDataCache, setSearchDebounce, setRefreshTimer
} from './state.js';
import { showToast } from './utils.js';
import { renderFundList, renderSummary, fetchFundData, fetchAllFundData, fetchAllSignals, initFundDetailModal, updateMarketStatus } from './fund-card.js';
import { fetchMarketIndex, applyMarketIndex, initIndexModal } from './market.js';
import { fetchMetalPrices, applyMetalPrices, initMetalModal, restoreMetalPricesFromCache } from './metals.js';
import { fetchSectors, applySectors, restoreSectorsFromCache } from './sectors.js';
import { fetchRecommendations, initRecommendModule, openAddHoldingModal } from './recommend.js';
import { fetchAlerts, checkAlerts, initAlerts } from './alerts.js';
import { initImportModal } from './import-modal.js';
import { initAIChat } from './ai-chat.js';


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
function isTradeTime() {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) return false; // 周末
    const hhmm = now.getHours() * 100 + now.getMinutes();
    return (hhmm >= 925 && hhmm <= 1131) || (hhmm >= 1255 && hhmm <= 1501);
}

let _sectorsRefreshTimer = null;
let _metalsRefreshTimer = null;

function jitteredInterval(baseMs) {
    return baseMs + Math.floor(Math.random() * baseMs * 0.15);
}

function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    setRefreshTimer(setInterval(() => {
        updateMarketStatus(); fetchAllFundData(); checkAlerts();
    }, 60000));

    // 市场指数 30s 刷新
    setInterval(() => { fetchMarketIndex(); }, 30000);

    // 行情数据按交易时段智能刷新（带抖动避免惊群）
    if (_sectorsRefreshTimer) clearInterval(_sectorsRefreshTimer);
    _sectorsRefreshTimer = setInterval(() => {
        if (isTradeTime() || !document.hidden) fetchSectors();
    }, jitteredInterval(130000));

    if (_metalsRefreshTimer) clearInterval(_metalsRefreshTimer);
    _metalsRefreshTimer = setInterval(() => {
        if (isTradeTime() || !document.hidden) fetchMetalPrices();
    }, jitteredInterval(65000));
}

// 页面可见性变化时：恢复可见立即刷新行情
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        fetchSectors();
        fetchMetalPrices();
    }
});

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
    document.head.appendChild(style);
    return {
        add(css) {
            if (css && !style.textContent.includes(css.slice(0, 80))) {
                style.textContent += css;
            }
        }
    };
}

let moduleCSS;

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
            // 重数据视图采用首次进入时懒加载，减少首页初始化时的接口并发和图表创建成本。
            if (view === "analysis") {
                const { fetchPortfolioAnalysis, renderPortfolioAnalysis, PORTFOLIO_CSS } = await import('./portfolio-analysis.js');
                moduleCSS.add(PORTFOLIO_CSS);
                const container = document.getElementById("analysisContent");
                if (container && !container.hasChildNodes()) {
                    container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载分析数据...</div>';
                    await fetchPortfolioAnalysis();
                    renderPortfolioAnalysis(container);
                }
            } else if (view === "compare") {
                const { renderFundCompare, COMPARE_CSS } = await import('./fund-compare.js');
                moduleCSS.add(COMPARE_CSS);
                const container = document.getElementById("compareContent");
                if (container) {
                    renderFundCompare(container);
                }
            } else if (view === "backtest") {
                const { renderBacktest, BACKTEST_CSS } = await import('./backtest.js');
                moduleCSS.add(BACKTEST_CSS);
                const container = document.getElementById("backtestContent");
                if (container && !container.hasChildNodes()) {
                    renderBacktest(container);
                }
            } else if (view === "sentiment") {
                const { renderSentiment, SENTIMENT_CSS } = await import('./sentiment.js');
                moduleCSS.add(SENTIMENT_CSS);
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
                const { renderMorningReport, REPORT_CSS } = await import('./morning-report.js');
                moduleCSS.add(REPORT_CSS);
                const container = document.getElementById("reportContent");
                if (container && !container.hasChildNodes()) {
                    renderMorningReport(container);
                }
            } else if (view === "export") {
                const { renderDataExport, EXPORT_CSS } = await import('./data-export.js');
                moduleCSS.add(EXPORT_CSS);
                const container = document.getElementById("exportContent");
                if (container && !container.hasChildNodes()) {
                    renderDataExport(container);
                }
            } else if (view === "dashboard") {
                const { renderDashboard, DASHBOARD_CSS } = await import('./dashboard.js');
                moduleCSS.add(DASHBOARD_CSS);
                const container = document.getElementById("dashboardContent");
                if (container && !container.hasChildNodes()) {
                    container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载驾驶舱...</div>';
                    renderDashboard(container);
                }
            } else if (view === "risk") {
                const { renderRiskAnalysis, RISK_ANALYSIS_CSS } = await import('./risk-analysis.js');
                moduleCSS.add(RISK_ANALYSIS_CSS);
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
    moduleCSS = injectModuleCSS();
    initNavTabs();

    // 全局桥接只暴露最小入口，避免情绪子模块直接依赖推荐弹窗内部实现。
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
    renderFundList();

    fetchRecommendations();
    fetchAlerts();

    // 从 localStorage 秒渲染，再后台批量 fetch 更新
    restoreMetalPricesFromCache();
    restoreSectorsFromCache();
    fetch("/api/market/dashboard-prefetch").then(r => r.json()).then(data => {
        if (data.sectors) applySectors(data.sectors);
        if (data.metals && !data.metals.error) applyMetalPrices(data.metals);
        if (data.index) applyMarketIndex(data.index);
    }).catch(() => {
        fetchMetalPrices();
        fetchMarketIndex();
        fetchSectors();
    });

    // 加载持仓相关数据；信号后台并发加载，避免阻塞首屏收益和行情卡片。
    await fetchAllFundData();
    fetchAllSignals().catch(e => console.error("Signals:", e));
    setTimeout(startAutoRefresh, Math.floor(Math.random() * 10000));
}

init();

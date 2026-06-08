/**
 * 贵金属行情模块 — 价格获取/渲染 + 趋势弹窗（带 localStorage 持久化 + ETag 条件请求）
 */
import { $metalsList, $metalModal, $metalModalTitle, $metalModalBody, $metalModalClose, metalPricesCache, setMetalPricesCache, setMetalChart, getMetalChart } from './state.js';
import { colorCls, fmtMoney } from './utils.js';

const LS_PRICES_KEY = "dashboard_metal_prices";
const LS_PRICES_TTL = 90 * 1000; // localStorage 缓存 90s（1.5x 后端 TTL）
const METAL_TREND_TTL = 5 * 60 * 1000;
const metalTrendCache = new Map();
const metalTrendInflight = new Map();
let metalTrendWarmupTimer = null;
let metalTrendLoadSeq = 0;
let pricesLastEtag = "";

// ---- localStorage: 贵金属价格 ----
function loadPersistedPrices() {
    try {
        const raw = localStorage.getItem(LS_PRICES_KEY);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (Date.now() - entry.ts > LS_PRICES_TTL) return null;
        pricesLastEtag = entry.etag || "";
        return entry.data;
    } catch { return null; }
}

function persistPrices(data, etag) {
    try {
        localStorage.setItem(LS_PRICES_KEY, JSON.stringify({ data, etag: etag || "", ts: Date.now() }));
    } catch { /* quota exceeded */ }
}

// ---- localStorage: 贵金属趋势 ----
function loadPersistedTrend(key) {
    try {
        const raw = localStorage.getItem(`dashboard_metal_trend_${key}`);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (Date.now() - entry.ts > METAL_TREND_TTL) return null;
        return entry.data;
    } catch { return null; }
}

function persistTrend(key, data) {
    try {
        localStorage.setItem(`dashboard_metal_trend_${key}`, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* quota exceeded */ }
}

// ---- 首屏快速渲染 ----
export function restoreMetalPricesFromCache() {
    const cached = loadPersistedPrices();
    if (cached && Object.keys(cached).length) {
        setMetalPricesCache(cached);
        renderMetalPrices(cached);
        return true;
    }
    return false;
}

export function applyMetalPrices(data) {
    if (!data || data.error) return;
    setMetalPricesCache(data);
    renderMetalPrices(data);
    scheduleMetalTrendWarmup();
}

function trendCacheKey(metalKey, period) {
    return `${metalKey}:${period}`;
}

async function fetchMetalTrendData(metalKey, period) {
    const key = trendCacheKey(metalKey, period);
    const cached = metalTrendCache.get(key);
    if (cached && Date.now() - cached.ts < METAL_TREND_TTL) return cached.data;
    if (metalTrendInflight.has(key)) return metalTrendInflight.get(key);

    // 尝试从 localStorage 恢复
    const lsCached = loadPersistedTrend(key);
    if (lsCached) {
        metalTrendCache.set(key, { data: lsCached, ts: Date.now() });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const req = fetch(`/api/price/metals/trend?metal=${metalKey}&period=${period}`, { signal: controller.signal })
        .then(async r => {
            if (r.status === 304 && lsCached) return lsCached;
            const data = await r.json();
            if (!r.ok || data?.error || !data?.trend?.length) throw new Error(data?.error || `HTTP ${r.status}`);
            metalTrendCache.set(key, { data, ts: Date.now() });
            persistTrend(key, data);
            return data;
        })
        .finally(() => {
            clearTimeout(timer);
            metalTrendInflight.delete(key);
        });
    metalTrendInflight.set(key, req);
    return req;
}

function scheduleMetalTrendWarmup() {
    const key = trendCacheKey("gold", "1m");
    if (metalTrendCache.has(key) || metalTrendInflight.has(key) || metalTrendWarmupTimer) return;
    const run = () => {
        metalTrendWarmupTimer = null;
        fetchMetalTrendData("gold", "1m").catch(e => console.debug("Metal trend warmup:", e));
    };
    if (window.requestIdleCallback) {
        metalTrendWarmupTimer = window.requestIdleCallback(run, { timeout: 8000 });
    } else {
        metalTrendWarmupTimer = setTimeout(run, 5000);
    }
}

export function warmupMetalTrends() {
    scheduleMetalTrendWarmup();
}

export async function fetchMetalPrices() {
    if (!$metalsList) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
        const headers = {};
        if (pricesLastEtag) headers["If-None-Match"] = pricesLastEtag;
        const r = await fetch("/api/price/metals", { signal: controller.signal, headers });
        if (r.status === 304) {
            const cur = metalPricesCache; if (cur && Object.keys(cur).length) persistPrices(cur, pricesLastEtag);
            return;
        }
        const data = await r.json();
        if (!r.ok || data.error) throw new Error(data?.error || `HTTP ${r.status}`);
        pricesLastEtag = r.headers.get("ETag") || "";
        setMetalPricesCache(data);
        persistPrices(data, pricesLastEtag);
        renderMetalPrices(data);
    } catch (e) {
        if (e.name === "AbortError") {
            console.debug("Metals:", e);
        } else {
            console.error("Metals:", e);
        }
        if (metalPricesCache && Object.keys(metalPricesCache).length) {
            renderMetalPrices(metalPricesCache);
        } else {
            $metalsList.innerHTML = '<div class="panel-loading" style="color:#999">行情加载较慢，稍后自动刷新</div>';
        }
    } finally {
        clearTimeout(timer);
    }
}

function renderMetalPrices(data) {
    if (!$metalsList) return;
    if (!data || data.error || !Object.keys(data).length) { $metalsList.innerHTML = '<div class="panel-loading" style="color:#999">暂无行情</div>'; return; }
    const order = ["gold", "gold_cny", "silver", "silver_cny"];
    let html = "";
    for (const key of order) {
        const item = data[key]; if (!item) continue;
        const dir = colorCls(item.change), sign = item.change >= 0 ? "+" : "";
        html += `<div class="metal-card" data-metal="${key}"><div class="metal-left"><span class="metal-name">${item.name}</span><span class="metal-unit">${item.unit}</span></div><div class="metal-right"><span class="metal-price ${dir}">${item.price.toFixed(2)}</span><span class="metal-change ${dir}">${sign}${item.change.toFixed(2)} (${sign}${item.change_pct.toFixed(2)}%)</span></div></div>`;
    }
    if (data.usdcny) html += `<div style="text-align:center;font-size:8px;color:#bbb;margin-top:2px;">USD/CNY ${data.usdcny}</div>`;
    $metalsList.innerHTML = html;

    $metalsList.querySelectorAll(".metal-card").forEach(card => {
        card.addEventListener("pointerenter", function () {
            const trendKeyMap = { "gold": "gold", "gold_cny": "gold_cny", "silver": "silver", "silver_cny": "silver_cny" };
            const trendKey = trendKeyMap[this.dataset.metal] || "gold";
            fetchMetalTrendData(trendKey, "1m").catch(e => console.debug("Metal trend prefetch:", e));
        }, { once: true });
        card.addEventListener("click", function () {
            openMetalModal(this.dataset.metal);
        });
    });
    warmupMetalTrends();
}

function openMetalModal(metalKey) {
    const item = metalPricesCache[metalKey];
    if (!item) return;

    const trendKeyMap = { "gold": "gold", "gold_cny": "gold_cny", "silver": "silver", "silver_cny": "silver_cny" };
    const trendKey = trendKeyMap[metalKey] || "gold";
    const dir = colorCls(item.change), sign = item.change >= 0 ? "+" : "";

    $metalModalTitle.textContent = item.name + " 趋势";
    $metalModalBody.innerHTML = `
        <div class="metal-detail-header">
            <div><div class="metal-detail-price ${dir}">${item.price.toFixed(2)}</div><div style="font-size:10px;color:var(--text3)">${item.unit}</div></div>
            <div class="metal-detail-change ${dir}">${sign}${item.change.toFixed(2)} (${sign}${item.change_pct.toFixed(2)}%)</div>
        </div>
        <div class="period-btns" style="margin-bottom:8px;">
            <button class="period-btn" data-period="7d">7天</button>
            <button class="period-btn" data-period="15d">15天</button>
            <button class="period-btn active" data-period="1m">1月</button>
            <button class="period-btn" data-period="3m">3月</button>
            <button class="period-btn" data-period="6m">6月</button>
            <button class="period-btn" data-period="1y">1年</button>
        </div>
        <div class="chart-wrap" style="height:180px;"><canvas id="metalChart"></canvas></div>
        <div class="metal-advice" id="metalAdvice"><div class="metal-advice-title">趋势加载中...</div><span style="color:var(--text3);font-size:10px;">正在获取最新走势</span></div>`;
    $metalModal.classList.add("show");

    const cachedTrend = metalTrendCache.get(trendCacheKey(trendKey, "1m"));
    if (cachedTrend && Date.now() - cachedTrend.ts < METAL_TREND_TTL) {
        renderMetalTrend(cachedTrend.data, trendKey, "1m", item);
    } else {
        loadMetalTrend(trendKey, "1m", item);
    }

    $metalModalBody.querySelectorAll(".period-btn").forEach(btn => {
        btn.addEventListener("click", function () {
            $metalModalBody.querySelectorAll(".period-btn").forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            loadMetalTrend(trendKey, this.dataset.period, item);
        });
    });
}

async function loadMetalTrend(metalKey, period, metalItem) {
    const loadSeq = ++metalTrendLoadSeq;
    const adviceEl = document.getElementById("metalAdvice");
    const fallbackTimer = setTimeout(() => {
        if (loadSeq !== metalTrendLoadSeq) return;
        const currentAdviceEl = document.getElementById("metalAdvice");
        if (currentAdviceEl) {
            currentAdviceEl.innerHTML = '<div class="metal-advice-title">趋势暂不可用</div><span style="color:var(--text3);font-size:10px;">外部行情源响应较慢，请稍后自动刷新。</span>';
        }
    }, 4500);
    if (adviceEl) {
        adviceEl.innerHTML = '<div class="metal-advice-title">趋势加载中...</div><span style="color:var(--text3);font-size:10px;">正在获取最新走势</span>';
    }
    try {
        const data = await fetchMetalTrendData(metalKey, period);
        if (loadSeq !== metalTrendLoadSeq) return;
        renderMetalTrend(data, metalKey, period, metalItem);
    } catch (e) {
        if (loadSeq !== metalTrendLoadSeq) return;
        console.debug("Metal trend:", e);
        const currentAdviceEl = document.getElementById("metalAdvice");
        if (currentAdviceEl) {
            currentAdviceEl.innerHTML = '<div class="metal-advice-title">趋势暂不可用</div><span style="color:var(--text3);font-size:10px;">外部行情源响应较慢，请稍后自动刷新。</span>';
        }
    } finally {
        clearTimeout(fallbackTimer);
    }
}

function normalizeTrendPoints(trend) {
    if (!Array.isArray(trend)) return [];
    return trend.map(p => ({
        date: String(p?.date || "").trim(),
        close: Number(p?.close),
    })).filter(p => p.date && Number.isFinite(p.close) && p.close > 0);
}

function renderMetalTrend(data, metalKey, period, metalItem) {
    const adviceEl = document.getElementById("metalAdvice");
    if (!data.trend || !data.trend.length) {
        if (adviceEl) {
            adviceEl.innerHTML = '<div class="metal-advice-title">趋势暂不可用</div><span style="color:var(--text3);font-size:10px;">外部行情源响应较慢，请稍后再试。</span>';
        }
        return;
    }

    const trend = normalizeTrendPoints(data.trend);
    if (trend.length < 2) {
        if (adviceEl) {
            adviceEl.innerHTML = '<div class="metal-advice-title">趋势暂不可用</div><span style="color:var(--text3);font-size:10px;">有效行情点不足，请稍后再试。</span>';
        }
        return;
    }

    const canvas = document.getElementById("metalChart");
    if (!canvas) return;
    if (getMetalChart()) getMetalChart().destroy();

    const labels = trend.map(p => p.date);
    const closes = trend.map(p => p.close);
    const startPrice = closes[0];
    const endPrice = closes[closes.length - 1];
    const lineColor = endPrice >= startPrice ? "#e74c3c" : "#27ae60";

    const inst = new Chart(canvas, {
        type: "line",
        data: { labels, datasets: [{ data: closes, borderColor: lineColor, backgroundColor: lineColor + "15", borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.3 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
            scales: { x: { ticks: { maxTicksLimit: 6, font: { size: 9 } }, grid: { display: false } }, y: { ticks: { maxTicksLimit: 5, font: { size: 9 } }, grid: { color: "#f0f0f0" } } },
            interaction: { mode: "nearest", axis: "x" },
            onHover(event, elements, chart) {
                const { x, y } = event.native ? { x: event.native.offsetX, y: event.native.offsetY } : { x: 0, y: 0 };
                chart._crosshair = { x, y };
                chart.draw();
            },
        }
    });
    setMetalChart(inst);
    canvas.addEventListener("mouseleave", () => { const mc = getMetalChart(); if (mc) { mc._crosshair = null; mc.draw(); } });

    if (adviceEl) {
        const changeFromStart = startPrice > 0 ? ((endPrice - startPrice) / startPrice * 100) : 0;
        const isGold = metalKey.includes("gold");
        const metalName = isGold ? "黄金" : "白银";
        let advice = "";
        if (metalItem.change_pct > 2) {
            advice = `<strong>短期涨幅较大（${fmtMoney(metalItem.change_pct)}%）</strong>，追高风险较高。建议等待回调后再考虑入手，或分批建仓。`;
        } else if (metalItem.change_pct < -2) {
            advice = `<strong>短期跌幅较大（${fmtMoney(metalItem.change_pct)}%）</strong>，如看好${metalName}中长期走势，可考虑逢低分批买入。`;
        } else if (changeFromStart > 10) {
            advice = `${metalName}近期涨幅${changeFromStart.toFixed(1)}%，<strong>处于相对高位</strong>。建议观望或少量配置，不宜重仓追入。`;
        } else if (changeFromStart < -5) {
            advice = `${metalName}近期回调${Math.abs(changeFromStart).toFixed(1)}%，<strong>处于相对低位</strong>。如看好避险需求，可考虑逐步建仓。`;
        } else {
            advice = `${metalName}近期波动较小（${changeFromStart >= 0 ? "+" : ""}${changeFromStart.toFixed(1)}%），<strong>走势平稳</strong>。可根据个人资产配置需要适量持有。`;
        }
        advice += `<br><br><span style="color:var(--text3);font-size:10px;">提示：贵金属投资有风险，建议配置比例不超过总资产的10-15%。</span>`;
        adviceEl.innerHTML = `<div class="metal-advice-title">💡 入手建议</div>${advice}`;
    }
}

export function initMetalModal() {
    $metalModalClose.addEventListener("click", () => { metalTrendLoadSeq++; $metalModal.classList.remove("show"); const mc = getMetalChart(); if (mc) { mc.destroy(); setMetalChart(null); } });
    $metalModal.addEventListener("click", e => { if (e.target === $metalModal) { metalTrendLoadSeq++; $metalModal.classList.remove("show"); const mc = getMetalChart(); if (mc) { mc.destroy(); setMetalChart(null); } } });
}

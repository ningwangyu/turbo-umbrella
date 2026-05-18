/**
 * 贵金属行情模块 — 价格获取/渲染 + 趋势弹窗
 */
import { $metalsList, $metalModal, $metalModalTitle, $metalModalBody, $metalModalClose, metalPricesCache, setMetalPricesCache, setMetalChart, getMetalChart } from './state.js';
import { colorCls, fmtMoney } from './utils.js';

export async function fetchMetalPrices() {
    if (!$metalsList) return;
    try { const r = await fetch("/api/price/metals"); const data = await r.json(); setMetalPricesCache(data); renderMetalPrices(data); } catch (e) { console.error("Metals:", e); }
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
        card.addEventListener("click", function () {
            openMetalModal(this.dataset.metal);
        });
    });
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
        <div class="metal-advice" id="metalAdvice"><div class="metal-advice-title">加载建议中...</div></div>`;
    $metalModal.classList.add("show");

    loadMetalTrend(trendKey, "1m", item);

    $metalModalBody.querySelectorAll(".period-btn").forEach(btn => {
        btn.addEventListener("click", function () {
            $metalModalBody.querySelectorAll(".period-btn").forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            loadMetalTrend(trendKey, this.dataset.period, item);
        });
    });
}

async function loadMetalTrend(metalKey, period, metalItem) {
    try {
        const r = await fetch(`/api/price/metals/trend?metal=${metalKey}&period=${period}`);
        const data = await r.json();
        if (!data.trend || !data.trend.length) return;

        const canvas = document.getElementById("metalChart");
        if (!canvas) return;
        if (getMetalChart()) getMetalChart().destroy();

        const labels = data.trend.map(p => p.date);
        const closes = data.trend.map(p => p.close);
        const startPrice = closes[0] || 0;
        const endPrice = closes[closes.length - 1] || 0;
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

        const adviceEl = document.getElementById("metalAdvice");
        if (adviceEl) {
            const changeFromStart = ((endPrice - startPrice) / startPrice * 100);
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
    } catch (e) { console.error("Metal trend:", e); }
}

export function initMetalModal() {
    $metalModalClose.addEventListener("click", () => { $metalModal.classList.remove("show"); const mc = getMetalChart(); if (mc) { mc.destroy(); setMetalChart(null); } });
    $metalModal.addEventListener("click", e => { if (e.target === $metalModal) { $metalModal.classList.remove("show"); const mc = getMetalChart(); if (mc) { mc.destroy(); setMetalChart(null); } } });
}

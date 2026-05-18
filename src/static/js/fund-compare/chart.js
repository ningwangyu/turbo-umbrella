import { fundDataCache } from '../state.js';
import { compareState } from './state.js';

export function renderCompareChart(period) {
    const canvas = document.getElementById("compareChart");
    if (!canvas) return;

    const chartKey = "compareChartInstance";
    const showEmpty = (message) => {
        if (window[chartKey]) {
            window[chartKey].destroy();
            window[chartKey] = null;
        }
        const diffBar = document.getElementById("compareDiffBar");
        if (diffBar) diffBar.innerHTML = `<span class="compare-chart-empty">${message}</span>`;
    };

    const colors = ["#1a73e8", "#e74c3c", "#27ae60"];
    const datasets = [];

    // 周期筛选
    const now = Date.now();
    const periodDays = { "1m": 30, "3m": 90, "6m": 180, "1y": 365, "all": 9999 };
    const days = periodDays[period] || 180;
    const cutoff = now - days * 86400000;

    // 收集每只基金的趋势数据
    const fundTrends = [];
    compareState.compareFunds.forEach((code, i) => {
        const d = compareState.compareData[code];
        if (!d?.perf?.trend) return;
        const fd = fundDataCache[code];
        const name = fd ? fd.name.substring(0, 8) : code;
        let trend = d.perf.trend.filter(t => Number(t.date) >= cutoff);
        if (!trend.length) return;

        const base = trend[0].nav || 1;
        const navMap = new Map();
        trend.forEach(t => {
            navMap.set(Number(t.date), round((t.nav / base) * 100, 2));
        });
        fundTrends.push({ name, navMap, color: colors[i % 3] });
    });

    if (fundTrends.length < 2) {
        showEmpty("当前周期内可用于对比的净值走势不足");
        return;
    }

    // 构建统一日期轴
    const allDates = new Set();
    fundTrends.forEach(ft => ft.navMap.forEach((_, date) => allDates.add(date)));
    const sortedDates = Array.from(allDates).sort((a, b) => a - b);

    // 插值
    fundTrends.forEach(ft => {
        const dataPoints = [];
        let lastVal = null;
        sortedDates.forEach(date => {
            const val = ft.navMap.get(date);
            if (val != null) {
                lastVal = val;
                dataPoints.push({ x: date, y: val });
            } else if (lastVal != null) {
                dataPoints.push({ x: date, y: lastVal });
            }
        });
        datasets.push({
            label: ft.name,
            data: dataPoints,
            borderColor: ft.color,
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0.3,
        });
    });

    if (!datasets.length) {
        showEmpty("暂无可展示的净值走势数据");
        return;
    }

    // 销毁旧图表
    if (window[chartKey]) window[chartKey].destroy();
    const diffBar = document.getElementById("compareDiffBar");
    if (diffBar) diffBar.innerHTML = "";

    window[chartKey] = new Chart(canvas, {
        type: "line",
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            parsing: { xAxisKey: "x", yAxisKey: "y" },
            plugins: {
                legend: { display: true, position: "top", labels: { font: { size: 10 }, boxWidth: 12 } },
                tooltip: {
                    mode: "index", intersect: false,
                    callbacks: {
                        title: (items) => {
                            if (items.length) {
                                const d = new Date(items[0].parsed.x);
                                return d.toLocaleDateString("zh-CN");
                            }
                            return "";
                        },
                        footer: (items) => {
                            // 计算基金间差额
                            if (items.length < 2) return "";
                            const vals = items.map(it => it.parsed.y);
                            const diffs = [];
                            for (let i = 0; i < vals.length; i++) {
                                for (let j = i + 1; j < vals.length; j++) {
                                    const diff = round(vals[i] - vals[j], 2);
                                    const label1 = items[i].dataset.label?.substring(0, 4) || `基金${i + 1}`;
                                    const label2 = items[j].dataset.label?.substring(0, 4) || `基金${j + 1}`;
                                    const sign = diff > 0 ? "+" : "";
                                    diffs.push(`${label1} vs ${label2}: ${sign}${diff}`);
                                }
                            }
                            return diffs.join(" | ");
                        },
                    },
                },
            },
            scales: {
                x: {
                    type: "linear",
                    display: false,
                    min: sortedDates[0],
                    max: sortedDates[sortedDates.length - 1],
                },
                y: { beginAtZero: false, grid: { color: "rgba(0,0,0,0.05)" }, ticks: { font: { size: 9 } } },
            },
            interaction: { mode: "nearest", axis: "x", intersect: false },
            onHover(event, elements, chart) {
                const { x, y } = event.native
                    ? { x: event.native.offsetX, y: event.native.offsetY }
                    : { x: 0, y: 0 };
                chart._crosshair = { x, y };
                chart.draw();
                // 更新差额信息栏
                updateDiffBar(elements, chart);
            },
        },
    });

    // 鼠标离开清除十字线
    canvas.addEventListener("mouseleave", () => {
        const chart = window[chartKey];
        if (chart) { chart._crosshair = null; chart.draw(); }
        const diffBar = document.getElementById("compareDiffBar");
        if (diffBar) diffBar.innerHTML = "";
    });
}

/**
 * 更新差额信息栏（图表下方）
 */
function updateDiffBar(elements, chart) {
    const diffBar = document.getElementById("compareDiffBar");
    if (!diffBar) return;

    if (!elements || elements.length < 2) {
        diffBar.innerHTML = "";
        return;
    }

    const activePoints = chart.tooltip?.dataPoints;
    if (!activePoints || activePoints.length < 2) {
        diffBar.innerHTML = "";
        return;
    }

    const vals = activePoints.map(dp => dp.parsed.y);
    const names = activePoints.map(dp => dp.dataset.label?.substring(0, 6) || "");

    let html = "";
    for (let i = 0; i < vals.length; i++) {
        for (let j = i + 1; j < vals.length; j++) {
            const diff = round(vals[i] - vals[j], 2);
            const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
            const sign = diff > 0 ? "+" : "";
            html += `<span class="diff-item">${names[i]} vs ${names[j]}: <span class="${cls}">${sign}${diff}</span></span>`;
        }
    }
    diffBar.innerHTML = html;
}

function round(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }

// ============================================================
// CSS
// ============================================================

import { fmtMoney } from '../utils.js';
import { STRATEGIES } from './config.js';

let chartLineInstance = null;
let chartBarInstance = null;

export function drawLineChart(data, activeKeys) {
    const canvas = document.getElementById("backtestLineChart");
    if (!canvas) return;
    if (chartLineInstance) chartLineInstance.destroy();

    const datasets = [];
    activeKeys.forEach((key, ki) => {
        const result = data.results[key];
        if (!result || result.error) return;
        const cfg = STRATEGIES[key];
        const details = result.details;
        if (!details || !details.length) return;

        // 计算每个时间点的累计资产市值
        let cumShares = 0;
        const points = details.map(d => {
            cumShares += d.shares || 0;
            return { x: +d.date, y: parseFloat((cumShares * d.nav).toFixed(2)) };
        });

        datasets.push({
            label: result.strategy,
            data: points,
            borderColor: cfg.color,
            backgroundColor: cfg.color + "15",
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.3,
        });
    });

    if (!datasets.length) return;

    // 对齐到同一X轴
    const allDates = [...new Set(datasets.flatMap(ds => ds.data.map(p => p.x)))].sort((a,b) => a - b);

    chartLineInstance = new window.Chart(canvas, {
        type: "line",
        data: {
            labels: allDates.map(d => new Date(d)),
            datasets: datasets.map(ds => ({
                ...ds,
                data: allDates.map(date => {
                    const pt = ds.data.find(p => p.x === date);
                    return pt ? pt.y : null;
                }),
                spanGaps: true,
            })),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 1500, easing: "easeOutQuart" },
            plugins: {
                legend: {
                    display: true,
                    position: "top",
                    labels: { usePointStyle: true, pointStyle: "circle", padding: 12, font: { size: 11 } },
                },
                title: { display: false },
                tooltip: {
                    mode: "index",
                    intersect: false,
                    callbacks: {
                        title: items => {
                            if (items.length) {
                                const d = new Date(items[0].parsed.x || items[0].label);
                                return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
                            }
                            return "";
                        },
                        label: item => item.dataset.label + ": " + fmtMoney(item.parsed.y) + "元",
                    },
                },
            },
            scales: {
                x: {
                    type: "time",
                    time: { unit: "month", displayFormats: { month: "M月" } },
                    ticks: { maxTicksLimit: 8, font: { size: 10 } },
                    grid: { display: false },
                    title: { display: true, text: "日期", font: { size: 11 }, color: "#888" },
                },
                y: {
                    ticks: {
                        maxTicksLimit: 6,
                        font: { size: 10 },
                        callback: v => v >= 10000 ? (v / 10000).toFixed(1) + "万" : v,
                    },
                    grid: { color: "#f0f0f0" },
                    title: { display: true, text: "资产价值（元）", font: { size: 11 }, color: "#888" },
                },
            },
            interaction: { mode: "nearest", axis: "x" },
            onHover(event, elements, chart) {
                const { x, y } = event.native ? { x: event.native.offsetX, y: event.native.offsetY } : { x: 0, y: 0 };
                chart._crosshair = { x, y };
                chart.draw();
            },
        },
    });

    // 十字准线插件已全局注册（chart-config.js），自动生效
    canvas.addEventListener("mouseleave", () => {
        if (chartLineInstance) { chartLineInstance._crosshair = null; chartLineInstance.draw(); }
    });
}

/* ============================================================
 * 柱状图 — 收益率对比
 * ============================================================ */

export function drawBarChart(data, activeKeys) {
    const canvas = document.getElementById("backtestBarChart");
    if (!canvas) return;
    if (chartBarInstance) chartBarInstance.destroy();

    const labels = [];
    const values = [];
    const bgColors = [];
    const borderColors = [];

    activeKeys.forEach(key => {
        const result = data.results[key];
        if (!result || result.error) return;
        labels.push(result.strategy);
        values.push(result.summary.profit_pct);
        bgColors.push(STRATEGIES[key].color + "88");
        borderColors.push(STRATEGIES[key].color);
    });

    if (!labels.length) return;

    chartBarInstance = new window.Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "收益率%",
                data: values,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1,
                borderRadius: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 1200, easing: "easeOutQuart" },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: item => "收益率: " + fmtMoney(item.parsed.y) + "%" },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => v + "%", font: { size: 10 } },
                    grid: { color: "#f0f0f0" },
                },
                x: {
                    ticks: { font: { size: 11 } },
                    grid: { display: false },
                },
            },
        },
    });

    // 在柱子顶部/底部绘制百分比标签
    const originalDraw = chartBarInstance.draw.bind(chartBarInstance);
    chartBarInstance.draw = function () {
        originalDraw();
        const ctx = this.ctx;
        ctx.save();
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        this.data.datasets[0].data.forEach((val, i) => {
            const meta = this.getDatasetMeta(0);
            const bar = meta.data[i];
            if (bar) {
                ctx.fillStyle = borderColors[i];
                if (val >= 0) {
                    ctx.textBaseline = "bottom";
                    ctx.fillText(fmtMoney(val) + "%", bar.x, bar.y - 4);
                } else {
                    ctx.textBaseline = "top";
                    ctx.fillText(fmtMoney(val) + "%", bar.x, bar.y + 4);
                }
            }
        });
        ctx.restore();
    };
    chartBarInstance.draw();
}

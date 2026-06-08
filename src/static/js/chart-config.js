/**
 * Chart.js 十字准线插件 + 图表渲染函数
 *
 * 创新点：用自绘十字线+数值标签实现精确数据定位（虚线交叉+圆点+右侧Y轴数值标签）
 * 自动选择时间粒度（7天用日级，3月用周级，6月+用月级），
 * 超过300个数据点时自动降采样避免性能问题
 */
import { chartInstances, setDetailChartInstance, getDetailChartInstance } from './state.js';

// ===== 自定义十字准线插件 =====
// Chart.js 插件在 afterDraw 阶段绘制覆盖层，不污染原始数据集，鼠标移出后可直接清空。
const crosshairPlugin = {
    id: "crosshair",
    afterDraw(chart) {
        if (chart._crosshair) {
            const { ctx, chartArea: { left, right, top, bottom } } = chart;
            const { x, y } = chart._crosshair;
            ctx.save();
            ctx.setLineDash([6, 3]);
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = "rgba(56,189,248,0.75)";
            ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
            ctx.fillStyle = "rgba(56,189,248,0.9)";
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
            const yAxis = chart.scales.y;
            if (yAxis) {
                const value = yAxis.getValueForPixel(y);
                ctx.setLineDash([]);
                ctx.font = "10px sans-serif";
                ctx.fillStyle = "#38bdf8";
                ctx.textAlign = "left";
                ctx.fillText(value.toFixed(4), right + 4, y + 3);
            }
            ctx.restore();
        }
    }
};
if (typeof Chart !== "undefined") Chart.register(crosshairPlugin);

// ===== 渲染基金净值走势（小卡片） =====
export function renderChart(code, trend, period) {
    if (chartInstances[code]) chartInstances[code].destroy();
    const canvas = document.getElementById(`chart-${code}`);
    if (!canvas || !trend || !trend.length) return;
    let filtered = trend;
    const lastDate = trend[trend.length - 1].date;
    if (period === "ytd") { const yearStart = new Date(new Date(lastDate).getFullYear(), 0, 1).getTime(); filtered = trend.filter(p => p.date >= yearStart); }
    else { const periods = { "7d": 7, "15d": 15, "3m": 90, "6m": 180, "1y": 365, "2y": 730, "all": 99999 }; filtered = trend.filter(p => p.date >= lastDate - (periods[period] || 180) * 86400000); }
    if (filtered.length > 300) {
        // 大数据量净值曲线只做等距降采样，保留走势形态同时避免移动端 Canvas 绘制卡顿。
        const step = Math.ceil(filtered.length / 300);
        filtered = filtered.filter((_, i) => i % step === 0);
    }
    const labels = filtered.map(p => new Date(p.date)), navs = filtered.map(p => p.nav);
    const lineColor = (navs[navs.length - 1] || 0) >= (navs[0] || 0) ? "#ff6b7a" : "#35e89b";
    let timeUnit = "month", displayFormat = "M月d日";
    if (period === "7d" || period === "15d") { timeUnit = "day"; } else if (period === "3m") { timeUnit = "week"; } else if (period === "6m" || period === "ytd") { displayFormat = "M月"; } else { displayFormat = "yyyy年M月"; }

    chartInstances[code] = new Chart(canvas, {
        type: "line", data: { labels, datasets: [{ data: navs, borderColor: lineColor, backgroundColor: lineColor + "15", borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.3 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false, callbacks: { title: items => { if (items.length) { const d = new Date(items[0].parsed.x); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; } return ""; }, label: item => item.parsed.y.toFixed(4) } } },
            scales: { x: { type: "time", time: { unit: timeUnit, displayFormats: { day: displayFormat, week: displayFormat, month: displayFormat } }, ticks: { maxTicksLimit: 5, font: { size: 9 }, color: "#8fb6d8" }, grid: { display: false } }, y: { ticks: { maxTicksLimit: 4, font: { size: 9 }, color: "#8fb6d8", callback: v => v.toFixed(4) }, grid: { color: "rgba(125,211,252,.12)" } } },
            interaction: { mode: "nearest", axis: "x" },
            onHover(event, elements, chart) { const { x, y } = event.native ? { x: event.native.offsetX, y: event.native.offsetY } : { x: 0, y: 0 }; chart._crosshair = { x, y }; chart.draw(); },
        }
    });
    canvas.addEventListener("mouseleave", () => { const chart = chartInstances[code]; if (chart) { chart._crosshair = null; chart.draw(); } });
}

// ===== 渲染基金净值走势（详情弹窗） =====
export function renderDetailChart(code, trend, period) {
    if (getDetailChartInstance()) getDetailChartInstance().destroy();
    const canvas = document.getElementById(`detail-chart-${code}`);
    if (!canvas || !trend || !trend.length) return;
    let filtered = trend;
    const lastDate = trend[trend.length - 1].date;
    if (period === "ytd") { filtered = trend.filter(p => p.date >= new Date(new Date(lastDate).getFullYear(), 0, 1).getTime()); }
    else { const periods = { "7d": 7, "15d": 15, "3m": 90, "6m": 180, "1y": 365, "2y": 730, "all": 99999 }; filtered = trend.filter(p => p.date >= lastDate - (periods[period] || 180) * 86400000); }
    if (filtered.length > 300) {
        // 大数据量净值曲线只做等距降采样，保留走势形态同时避免移动端 Canvas 绘制卡顿。
        const step = Math.ceil(filtered.length / 300);
        filtered = filtered.filter((_, i) => i % step === 0);
    }
    const labels = filtered.map(p => new Date(p.date)), navs = filtered.map(p => p.nav);
    const lineColor = (navs[navs.length - 1] || 0) >= (navs[0] || 0) ? "#ff6b7a" : "#35e89b";
    let timeUnit = "month", displayFormat = "M月d日";
    if (period === "7d" || period === "15d") { timeUnit = "day"; } else if (period === "3m") { timeUnit = "week"; } else if (period === "6m" || period === "ytd") { displayFormat = "M月"; } else { displayFormat = "yyyy年M月"; }

    const inst = new Chart(canvas, {
        type: "line", data: { labels, datasets: [{ data: navs, borderColor: lineColor, backgroundColor: lineColor + "15", borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false, callbacks: { title: items => { if (items.length) { const d = new Date(items[0].parsed.x); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; } return ""; }, label: item => item.parsed.y.toFixed(4) } } },
            scales: { x: { type: "time", time: { unit: timeUnit, displayFormats: { day: displayFormat, week: displayFormat, month: displayFormat } }, ticks: { maxTicksLimit: 8, font: { size: 11 }, color: "#8fb6d8" }, grid: { display: false } }, y: { ticks: { maxTicksLimit: 6, font: { size: 11 }, color: "#8fb6d8", callback: v => v.toFixed(4) }, grid: { color: "rgba(125,211,252,.12)" } } },
            interaction: { mode: "nearest", axis: "x" },
            onHover(event, elements, chart) { const { x, y } = event.native ? { x: event.native.offsetX, y: event.native.offsetY } : { x: 0, y: 0 }; chart._crosshair = { x, y }; chart.draw(); },
        }
    });
    setDetailChartInstance(inst);
    canvas.addEventListener("mouseleave", () => { const dci = getDetailChartInstance(); if (dci) { dci._crosshair = null; dci.draw(); } });
}

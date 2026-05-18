import { sentimentState } from './state.js';

export function drawEtfChart(etfList) {
    if (!etfList || !etfList.length || typeof Chart === 'undefined') return;
    const canvas = document.getElementById('etfInflowChart');
    if (!canvas) return;

    if (sentimentState.etfChartInstance) { sentimentState.etfChartInstance.destroy(); sentimentState.etfChartInstance = null; }

    const labels = etfList.map(e => e.name.length > 8 ? e.name.slice(0, 8) + '…' : e.name);
    const values = etfList.map(e => e.net_inflow);
    const barColors = values.map(v => v >= 0 ? 'rgba(231,76,60,0.75)' : 'rgba(39,174,96,0.75)');

    sentimentState.etfChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: '净流入(亿)', data: values, backgroundColor: barColors, borderRadius: 3, barPercentage: 0.6 }],
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: item => `${item.parsed.x > 0 ? '+' : ''}${item.parsed.x.toFixed(2)}亿` } },
            },
            scales: {
                x: { grid: { color: '#f0f0f0' }, ticks: { font: { size: 10 }, callback: v => v + '亿' } },
                y: { grid: { display: false }, ticks: { font: { size: 10 } } },
            },
        },
    });
}


// ==================== ETF Tab切换 ====================


export function drawSentimentGauge(score) {
    const canvas = document.getElementById("sentimentGauge");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const cx = 100, cy = 100, r = 75, lw = 10;

    // 背景弧
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.strokeStyle = "#eee";
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.stroke();

    // 分段颜色
    const segments = [
        { end: 0.2, color: "#27ae60" },
        { end: 0.4, color: "#66bb6a" },
        { end: 0.6, color: "#f5a623" },
        { end: 0.8, color: "#ef5350" },
        { end: 1.0, color: "#e74c3c" },
    ];
    let prevEnd = Math.PI;
    segments.forEach(seg => {
        const angle = Math.PI + seg.end * Math.PI;
        ctx.beginPath();
        ctx.arc(cx, cy, r, prevEnd, angle, false);
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = lw;
        ctx.lineCap = "butt";
        ctx.stroke();
        prevEnd = angle;
    });

    // 指针
    const needleAngle = Math.PI + (score / 100) * Math.PI;
    const nx = cx + (r - 20) * Math.cos(needleAngle);
    const ny = cy + (r - 20) * Math.sin(needleAngle);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();

    // 中心圆
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#333";
    ctx.fill();
}


// ==================== Chart实例销毁 ====================

export function destroyDetailChart() {
    if (sentimentState.detailChartInstance) {
        sentimentState.detailChartInstance.destroy();
        sentimentState.detailChartInstance = null;
    }
}


// ==================== CSS样式 ====================

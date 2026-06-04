/**
 * Chart.js 实例管理模块（风险分析版） — 提供图表创建、更新和销毁的统一接口。
 *
 * 从 dashboard/charts.js fork 而来，新增折线图/面积图创建函数。
 */

import { setChartInstance, chartInstances } from './state.js';

// ===== 颜色方案常量 =====

/** 资产类型配色 */
export const ASSET_TYPE_COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7',
    '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
    '#64748b', '#d97706',
];

/** 风险等级配色 */
export const RISK_LEVEL_COLORS = {
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#ef4444',
};

function getCardBg() {
    return getComputedStyle(document.documentElement)
        .getPropertyValue('--card').trim() || '#fff';
}

function getTooltipConfig() {
    return {
        backgroundColor: 'rgba(0,0,0,0.85)',
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 8,
        displayColors: true,
        boxPadding: 4,
    };
}

/** 十字线插件 — 仅在 tooltip 可见时绘制，零额外重绘开销 */
const crosshairPlugin = {
    id: 'raCrosshair',
    afterDraw(chart) {
        const { tooltip } = chart;
        if (!tooltip || !tooltip.opacity || !tooltip.dataPoints || !tooltip.dataPoints.length) return;

        const pt = tooltip.dataPoints[0];
        const cx = pt.element?.x;
        const cy = pt.element?.y;
        if (cx == null || cy == null) return;

        const { ctx, chartArea: { left, right, top, bottom } } = chart;
        ctx.save();
        ctx.setLineDash([5, 3]);
        ctx.lineWidth = 0.7;
        ctx.strokeStyle = 'rgba(143,182,216,0.45)';

        // 竖线
        if (cx >= left && cx <= right) {
            ctx.beginPath();
            ctx.moveTo(cx, top);
            ctx.lineTo(cx, bottom);
            ctx.stroke();
        }
        // 横线
        if (cy >= top && cy <= bottom) {
            ctx.beginPath();
            ctx.moveTo(left, cy);
            ctx.lineTo(right, cy);
            ctx.stroke();
        }

        // 高亮悬浮点（散点图）
        if (chart.config.type === 'scatter' && pt.element) {
            ctx.restore();
            ctx.save();
            const r = (pt.element.options?.radius || 6) + 3;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]);
            ctx.stroke();
        }

        ctx.restore();
    }
};

/**
 * 创建 Doughnut 图表。
 */
export function createDoughnutChart(ctx, data, options = {}, instanceName) {
    if (instanceName && chartInstances[instanceName]) {
        try { chartInstances[instanceName].destroy(); } catch (_) {}
    }

    const colors = data.colors || data.values.map((_, i) => ASSET_TYPE_COLORS[i % ASSET_TYPE_COLORS.length]);

    const chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: getCardBg(),
                hoverBorderWidth: 3,
            }]
        },
        options: {
            responsive: false,
            cutout: '55%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...getTooltipConfig(),
                    callbacks: {
                        label: (tooltipCtx) => {
                            const label = data.labels[tooltipCtx.dataIndex];
                            const value = data.values[tooltipCtx.dataIndex];
                            return `${label}: ${value.toFixed(1)}%`;
                        },
                        ...options.tooltipCallbacks,
                    }
                }
            },
            ...options,
        }
    });

    if (instanceName) setChartInstance(instanceName, chart);
    return chart;
}

/**
 * 创建水平/垂直 Bar 图表。
 */
export function createBarChart(ctx, data, options = {}, instanceName) {
    if (instanceName && chartInstances[instanceName]) {
        try { chartInstances[instanceName].destroy(); } catch (_) {}
    }

    const colors = data.colors || data.values.map((_, i) => ASSET_TYPE_COLORS[i % ASSET_TYPE_COLORS.length]);

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.values,
                backgroundColor: colors.map(c => c + 'cc'),
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            indexAxis: options.horizontal ? 'y' : 'x',
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                raCrosshair: {},
                tooltip: {
                    ...getTooltipConfig(),
                    callbacks: {
                        label: (tooltipCtx) => {
                            const value = tooltipCtx.parsed.x ?? tooltipCtx.parsed.y;
                            return `${value.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 }, color: '#8fb6d8' },
                },
                y: {
                    grid: { color: 'rgba(125,211,252,.12)' },
                    ticks: { font: { size: 10 }, color: '#8fb6d8' },
                },
            },
            ...options,
            plugins: { ...options.plugins, raCrosshair: {} },
        },
        plugins: [crosshairPlugin],
    });

    if (instanceName) setChartInstance(instanceName, chart);
    return chart;
}

/**
 * 创建散点图（风险-收益散点）。
 */
export function createScatterChart(ctx, data, options = {}, instanceName) {
    if (instanceName && chartInstances[instanceName]) {
        try { chartInstances[instanceName].destroy(); } catch (_) {}
    }

    const chart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: data.datasets.map(ds => ({
                label: ds.label || '',
                data: ds.data,
                backgroundColor: ds.backgroundColor || '#3b82f6cc',
                borderColor: ds.borderColor || '#3b82f6',
                borderWidth: ds.borderWidth || 1.5,
                pointRadius: ds.pointRadius || 6,
                pointHoverRadius: ds.pointHoverRadius || 10,
                pointHoverBorderWidth: 2,
                pointHoverBorderColor: '#fff',
                pointStyle: ds.pointStyle || 'circle',
                ...ds,
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'nearest', intersect: true },
            plugins: {
                legend: { display: data.datasets.length > 1, labels: { boxWidth: 12, font: { size: 11 } } },
                raCrosshair: {},
                tooltip: {
                    ...getTooltipConfig(),
                    callbacks: {
                        title: (items) => {
                            if (!items.length) return '';
                            const ds = data.datasets[items[0].datasetIndex];
                            const pt = ds.data[items[0].dataIndex];
                            return pt.meta ? pt.meta.split(':')[0] : ds.label;
                        },
                        label: (tooltipCtx) => {
                            const ds = data.datasets[tooltipCtx.datasetIndex];
                            const pt = ds.data[tooltipCtx.dataIndex];
                            if (pt.meta) {
                                const parts = pt.meta.split(':');
                                return parts.length > 1 ? parts[1].trim() : pt.meta;
                            }
                            return `波动率=${pt.x.toFixed(1)}%  收益率=${pt.y.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: '年化波动率 (%)', font: { size: 11 }, color: '#8fb6d8' },
                    grid: { color: 'rgba(125,211,252,.12)' },
                    ticks: { font: { size: 10 }, color: '#8fb6d8' },
                },
                y: {
                    title: { display: true, text: '年化收益率 (%)', font: { size: 11 }, color: '#8fb6d8' },
                    grid: { color: 'rgba(125,211,252,.12)' },
                    ticks: { font: { size: 10 }, color: '#8fb6d8' },
                },
            },
            ...options,
        },
        plugins: [crosshairPlugin],
    });

    if (instanceName) setChartInstance(instanceName, chart);
    return chart;
}

/**
 * 创建折线图（多条线，带/不带面积填充）。
 * @param {HTMLCanvasElement} ctx
 * @param {Object} data - { labels, datasets: [{label, data, borderColor, fill?, backgroundColor?}] }
 * @param {Object} options
 * @param {string} instanceName
 */
export function createLineChart(ctx, data, options = {}, instanceName) {
    if (instanceName && chartInstances[instanceName]) {
        try { chartInstances[instanceName].destroy(); } catch (_) {}
    }

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: data.datasets.map(ds => ({
                label: ds.label,
                data: ds.data,
                borderColor: ds.borderColor || '#3b82f6',
                backgroundColor: ds.backgroundColor || 'transparent',
                borderWidth: ds.borderWidth || 2,
                fill: ds.fill || false,
                tension: ds.tension ?? 0.3,
                pointRadius: ds.pointRadius ?? 0,
                pointHoverRadius: ds.pointHoverRadius || 4,
                borderDash: ds.borderDash || [],
                ...ds,
            })),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: data.datasets.length > 1, position: 'top', labels: { boxWidth: 14, font: { size: 10 }, padding: 8, usePointStyle: true } },
                tooltip: {
                    ...getTooltipConfig(),
                    ...options.tooltip,
                },
            },
            scales: {
                x: {
                    grid: { color: 'rgba(125,211,252,.1)' },
                    ticks: { font: { size: 10 }, color: '#8fb6d8', maxTicksLimit: 10 },
                },
                y: {
                    grid: { color: 'rgba(125,211,252,.1)' },
                    ticks: { font: { size: 10 }, color: '#8fb6d8' },
                    ...options.yScale,
                },
            },
            ...options,
        }
    });

    if (instanceName) setChartInstance(instanceName, chart);
    return chart;
}

/**
 * 创建比较柱状图（多组数据对比，如压力测试场景）。
 * @param {HTMLCanvasElement} ctx
 * @param {Object} data - { labels, datasets: [{label, data, backgroundColor}] }
 * @param {Object} options
 * @param {string} instanceName
 */
export function createGroupedBarChart(ctx, data, options = {}, instanceName) {
    if (instanceName && chartInstances[instanceName]) {
        try { chartInstances[instanceName].destroy(); } catch (_) {}
    }

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: data.datasets.map(ds => ({
                label: ds.label,
                data: ds.data,
                backgroundColor: ds.backgroundColor || '#3b82f6cc',
                borderColor: ds.borderColor || '#3b82f6',
                borderWidth: 1,
                borderRadius: 4,
                ...ds,
            })),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: data.datasets.length > 1, position: 'top', labels: { boxWidth: 14, font: { size: 10 } } },
                tooltip: {
                    ...getTooltipConfig(),
                    ...options.tooltip,
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 }, color: '#8fb6d8', maxRotation: 45 },
                },
                y: {
                    grid: { color: 'rgba(125,211,252,.12)' },
                    ticks: { font: { size: 10 }, color: '#8fb6d8' },
                    ...options.yScale,
                },
            },
            ...options,
        }
    });

    if (instanceName) setChartInstance(instanceName, chart);
    return chart;
}

/**
 * 创建相关系数热力图（纯 Canvas2D）。
 * 支持鼠标悬浮显示精确 tooltip + 十字高亮行列。
 */
export function createHeatmap(canvas, matrix, labels) {
    const ctx = canvas.getContext('2d');
    const n = matrix.length;
    if (n === 0) return () => {};

    const cellSize = Math.max(40, Math.min(55, Math.floor(400 / n)));
    const labelMargin = 80;
    const canvasW = labelMargin + n * cellSize + 10;
    const canvasH = labelMargin + n * cellSize + 10;

    canvas.width = canvasW;
    canvas.height = canvasH;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';

    let hoverCell = null;  // { row, col } or null
    let tooltipEl = null;

    function getOrCreateTooltip() {
        if (tooltipEl) return tooltipEl;
        tooltipEl = document.createElement('div');
        tooltipEl.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;'
            + 'background:rgba(0,0,0,.88);color:#fff;padding:8px 12px;border-radius:8px;'
            + 'font-size:12px;line-height:1.5;box-shadow:0 4px 12px rgba(0,0,0,.3);'
            + 'display:none;white-space:nowrap;transform:translate(-50%,-110%);';
        document.body.appendChild(tooltipEl);
        return tooltipEl;
    }

    function draw() {
        ctx.clearRect(0, 0, canvasW, canvasH);

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const val = matrix[i][j];
                const x = labelMargin + j * cellSize;
                const y = labelMargin + i * cellSize;

                const r = val > 0 ? Math.round(239 * val) : Math.round(59 * -val);
                const g = val > 0 ? Math.round(130 + 125 * (1 - val)) : Math.round(130 + 81 * (1 + val));
                const b = val > 0 ? Math.round(77 * (1 - val)) : Math.round(246 - 5 * (1 + val));
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(x, y, cellSize, cellSize);

                ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x, y, cellSize, cellSize);

                ctx.fillStyle = Math.abs(val) > 0.5 ? '#fff' : '#333';
                ctx.font = `${Math.max(9, cellSize * 0.28)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(val.toFixed(2), x + cellSize / 2, y + cellSize / 2);
            }
        }

        // 十字高亮（悬浮行列）
        if (hoverCell) {
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            const hx = labelMargin + hoverCell.col * cellSize;
            const hy = labelMargin + hoverCell.row * cellSize;
            ctx.fillRect(hx, labelMargin, cellSize, n * cellSize);
            ctx.fillRect(labelMargin, hy, n * cellSize, cellSize);

            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 2;
            ctx.strokeRect(hx, hy, cellSize, cellSize);
        }

        // 行标签（左侧）
        ctx.fillStyle = '#8fb6d8';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < n; i++) {
            ctx.fillText(labels[i] || `F${i + 1}`, labelMargin - 6, labelMargin + i * cellSize + cellSize / 2);
        }

        // 列标签（上方，旋转 45°）
        ctx.textAlign = 'left';
        for (let j = 0; j < n; j++) {
            ctx.save();
            const x = labelMargin + j * cellSize + cellSize / 2;
            const y = labelMargin - 6;
            ctx.translate(x, y);
            ctx.rotate(-Math.PI / 4);
            ctx.fillText(labels[j] || `F${j + 1}`, 0, 0);
            ctx.restore();
        }
    }

    function getCellFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const col = Math.floor((mx - labelMargin) / cellSize);
        const row = Math.floor((my - labelMargin) / cellSize);
        if (row >= 0 && row < n && col >= 0 && col < n) return { row, col };
        return null;
    }

    function onMouseMove(e) {
        const cell = getCellFromEvent(e);
        const tip = getOrCreateTooltip();

        if (!cell) {
            if (hoverCell) { hoverCell = null; draw(); }
            tip.style.display = 'none';
            canvas.style.cursor = 'default';
            return;
        }

        canvas.style.cursor = 'crosshair';
        hoverCell = cell;
        draw();

        const val = matrix[cell.row][cell.col];
        const rowName = labels[cell.row] || `基金${cell.row + 1}`;
        const colName = labels[cell.col] || `基金${cell.col + 1}`;
        const strength = Math.abs(val) > 0.7 ? '强' : Math.abs(val) > 0.4 ? '中' : '弱';
        const direction = val > 0.05 ? '正相关' : val < -0.05 ? '负相关' : '无相关';

        tip.innerHTML = `<div style="font-weight:700;margin-bottom:2px">${rowName} × ${colName}</div>`
            + `<div>相关系数: <b style="color:${val > 0 ? '#ef9a9a' : '#81d4fa'}">${val.toFixed(4)}</b></div>`
            + `<div style="font-size:11px;color:#aaa">${strength}${direction}</div>`;
        tip.style.display = 'block';
        tip.style.left = e.clientX + 'px';
        tip.style.top = e.clientY + 'px';
    }

    function onMouseLeave() {
        hoverCell = null;
        draw();
        if (tooltipEl) tooltipEl.style.display = 'none';
    }

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    draw();

    return () => {
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mouseleave', onMouseLeave);
        if (tooltipEl && tooltipEl.parentNode) {
            tooltipEl.parentNode.removeChild(tooltipEl);
            tooltipEl = null;
        }
    };
}

/**
 * 销毁所有已注册的 Chart.js 实例。
 */
export function destroyAllCharts() {
    Object.entries(chartInstances).forEach(([name, chart]) => {
        try { chart.destroy(); } catch (_) {}
    });
    Object.keys(chartInstances).forEach(key => delete chartInstances[key]);
}

/**
 * 蒙特卡洛6个月预测组件 — 扇形分位数图 + 置信度仪表盘。
 *
 * 通过 Chart.js Line Chart 的 fill 属性实现扇形（Fan Chart）效果，
 * 相邻分位数线之间使用 Canvas 渐变填充；置信度仪表盘使用 Canvas 手绘。
 *
 * @exports renderForecast(container, data)
 * @exports destroyForecastCharts()
 */
import { setChartInstance, chartInstances } from './state.js';

// ===== 样式常量 =====

const FORECAST_CSS = `
.dash-forecast-wrap { display: flex; flex-direction: column; gap: 14px; }
.dash-forecast-tabs { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.dash-forecast-tab {
    background: var(--bg); border: 1px solid var(--border);
    color: var(--text3); font-size: 11px; font-weight: 600;
    padding: 5px 12px; border-radius: 16px; cursor: pointer;
    transition: all .15s; white-space: nowrap;
}
.dash-forecast-tab:hover { color: var(--text); border-color: var(--primary); }
.dash-forecast-tab.active {
    background: var(--primary); color: #fff; border-color: var(--primary);
}
.dash-forecast-mode-btn {
    background: none; border: 1px solid var(--border);
    color: var(--text3); font-size: 10px; padding: 4px 10px;
    border-radius: 12px; cursor: pointer; margin-left: auto;
    transition: all .15s; white-space: nowrap;
}
.dash-forecast-mode-btn:hover { color: var(--primary); border-color: var(--primary); }
.dash-forecast-mode-btn .mode-arrow { display: inline-block; transition: transform .2s; }
.dash-forecast-mode-btn .mode-arrow.flipped { transform: rotate(180deg); }
.dash-forecast-chart-area { height: 260px; position: relative; }
.dash-forecast-bottom { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.dash-forecast-gauge-area { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; }
.dash-gauge-label { font-size: 11px; color: var(--text3); margin-top: 6px; text-align: center; }
.dash-gauge-score { font-size: 14px; font-weight: 800; margin-top: 2px; }
.dash-forecast-stats { flex: 1; min-width: 180px; }
.dash-forecast-stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.dash-stat-card {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 10px; text-align: center;
}
.dash-stat-card-label { font-size: 10px; color: var(--text3); margin-bottom: 3px; }
.dash-stat-card-value { font-size: 15px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
.dash-stat-card-value.up { color: var(--up, #ff6b7a); }
.dash-stat-card-value.down { color: var(--down, #35e89b); }
`;

/** 渐变色层次：[outerColor, innerColor] */
const FAN_GRADIENTS = [
    ['rgba(59,130,246,0.13)', 'rgba(59,130,246,0.04)'],
    ['rgba(59,130,246,0.22)', 'rgba(59,130,246,0.07)'],
    ['rgba(59,130,246,0.22)', 'rgba(59,130,246,0.07)'],
    ['rgba(59,130,246,0.13)', 'rgba(59,130,246,0.04)'],
];

// ===== 辅助函数 =====

function confidenceLabel(score) {
    if (score >= 75) return '高置信度';
    if (score >= 55) return '中等置信度';
    if (score >= 35) return '低置信度';
    return '极低置信度';
}

function confidenceColor(score) {
    if (score >= 75) return '#22c55e';
    if (score >= 55) return '#f5a623';
    if (score >= 35) return '#ef5350';
    return '#e74c3c';
}

/**
 * 创建 canvas 线性渐变（从上到下），用于扇形填充。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} h - canvas 像素高度
 * @param {string} c0 - 顶部颜色
 * @param {string} c1 - 底部颜色
 * @returns {CanvasGradient}
 */
function makeGradient(ctx, h, c0, c1) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    return g;
}

// ===== Canvas 置信度仪表盘 =====

function drawConfidenceGauge(canvas, score) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H * 0.65;
    const r = Math.min(W, H) * 0.38, lw = 12;

    ctx.clearRect(0, 0, W, H);

    // 背景弧
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 分段颜色
    const segs = [
        { end: 0.35, color: '#e74c3c' },
        { end: 0.55, color: '#ef5350' },
        { end: 0.75, color: '#f5a623' },
        { end: 1.0,  color: '#22c55e' },
    ];
    let prev = Math.PI;
    segs.forEach(s => {
        const angle = Math.PI + s.end * Math.PI;
        ctx.beginPath();
        ctx.arc(cx, cy, r, prev, angle, false);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = lw;
        ctx.lineCap = 'butt';
        ctx.stroke();
        prev = angle;
    });

    // 指针
    const a = Math.PI + (score / 100) * Math.PI;
    const nx = cx + (r - 22) * Math.cos(a);
    const ny = cy + (r - 22) * Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 中心圆
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
}

// ===== 主渲染函数 =====

/**
 * 渲染蒙特卡洛预测区。
 * @param {HTMLElement} container - 宿主容器
 * @param {Object} data - /api/forecast 接口返回数据
 */
export function renderForecast(container, data) {
    if (!container) return;

    if (!data) {
        container.innerHTML =
            '<div class="dash-section-title">蒙特卡洛预测</div>'
            + '<div class="dash-empty">暂无预测数据</div>';
        return;
    }

    // 注入样式（一次性）
    if (!document.getElementById('dashForecastCSS')) {
        const style = document.createElement('style');
        style.id = 'dashForecastCSS';
        style.textContent = FORECAST_CSS;
        document.head.appendChild(style);
    }

    container.innerHTML =
        '<div class="dash-section-title">蒙特卡洛预测'
        + '<span class="dash-section-sub">基于历史模拟的6个月展望</span></div>'
        + '<div class="dash-forecast-wrap">'
        +   '<div class="dash-forecast-tabs" id="forecastTabs">'
        +     '<button class="dash-forecast-tab" data-range="1m">1个月</button>'
        +     '<button class="dash-forecast-tab" data-range="3m">3个月</button>'
        +     '<button class="dash-forecast-tab" data-range="6m">6个月</button>'
        +     '<button class="dash-forecast-mode-btn" id="forecastModeBtn">'
        +       '百分比 <span class="mode-arrow">&#9650;</span></button>'
        +   '</div>'
        +   '<div class="dash-forecast-chart-area">'
        +     '<canvas id="forecastFanChart"></canvas>'
        +   '</div>'
        +   '<div class="dash-forecast-bottom">'
        +     '<div class="dash-forecast-gauge-area">'
        +       '<canvas id="forecastGauge" width="200" height="120"></canvas>'
        +       '<div class="dash-gauge-label" id="gaugeLabel"></div>'
        +       '<div class="dash-gauge-score" id="gaugeScore"></div>'
        +     '</div>'
        +     '<div class="dash-forecast-stats" id="forecastStats"></div>'
        +   '</div>'
        +   '<div class="dash-forecast-disclaimer" style="font-size:10px;color:var(--text3);line-height:1.5">'
        +     (data.disclaimer || '') + '</div>'
        + '</div>';

    // ---- 内部状态 ----
    let activeRange = '6m';
    let showPercent = true;

    // ---- 绘制置信度仪表盘 ----
    const score = (data.parameters && data.parameters.confidence) || 0;
    const gaugeCanvas = container.querySelector('#forecastGauge');
    drawConfidenceGauge(gaugeCanvas, score);
    const labelEl = container.querySelector('#gaugeLabel');
    const scoreEl = container.querySelector('#gaugeScore');
    if (labelEl) labelEl.textContent = confidenceLabel(score);
    if (scoreEl) { scoreEl.textContent = score + '/100'; scoreEl.style.color = confidenceColor(score); }

    // ---- 更新统计参数 ----
    function updateStats(p) {
        const el = container.querySelector('#forecastStats');
        if (!el || !p) return;
        const mu = Number(p.portfolio_mu) || 0;
        const sigma = Number(p.portfolio_sigma) || 0;
        const muCls = mu >= 0 ? 'up' : 'down';
        el.innerHTML =
            '<div class="dash-forecast-stats-grid">'
            +   `<div class="dash-stat-card"><div class="dash-stat-card-label">年化期望收益</div>`
            +   `<div class="dash-stat-card-value ${muCls}">${mu > 0 ? '+' : ''}${mu.toFixed(1)}%</div></div>`
            +   `<div class="dash-stat-card"><div class="dash-stat-card-label">年化波动率</div>`
            +   `<div class="dash-stat-card-value">${sigma.toFixed(1)}%</div></div>`
            +   `<div class="dash-stat-card"><div class="dash-stat-card-label">模拟路径数</div>`
            +   `<div class="dash-stat-card-value">${(data.simulation_paths || 0).toLocaleString()}</div></div>`
            +   `<div class="dash-stat-card"><div class="dash-stat-card-label">信号评分</div>`
            +   `<div class="dash-stat-card-value">${p.signal_score ?? '--'}</div></div>`
            + '</div>';
    }
    updateStats(data.parameters);

    // ---- 计算图数据 ----
    function computeChartData() {
        const fc = data.forecasts;
        if (!fc) return null;
        const curVal = Number(data.current_value) || 100000;
        const horizons = ['1m', '3m', '6m'];
        const hi = horizons.indexOf(activeRange);
        const labels = ['今天'];
        for (let i = 0; i <= hi; i++) labels.push({ '1m': '1个月', '3m': '3个月', '6m': '6个月' }[horizons[i]]);
        const pcts = [[0]];
        for (let qi = 0; qi < 5; qi++) pcts.push([0]);
        const keys = ['p95', 'p75', 'median', 'p25', 'p5'];
        for (let i = 0; i <= hi; i++) {
            const q = fc[horizons[i]];
            if (!q) break;
            keys.forEach((k, qi) => pcts[qi].push(Number(q[k]) || 0));
        }
        if (showPercent) return { labels, datasets: pcts, isPercent: true };
        const abs = pcts.map(arr => arr.map((v, i) => i === 0 ? curVal : curVal * (1 + v / 100)));
        return { labels, datasets: abs, isPercent: false };
    }

    // ---- 创建 / 更新 Chart.js ----
    function updateFanChart() {
        if (chartInstances['forecastFan']) {
            try { chartInstances['forecastFan'].destroy(); } catch (_) {}
        }
        const canvas = container.querySelector('#forecastFanChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const chartData = computeChartData();
        if (!chartData) return;
        const { labels, datasets, isPercent } = chartData;
        const h = canvas.parentElement.clientHeight || 260;

        const bandDefs = [
            { label: '95分位', data: datasets[0], borderWidth: 1.5, borderColor: 'rgba(59,130,246,0.35)', borderDash: [4, 3], pointRadius: 0, fill: '+1' },
            { label: '75分位', data: datasets[1], borderWidth: 2,   borderColor: 'rgba(59,130,246,0.5)',   pointRadius: 0, fill: '+1' },
            { label: '25分位', data: datasets[3], borderWidth: 2,   borderColor: 'rgba(59,130,246,0.5)',   pointRadius: 0, fill: '+1' },
            { label: '5分位',  data: datasets[4], borderWidth: 1.5, borderColor: 'rgba(59,130,246,0.35)', borderDash: [4, 3], pointRadius: 0 },
            { label: '中位数', data: datasets[2], borderWidth: 2.5, borderColor: '#3b82f6', pointRadius: 3, pointBackgroundColor: '#3b82f6', fill: false, order: -1 },
        ];

        const datasets_ = bandDefs.map((d, i) => ({
            label: d.label,
            data: d.data,
            borderWidth: d.borderWidth,
            borderColor: d.borderColor,
            borderDash: d.borderDash || [],
            pointRadius: d.pointRadius,
            pointBackgroundColor: d.pointBackgroundColor,
            fill: d.fill || false,
            order: d.order || 0,
            backgroundColor: d.fill ? makeGradient(ctx, h, FAN_GRADIENTS[i][0], FAN_GRADIENTS[i][1]) : 'transparent',
            tension: 0.3,
            spanGaps: true,
        }));

        const chart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: datasets_ },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'top', labels: { boxWidth: 14, font: { size: 10 }, padding: 8, usePointStyle: true } },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.82)', titleFont: { size: 12, weight: 'bold' }, bodyFont: { size: 11 },
                        padding: 10, cornerRadius: 8,
                        callbacks: {
                            label(ctx2) {
                                const v = ctx2.parsed.y;
                                return ctx2.dataset.label + ': ' + (isPercent ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : v.toLocaleString('zh-CN', { maximumFractionDigits: 0 }));
                            },
                        },
                    },
                },
                scales: {
                    x: { grid: { color: 'rgba(125,211,252,.1)' }, ticks: { font: { size: 11 }, color: '#8fb6d8' } },
                    y: {
                        grid: { color: 'rgba(125,211,252,.1)' },
                        ticks: {
                            font: { size: 10 }, color: '#8fb6d8',
                            callback: v => isPercent ? v.toFixed(1) + '%' : (v / 10000).toFixed(1) + '万',
                        },
                    },
                },
            },
        });

        setChartInstance('forecastFan', chart);
    }

    updateFanChart();

    // ---- 事件绑定 ----
    const tabsEl = container.querySelector('#forecastTabs');
    if (tabsEl) {
        tabsEl.addEventListener('click', e => {
            const tab = e.target.closest('.dash-forecast-tab');
            if (!tab) return;
            tabsEl.querySelectorAll('.dash-forecast-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeRange = tab.dataset.range;
            updateFanChart();
        });
    }

    const modeBtn = container.querySelector('#forecastModeBtn');
    if (modeBtn) {
        modeBtn.addEventListener('click', () => {
            showPercent = !showPercent;
            modeBtn.innerHTML = (showPercent ? '百分比' : '绝对值')
                + ' <span class="mode-arrow' + (showPercent ? '' : ' flipped') + '">&#9650;</span>';
            updateFanChart();
        });
    }

    // 默认选中 6m
    const defTab = container.querySelector('.dash-forecast-tab[data-range="6m"]');
    if (defTab) defTab.click();
}

/**
 * 销毁蒙特卡洛预测相关的 Chart.js 实例。
 */
export function destroyForecastCharts() {
    ['forecastFan'].forEach(name => {
        if (chartInstances[name]) {
            try { chartInstances[name].destroy(); } catch (_) {}
            delete chartInstances[name];
        }
    });
}

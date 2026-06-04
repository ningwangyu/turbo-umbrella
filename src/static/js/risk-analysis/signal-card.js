/**
 * 信号健康评分卡模块 — 组合健康状态汇总 + 基金信号卡片网格展示。
 *
 * 设计要点：
 *   - 顶部汇总栏：组合健康状态图标、信号分数、状态分布统计。
 *   - 基金信号网格：每张卡片含半圆仪表盘、交通灯指示器、信号文本、趋势箭头、权重。
 *   - 可展开详情面板：点击卡片展开五因子明细表格（分数条 + 详情说明）。
 *   - 按状态严重程度排序：alert > caution > neutral > healthy。
 *   - 仪表盘动画：分数从 0 平滑动画到实际值。
 */

// ==================== 状态排序优先级 ====================
const STATUS_ORDER = { alert: 0, caution: 1, neutral: 2, healthy: 3 };

// ==================== 交通灯颜色映射 ====================
const STATUS_COLORS = {
    healthy: '#35e89b',
    neutral: '#f5a623',
    caution: '#ff6b7a',
    alert: '#ff3b30'
};

const STATUS_LABELS = {
    healthy: '健康',
    neutral: '中性',
    caution: '谨慎',
    alert: '警告'
};

// ==================== 健康状态大图标 ====================
const HEALTH_ICONS = {
    healthy: `<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="22" fill="${STATUS_COLORS.healthy}" opacity=".15"/><path d="M16 24l5 5 11-11" stroke="${STATUS_COLORS.healthy}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    neutral: `<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="22" fill="${STATUS_COLORS.neutral}" opacity=".15"/><line x1="16" y1="24" x2="32" y2="24" stroke="${STATUS_COLORS.neutral}" stroke-width="3" stroke-linecap="round"/></svg>`,
    caution: `<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="22" fill="${STATUS_COLORS.caution}" opacity=".15"/><path d="M24 16v10" stroke="${STATUS_COLORS.caution}" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="32" r="2" fill="${STATUS_COLORS.caution}"/></svg>`,
    alert: `<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="22" fill="${STATUS_COLORS.alert}" opacity=".15"/><path d="M18 18l12 12M30 18l-12 12" stroke="${STATUS_COLORS.alert}" stroke-width="3" stroke-linecap="round"/></svg>`
};

// ==================== 趋势箭头映射 ====================
function getTrendArrow(trend) {
    if (trend === '↑' || trend === 'up') return { symbol: '↑', cls: 'up', label: '升级' };
    if (trend === '↓' || trend === 'down') return { symbol: '↓', cls: 'down', label: '降级' };
    return { symbol: '→', cls: 'flat', label: '稳定' };
}

// ==================== 排序逻辑 ====================
function sortBySeverity(funds) {
    return [...funds].sort((a, b) => {
        const oa = STATUS_ORDER[a.status] ?? 99;
        const ob = STATUS_ORDER[b.status] ?? 99;
        if (oa !== ob) return oa - ob;
        return (b.buy_score || 0) - (a.buy_score || 0);
    });
}

// ==================== 仪表盘 Canvas 实例管理 ====================
const gaugeAnimations = new Map();

/**
 * 销毁所有信号评分卡相关的图表/动画。
 */
export function destroySignalScorecardCharts() {
    gaugeAnimations.forEach(id => cancelAnimationFrame(id));
    gaugeAnimations.clear();
}

// ==================== 半圆仪表盘绘制 ====================
function drawGauge(canvas, score, animate) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H * 0.6;
    const r = Math.min(W, H) * 0.38;
    const lw = Math.max(3, r * 0.16);

    function render(currentScore) {
        ctx.clearRect(0, 0, W, H);

        // 背景弧
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, 0, false);
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.stroke();

        // 分段颜色弧
        const segments = [
            { end: 0.3, color: '#35e89b' },
            { end: 0.5, color: '#f5a623' },
            { end: 0.7, color: '#ff6b7a' },
            { end: 1.0, color: '#ff3b30' }
        ];
        let prevEnd = Math.PI;
        const filledAngle = Math.PI + (currentScore / 100) * Math.PI;
        segments.forEach(seg => {
            const segAngle = Math.PI + seg.end * Math.PI;
            const drawEnd = Math.min(segAngle, filledAngle);
            if (drawEnd > prevEnd) {
                ctx.beginPath();
                ctx.arc(cx, cy, r, prevEnd, drawEnd, false);
                ctx.strokeStyle = seg.color;
                ctx.lineWidth = lw;
                ctx.lineCap = 'butt';
                ctx.stroke();
            }
            prevEnd = segAngle;
        });

        // 指针
        const needleAngle = Math.PI + (currentScore / 100) * Math.PI;
        const nx = cx + (r - lw) * Math.cos(needleAngle);
        const ny = cy + (r - lw) * Math.sin(needleAngle);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();

        // 中心圆
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();

        // 分数文字
        ctx.fillStyle = '#333';
        ctx.font = `bold ${Math.max(10, r * 0.35)}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(currentScore), cx, cy + r * 0.45);
    }

    if (animate) {
        const id = canvas.dataset.gaugeId || Math.random().toString(36).slice(2);
        canvas.dataset.gaugeId = id;
        const start = performance.now();
        const duration = 800;
        function step(ts) {
            const progress = Math.min((ts - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            render(eased * score);
            if (progress < 1) {
                const rafId = requestAnimationFrame(step);
                gaugeAnimations.set(id, rafId);
            } else {
                gaugeAnimations.delete(id);
            }
        }
        const rafId = requestAnimationFrame(step);
        gaugeAnimations.set(id, rafId);
    } else {
        render(score);
    }
}

// ==================== 顶部汇总栏 HTML ====================
function buildSummaryBar(data) {
    const status = data.portfolio_health || 'neutral';
    const score = data.portfolio_buy_score ?? '--';
    const healthy = data.healthy_count ?? 0;
    const neutral = data.neutral_count ?? 0;
    const caution = data.caution_count ?? 0;
    const alert = data.alert_count ?? 0;
    const icon = HEALTH_ICONS[status] || HEALTH_ICONS.neutral;
    const statusLabel = STATUS_LABELS[status] || '未知';
    const statusColor = STATUS_COLORS[status] || STATUS_COLORS.neutral;

    return `
    <div class="sc-summary-bar">
        <div class="sc-summary-health">
            <div class="sc-health-icon">${icon}</div>
            <div class="sc-health-info">
                <div class="sc-health-label">组合健康状态</div>
                <div class="sc-health-status" style="color:${statusColor}">${statusLabel}</div>
            </div>
        </div>
        <div class="sc-summary-score">
            <div class="sc-score-label">组合信号分数</div>
            <div class="sc-score-value">${typeof score === 'number' ? score.toFixed(1) : score}<span class="sc-score-unit">/100</span></div>
        </div>
        <div class="sc-summary-distribution">
            <div class="sc-dist-label">状态分布</div>
            <div class="sc-dist-items">
                <span class="sc-dist-item"><span class="sc-dot" style="background:${STATUS_COLORS.healthy}"></span>健康(${healthy})</span>
                <span class="sc-dist-item"><span class="sc-dot" style="background:${STATUS_COLORS.neutral}"></span>中性(${neutral})</span>
                <span class="sc-dist-item"><span class="sc-dot" style="background:${STATUS_COLORS.caution}"></span>谨慎(${caution})</span>
                <span class="sc-dist-item"><span class="sc-dot" style="background:${STATUS_COLORS.alert}"></span>警告(${alert})</span>
            </div>
        </div>
        <div class="sc-summary-time">${data.updated_at || ''}</div>
    </div>`;
}

// ==================== 单张基金卡片 HTML ====================
function buildFundCard(fund, index) {
    const status = fund.status || 'neutral';
    const statusColor = STATUS_COLORS[status] || STATUS_COLORS.neutral;
    const statusLabel = STATUS_LABELS[status] || '未知';
    const trend = getTrendArrow(fund.trend);
    const change = fund.trend_change ?? 0;
    const changeStr = change > 0 ? `+${change}` : `${change}`;
    const changeCls = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    const factorsHTML = buildFactorsHTML(fund.factors);

    return `
    <div class="sc-card" data-index="${index}" data-status="${status}">
        <div class="sc-card-header">
            <div class="sc-card-name" title="${fund.code || ''}">${fund.name || '--'}</div>
            <div class="sc-card-code">${fund.code || ''}</div>
        </div>
        <div class="sc-card-gauge-wrap">
            <canvas class="sc-gauge-canvas" width="160" height="100"></canvas>
        </div>
        <div class="sc-card-status">
            <span class="sc-traffic-light" style="background:${statusColor}"></span>
            <span class="sc-status-text" style="color:${statusColor}">${statusLabel}</span>
        </div>
        <div class="sc-card-signal">${fund.signal || '--'}</div>
        <div class="sc-card-trend">
            <span class="sc-trend-arrow ${trend.cls}" title="7天前：${(fund.buy_score || 0) - change}分 → 现在：${fund.buy_score || 0}分">${trend.symbol}</span>
            <span class="sc-trend-change ${changeCls}">${changeStr}分</span>
        </div>
        <div class="sc-card-weight">权重 ${typeof fund.weight === 'number' ? fund.weight.toFixed(1) : (fund.weight || '--')}%</div>
        <div class="sc-card-expand-hint">点击展开详情</div>
        <div class="sc-card-detail">${factorsHTML}</div>
    </div>`;
}

// ==================== 因子明细 HTML ====================
function buildFactorsHTML(factors) {
    if (!factors || !factors.length) return '';
    let html = '<div class="sc-factor-table">';
    html += '<div class="sc-factor-header"><span>因子</span><span>分数</span><span>说明</span></div>';
    factors.forEach(f => {
        const score = f.score ?? 0;
        const barColor = score >= 60 ? '#35e89b' : score >= 40 ? '#f5a623' : '#ff6b7a';
        html += `
        <div class="sc-factor-row">
            <span class="sc-factor-name">${f.name || '--'}</span>
            <div class="sc-factor-bar-wrap">
                <div class="sc-factor-bar-bg">
                    <div class="sc-factor-bar-fill" style="width:${Math.max(3, Math.min(100, score))}%;background:${barColor}"></div>
                </div>
                <span class="sc-factor-score">${score}</span>
            </div>
            <span class="sc-factor-detail">${f.detail || ''}</span>
        </div>`;
    });
    html += '</div>';
    return html;
}

// ==================== 主渲染函数 ====================

/**
 * 渲染信号健康评分卡到指定容器。
 * @param {HTMLElement} container - 承载评分卡的 DOM 容器
 * @param {Object} data - API 返回的信号数据
 */
export function renderSignalScorecard(container, data) {
    if (!container) return;
    destroySignalScorecardCharts();

    if (!data || data.error) {
        container.innerHTML = '<div class="sc-empty">暂无信号数据</div>';
        return;
    }

    const funds = sortBySeverity(data.funds || []);

    // 构建完整 HTML
    let html = buildSummaryBar(data);
    html += '<div class="sc-grid">';
    funds.forEach((fund, i) => {
        html += buildFundCard(fund, i);
    });
    html += '</div>';

    container.innerHTML = html;

    // 绘制仪表盘（动画）
    const cards = container.querySelectorAll('.sc-card');
    cards.forEach((card, i) => {
        const canvas = card.querySelector('.sc-gauge-canvas');
        const fund = funds[i];
        if (canvas && fund) {
            drawGauge(canvas, fund.buy_score || 0, true);
        }
    });

    // 绑定卡片点击展开/收起
    container.querySelectorAll('.sc-card').forEach(card => {
        card.addEventListener('click', function () {
            const detail = this.querySelector('.sc-card-detail');
            const hint = this.querySelector('.sc-card-expand-hint');
            if (!detail) return;
            const isOpen = detail.classList.toggle('show');
            this.classList.toggle('expanded', isOpen);
            if (hint) hint.textContent = isOpen ? '点击收起' : '点击展开详情';
        });
    });
}

// ==================== 注入样式（幂等） ====================
const STYLE_ID = 'signal-card-styles';

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
/* ===== 信号评分卡 - 汇总栏 ===== */
.sc-summary-bar {
    background: var(--card, #fff); border-radius: var(--radius, 12px);
    padding: 12px 14px; box-shadow: var(--shadow, 0 1px 4px rgba(0,0,0,.08));
    display: flex; align-items: center; flex-wrap: wrap; gap: 16px;
    margin-bottom: 12px;
}
.sc-summary-health {
    display: flex; align-items: center; gap: 10px;
}
.sc-health-icon { flex-shrink: 0; line-height: 0; }
.sc-health-info { display: flex; flex-direction: column; }
.sc-health-label { font-size: 11px; color: var(--text3, #999); margin-bottom: 2px; }
.sc-health-status { font-size: 16px; font-weight: 800; }

.sc-summary-score { text-align: center; min-width: 100px; }
.sc-score-label { font-size: 11px; color: var(--text3, #999); margin-bottom: 2px; }
.sc-score-value { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--text, #333); }
.sc-score-unit { font-size: 13px; font-weight: 500; color: var(--text3, #999); margin-left: 2px; }

.sc-summary-distribution { display: flex; flex-direction: column; gap: 4px; }
.sc-dist-label { font-size: 11px; color: var(--text3, #999); }
.sc-dist-items { display: flex; gap: 12px; flex-wrap: wrap; }
.sc-dist-item { font-size: 12px; color: var(--text2, #666); display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.sc-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

.sc-summary-time { font-size: 10px; color: var(--text3, #bbb); margin-left: auto; white-space: nowrap; }

/* ===== 信号评分卡 - 网格 ===== */
.sc-grid {
    display: grid; gap: 10px;
    grid-template-columns: repeat(3, 1fr);
}
@media (max-width: 1100px) { .sc-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px)  { .sc-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px)  { .sc-grid { grid-template-columns: 1fr; } }

/* ===== 单张卡片 ===== */
.sc-card {
    background: var(--card, #fff); border-radius: var(--radius, 12px);
    padding: 12px 10px; box-shadow: var(--shadow, 0 1px 4px rgba(0,0,0,.08));
    cursor: pointer; transition: transform .15s, box-shadow .15s;
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    border-left: 4px solid transparent;
    position: relative;
}
.sc-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0,0,0,.12);
}
.sc-card[data-status="healthy"] { border-left-color: ${STATUS_COLORS.healthy}; }
.sc-card[data-status="neutral"] { border-left-color: ${STATUS_COLORS.neutral}; }
.sc-card[data-status="caution"] { border-left-color: ${STATUS_COLORS.caution}; }
.sc-card[data-status="alert"]   { border-left-color: ${STATUS_COLORS.alert}; }

.sc-card-header { text-align: center; width: 100%; }
.sc-card-name {
    font-size: 14px; font-weight: 700; color: var(--text, #333);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sc-card-code { font-size: 10px; color: var(--text3, #999); margin-top: 1px; }

.sc-card-gauge-wrap { width: 100%; display: flex; justify-content: center; }
.sc-gauge-canvas { width: 130px; height: 82px; }

.sc-card-status {
    display: flex; align-items: center; gap: 5px;
}
.sc-traffic-light {
    width: 10px; height: 10px; border-radius: 50%; display: inline-block;
    box-shadow: 0 0 4px rgba(0,0,0,.15);
}
.sc-status-text { font-size: 12px; font-weight: 700; }

.sc-card-signal {
    font-size: 13px; font-weight: 600; color: var(--text2, #555);
    background: var(--bg, #f5f5f5); padding: 3px 10px; border-radius: 6px;
}

.sc-card-trend {
    display: flex; align-items: center; gap: 4px; font-size: 12px;
}
.sc-trend-arrow { font-size: 16px; font-weight: 700; }
.sc-trend-arrow.up { color: var(--up, #35e89b); }
.sc-trend-arrow.down { color: var(--down, #ff6b7a); }
.sc-trend-arrow.flat { color: var(--flat, #999); }
.sc-trend-change { font-weight: 600; font-variant-numeric: tabular-nums; }
.sc-trend-change.up { color: var(--up, #35e89b); }
.sc-trend-change.down { color: var(--down, #ff6b7a); }
.sc-trend-change.flat { color: var(--flat, #999); }

.sc-card-weight {
    font-size: 11px; color: var(--text3, #999);
}

.sc-card-expand-hint {
    font-size: 10px; color: var(--text3, #bbb); margin-top: 2px;
    transition: color .15s;
}
.sc-card:hover .sc-card-expand-hint { color: var(--primary, #1a73e8); }

/* ===== 详情面板（默认隐藏，点击展开） ===== */
.sc-card-detail {
    width: 100%; max-height: 0; overflow: hidden;
    transition: max-height .35s ease, opacity .25s ease;
    opacity: 0;
}
.sc-card-detail.show {
    max-height: 400px; opacity: 1; margin-top: 8px;
}

/* ===== 因子明细表格 ===== */
.sc-factor-table {
    background: var(--bg, #f9f9f9); border-radius: 8px;
    padding: 8px 10px; font-size: 11px;
}
.sc-factor-header {
    display: grid; grid-template-columns: 50px 1fr 60px; gap: 6px;
    padding-bottom: 5px; margin-bottom: 4px;
    border-bottom: 1px solid var(--border, #eee);
    font-weight: 700; color: var(--text3, #999); font-size: 10px;
}
.sc-factor-row {
    display: grid; grid-template-columns: 50px 1fr 60px; gap: 6px;
    align-items: center; padding: 4px 0;
}
.sc-factor-name {
    font-weight: 600; color: var(--text2, #555);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sc-factor-bar-wrap {
    display: flex; align-items: center; gap: 5px;
}
.sc-factor-bar-bg {
    flex: 1; height: 6px; background: var(--border, #eee); border-radius: 3px;
    overflow: hidden;
}
.sc-factor-bar-fill {
    height: 100%; border-radius: 3px;
    transition: width .5s ease;
}
.sc-factor-score {
    font-weight: 700; font-variant-numeric: tabular-nums;
    color: var(--text2, #555); min-width: 22px; text-align: right;
}
.sc-factor-detail {
    font-size: 10px; color: var(--text3, #999);
    text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ===== 空状态 ===== */
.sc-empty {
    text-align: center; color: var(--text3, #999);
    padding: 40px 16px; font-size: 13px;
}
`;
    document.head.appendChild(style);
}

// 模块加载时自动注入样式
injectStyles();

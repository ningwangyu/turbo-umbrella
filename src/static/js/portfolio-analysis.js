/**
 * 组合分析模块 — 板块分布、可展开重叠持仓、多样化评分、风险指标
 * 基金属性优先分类、点击展开明细、?号帮助提示、1年评估期
 */
import { holdings } from './state.js';
import { fmtMoney, colorCls, showToast } from './utils.js';

let analysisData = null;

// 帮助提示内容
const HELP_TEXTS = {
    sharpe: 'Sharpe比率衡量每承担一单位风险所获得的超额收益。计算公式：(组合收益 - 无风险利率) / 波动率。>1为优秀，0.5-1为良好，<0.5为一般，<0为较差。无风险利率按年化2%计算。',
    hhi: 'HHI指数（赫芬达尔指数）衡量板块集中度。计算方式为各板块权重的平方和。HHI越接近0表示越分散，越接近1表示越集中。多样化评分 = (1 - HHI) × 100。',
    volatility: '年化波动率衡量组合收益率的波动程度，由日收益率标准差年化得到（×√252）。波动率越高，风险越大。一般>25%为高波动，15-25%为中等，<15%为低波动。',
    drawdown: '最大回撤是从历史最高点到最低点的最大跌幅，衡量最坏情况下的损失。此处显示的是"持有组合最大回撤"，即按持仓权重加权后的组合净值近1年最大回撤。点击可查看各基金独立的近1年最大回撤明细。注意：基金最大回撤与持有期间最大回撤不同，前者是基金自身近1年最高到最低的跌幅，后者取决于你的买入时点。',
};

/**
 * 获取组合分析数据
 */
export async function fetchPortfolioAnalysis() {
    if (!holdings.length) return null;
    try {
        const r = await fetch("/api/portfolio/analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ holdings: holdings.map(h => ({ code: h.code, value: h.value, profit: h.profit })) }),
        });
        if (!r.ok) throw new Error("获取分析数据失败");
        analysisData = await r.json();
        return analysisData;
    } catch (e) {
        console.error("Portfolio analysis:", e);
        return null;
    }
}

/**
 * 渲染组合分析页面
 */
export function renderPortfolioAnalysis(container) {
    if (!analysisData) {
        container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载中...</div>';
        return;
    }

    let html = '<div class="portfolio-analysis">';

    // ① 风险指标卡片
    html += renderRiskSection();

    // ② 多样化评分 + 集中度
    html += renderDiversificationSection();


    // ③ 板块分布
    html += renderSectorSection();

    // ④ 资产配置分布（点击展开明细）
    html += renderTypeSection();

    // ⑤ 重叠持仓（可展开）
    html += renderOverlapSection();

    html += '</div>';
    container.innerHTML = html;

    requestAnimationFrame(() => {
        renderSectorChart();
        renderTypePieChart();
    });

    bindAllEvents(container);
}

// ==================== 帮助提示弹窗 ====================
function showHelpTip(key) {
    const text = HELP_TEXTS[key];
    if (!text) return;
    // 移除已有的
    const existing = document.getElementById('helpTipOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'helpTipOverlay';
    overlay.className = 'help-tip-overlay';
    overlay.innerHTML = `<div class="help-tip-box">
        <div class="help-tip-content">${text}</div>
        <button class="help-tip-close" id="helpTipClose">知道了</button>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.id === 'helpTipClose') overlay.remove(); });
}

// ==================== ① 风险指标 ====================
function renderRiskSection() {
    const rm = analysisData.risk_metrics;
    if (!rm || rm.volatility === null) return '';

    const evalDays = rm.days || 0;
    const evalLabel = evalDays >= 200 ? `约${Math.round(evalDays/21)}个月` : `${evalDays}天`;

    return `<div class="pa-risk-metrics">
        <div class="pa-risk-card">
            <div class="pa-risk-label">年化波动率</div>
            <div class="pa-risk-value ${rm.volatility > 25 ? 'up' : rm.volatility > 15 ? '' : 'down'}">${rm.volatility}%</div>
            <span class="pa-help-btn" data-help="volatility">?</span>
        </div>
        <div class="pa-risk-card pa-clickable" data-action="showDrawdown">
            <div class="pa-risk-label">持有组合最大回撤<span style="font-size:9px;color:var(--text3)">（近1年）</span></div>
            <div class="pa-risk-value up">${rm.max_drawdown}%</div>
            <span class="pa-help-btn" data-help="drawdown">?</span>
            <div class="pa-click-hint">点击查看各基金回撤明细</div>
        </div>
        <div class="pa-risk-card">
            <div class="pa-risk-label">Sharpe比率</div>
            <div class="pa-risk-value ${rm.sharpe > 1 ? 'down' : rm.sharpe > 0 ? '' : 'up'}">${rm.sharpe}</div>
            <span class="pa-help-btn" data-help="sharpe">?</span>
        </div>
        <div class="pa-risk-card">
            <div class="pa-risk-label">评估周期</div>
            <div class="pa-risk-value" style="color:var(--text2);font-size:14px">近1年</div>
            <div class="pa-risk-sub">${evalLabel}</div>
        </div>
    </div>`;
}

// ==================== 回撤明细弹窗 ====================
function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function showDrawdownDetail() {
    const dd = analysisData.drawdown_detail;
    const rm = analysisData.risk_metrics;
    if (!rm || rm.max_drawdown === null) {
        showToast('暂无回撤数据');
        return;
    }

    const existing = document.getElementById('ddModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ddModalOverlay';
    overlay.className = 'pa-dd-overlay';

    const peakDate = dd ? formatDate(dd.peak_date) : '--';
    const troughDate = dd ? formatDate(dd.trough_date) : '--';
    const daysDiff = dd ? Math.round((new Date(dd.trough_date) - new Date(dd.peak_date)) / 86400000) : 0;

    let html = `<div class="pa-dd-modal">
        <div class="pa-dd-modal-header">
            <span class="pa-dd-modal-title">组合最大回撤分析</span>
            <button class="pa-dd-close-x" id="ddCloseX">&times;</button>
        </div>
        <div class="pa-dd-modal-body">`;

    if (dd && analysisData.portfolio_nav_trend && analysisData.portfolio_nav_trend.length) {
        // --- 关键指标条 ---
        html += `<div class="pa-dd-stats-bar">
            <div class="pa-dd-stat-item">
                <span class="pa-dd-stat-label">组合最大回撤</span>
                <span class="pa-dd-stat-value up">${dd.portfolio_drawdown}%</span>
            </div>
            <div class="pa-dd-stat-divider"></div>
            <div class="pa-dd-stat-item">
                <span class="pa-dd-stat-label">回撤区间</span>
                <span class="pa-dd-stat-value">${peakDate} → ${troughDate}</span>
            </div>
            <div class="pa-dd-stat-divider"></div>
            <div class="pa-dd-stat-item">
                <span class="pa-dd-stat-label">持续天数</span>
                <span class="pa-dd-stat-value">${daysDiff}天</span>
            </div>
        </div>`;

        // --- 净值走势图 ---
        html += `<div class="pa-dd-chart-section">
            <div class="pa-dd-section-title">组合净值走势（近1年）</div>
            <div class="pa-dd-chart-wrap"><canvas id="ddChart"></canvas></div>
        </div>`;

        // --- 峰谷卡片 ---
        html += `<div class="pa-dd-peak-cards">
            <div class="pa-dd-peak-card pa-dd-peak-card--peak">
                <div class="pa-dd-peak-icon">&#9650;</div>
                <div class="pa-dd-peak-info">
                    <div class="pa-dd-peak-label">峰值</div>
                    <div class="pa-dd-peak-date">${peakDate}</div>
                    <div class="pa-dd-peak-nav">净值 ${dd.peak_nav}</div>
                </div>
            </div>
            <div class="pa-dd-peak-arrow">
                <div class="pa-dd-arrow-line"></div>
                <div class="pa-dd-arrow-badge up">${dd.portfolio_drawdown}%</div>
                <div class="pa-dd-arrow-line"></div>
            </div>
            <div class="pa-dd-peak-card pa-dd-peak-card--trough">
                <div class="pa-dd-peak-icon up">&#9660;</div>
                <div class="pa-dd-peak-info">
                    <div class="pa-dd-peak-label">谷底</div>
                    <div class="pa-dd-peak-date">${troughDate}</div>
                    <div class="pa-dd-peak-nav">净值 ${dd.trough_nav}</div>
                </div>
            </div>
        </div>`;

        // --- 公式 ---
        html += `<div class="pa-dd-formula">
            回撤 = (${dd.trough_nav} - ${dd.peak_nav}) / ${dd.peak_nav} &times; 100% = <strong>${dd.portfolio_drawdown}%</strong>
        </div>`;

        // --- 各基金贡献表 ---
        if (dd.fund_contributions && dd.fund_contributions.length) {
            const totalWeighted = dd.portfolio_drawdown.toFixed(2);
            html += `<div class="pa-dd-section-title">回撤区间各基金表现</div>`;
            let rows = dd.fund_contributions.map(f => `<tr>
                <td class="pa-dd-name">${f.name}</td>
                <td class="pa-dd-weight">${f.weight}%</td>
                <td class="pa-dd-value up">${f.drawdown}%</td>
                <td class="pa-dd-value up">
                    <span class="pa-dd-contrib-bar" style="width:${Math.min(Math.abs(f.weighted_contribution) / Math.abs(totalWeighted) * 60, 60)}px"></span>
                    ${f.weighted_contribution}%
                </td>
            </tr>`).join('');
            rows += `<tr class="pa-dd-table-total">
                <td>合计</td>
                <td></td>
                <td></td>
                <td class="pa-dd-value up">${totalWeighted}%</td>
            </tr>`;
            html += `<div class="pa-dd-table-wrap">
                <table class="pa-dd-table">
                    <thead><tr><th>基金名称</th><th>权重</th><th>区间回撤</th><th>加权贡献</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;

            // --- 折叠说明 ---
            html += `<div class="pa-dd-note-section">
                <div class="pa-dd-note-toggle" id="ddNoteToggle">
                    <span class="pa-dd-note-icon">&#9432;</span> 查看指标说明
                    <span class="pa-dd-note-arrow">&#9662;</span>
                </div>
                <div class="pa-dd-note-content" id="ddNoteContent" style="display:none">
                    <div><b>区间回撤</b> = 该基金在 ${peakDate} → ${troughDate} 期间的涨跌幅</div>
                    <div><b>加权贡献</b> = 区间回撤 &times; 持仓权重</div>
                    <div><b>注意：</b>各基金加权贡献之和不一定等于组合回撤 ${dd.portfolio_drawdown}%，因为各基金净值变化并非完全同步，组合回撤是逐日按权重加权各基金日收益率计算的真实值。</div>
                </div>
            </div>`;
        }
    } else {
        // --- 降级显示（无 drawdown_detail） ---
        html += `<div class="pa-dd-stats-bar">
            <div class="pa-dd-stat-item">
                <span class="pa-dd-stat-label">组合最大回撤</span>
                <span class="pa-dd-stat-value up">${rm.max_drawdown}%</span>
            </div>
            <div class="pa-dd-stat-divider"></div>
            <div class="pa-dd-stat-item">
                <span class="pa-dd-stat-label">评估周期</span>
                <span class="pa-dd-stat-value">近1年</span>
            </div>
        </div>`;
        const drawdowns = analysisData.fund_drawdowns;
        if (drawdowns && drawdowns.length) {
            html += `<div class="pa-dd-section-title">各基金近1年独立最大回撤</div>`;
            let rows = drawdowns.map(d => `<tr>
                <td class="pa-dd-name">${d.name}</td>
                <td class="pa-dd-code">${d.code}</td>
                <td class="pa-dd-weight">${d.weight}%</td>
                <td class="pa-dd-value up">${d.max_drawdown}%</td>
            </tr>`).join('');
            html += `<div class="pa-dd-table-wrap">
                <table class="pa-dd-table">
                    <thead><tr><th>基金名称</th><th>代码</th><th>持仓权重</th><th>基金最大回撤</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        }
    }

    html += `</div>
        <div class="pa-dd-modal-footer">
            <button class="pa-dd-close-btn" id="ddCloseBtn">关闭</button>
        </div>
    </div>`;
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    // 事件绑定
    const closeModal = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    overlay.querySelector('#ddCloseX').addEventListener('click', closeModal);
    overlay.querySelector('#ddCloseBtn').addEventListener('click', closeModal);

    // 折叠说明
    const noteToggle = overlay.querySelector('#ddNoteToggle');
    if (noteToggle) {
        noteToggle.addEventListener('click', () => {
            const content = overlay.querySelector('#ddNoteContent');
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';
            noteToggle.classList.toggle('pa-dd-note-open', !isVisible);
        });
    }

    // 绘制净值曲线图
    requestAnimationFrame(() => drawDDChart(dd));
}

function drawDDChart(dd) {
    const canvas = document.getElementById('ddChart');
    if (!canvas || !analysisData.portfolio_nav_trend) return;
    const trend = analysisData.portfolio_nav_trend;
    if (trend.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = Math.round(rect.width);
    const H = 200;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const pad = { t: 28, b: 28, l: 48, r: 14 };
    const cw = W - pad.l - pad.r;
    const ch = H - pad.t - pad.b;

    const navs = trend.map(t => t.nav);
    const minN = Math.min(...navs);
    const maxN = Math.max(...navs);
    const rangeN = maxN - minN || 0.01;

    const xStep = cw / (trend.length - 1);
    const toX = i => pad.l + i * xStep;
    const toY = v => pad.t + ch - (v - minN) / rangeN * ch;

    // 网格线
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#999';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const v = minN + rangeN * i / 4;
        const y = toY(v);
        ctx.fillText(v.toFixed(4), pad.l - 6, y + 3);
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(W - pad.r, y);
        ctx.strokeStyle = 'rgba(128,128,128,0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // 渐变填充
    const gradient = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    gradient.addColorStop(0, 'rgba(59,130,246,0.15)');
    gradient.addColorStop(1, 'rgba(59,130,246,0.01)');

    ctx.beginPath();
    trend.forEach((t, i) => {
        i === 0 ? ctx.moveTo(toX(i), toY(t.nav)) : ctx.lineTo(toX(i), toY(t.nav));
    });
    // 闭合填充区域
    const lastX = toX(trend.length - 1);
    const firstX = toX(0);
    const baseY = H - pad.b;
    ctx.lineTo(lastX, baseY);
    ctx.lineTo(firstX, baseY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // 画曲线
    ctx.beginPath();
    trend.forEach((t, i) => {
        i === 0 ? ctx.moveTo(toX(i), toY(t.nav)) : ctx.lineTo(toX(i), toY(t.nav));
    });
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 标注峰谷
    if (dd) {
        const peakIdx = trend.findIndex(t => t.date === dd.peak_date);
        const troughIdx = trend.findIndex(t => t.date === dd.trough_date);

        // 峰谷之间画虚线 + 半透明区域
        if (peakIdx >= 0 && troughIdx >= 0) {
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.moveTo(toX(peakIdx), toY(dd.peak_nav));
            ctx.lineTo(toX(troughIdx), toY(dd.trough_nav));
            ctx.strokeStyle = 'rgba(239,68,68,0.4)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (peakIdx >= 0) {
            const px = toX(peakIdx), py = toY(dd.peak_nav);
            ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#22c55e'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#22c55e';
            ctx.textAlign = 'center';
            ctx.fillText('峰值', px, py - 10);
        }
        if (troughIdx >= 0) {
            const tx = toX(troughIdx), ty = toY(dd.trough_nav);
            ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ef4444';
            ctx.textAlign = 'center';
            ctx.fillText('谷底', tx, ty + 16);
        }
    }

    // X轴刻度
    ctx.textAlign = 'center';
    ctx.fillStyle = '#999';
    ctx.font = '10px sans-serif';
    const step = Math.max(1, Math.floor(trend.length / 5));
    for (let i = 0; i < trend.length; i += step) {
        const d = new Date(trend[i].date);
        ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, toX(i), H - 6);
    }
}

// ==================== ② 多样化评分 ====================
function renderDiversificationSection() {
    const div = analysisData.diversification;
    const conc = analysisData.sector_concentration;
    if (!div) return '';

    const sectorCount = analysisData.sector_distribution ? analysisData.sector_distribution.length : 0;
    const fundCount = analysisData.sector_distribution
        ? analysisData.sector_distribution.reduce((sum, s) => sum + (s.fund_count || 0), 0) : 0;
    const scoreColor = div.score >= 60 ? 'down' : div.score >= 40 ? '' : 'up';
    const scoreLevel = div.score >= 80 ? '优秀' : div.score >= 60 ? '良好' : div.score >= 40 ? '一般' : div.score >= 20 ? '较差' : '集中';
    const scoreDesc = div.score >= 60 ? '分散良好' : div.score >= 40 ? '适度集中' : '集中度偏高';

    let html = `<div class="pa-div-section">
        <div class="pa-div-grid">
            <div class="pa-div-score-wrap">
                <div class="pa-div-ring">
                    <svg viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" stroke-width="8"/>
                        <circle cx="50" cy="50" r="42" fill="none"
                            stroke="${div.score >= 60 ? 'var(--down)' : div.score >= 40 ? '#f5a623' : 'var(--up)'}"
                            stroke-width="8"
                            stroke-dasharray="${(div.score / 100) * 263.9} 263.9"
                            stroke-linecap="round" transform="rotate(-90 50 50)"
                            class="pa-ring-progress"/>
                    </svg>
                    <div class="pa-div-score-num">${div.score}</div>
                </div>
                <div class="pa-div-score-label">多样化评分</div>
                <div class="pa-div-score-level ${scoreColor}">${scoreLevel}</div>
                <div class="pa-div-score-desc">${scoreDesc}</div>
            </div>
            <div class="pa-div-indicators">
                <div class="pa-div-ind">
                    <div class="pa-div-ind-label">板块数量</div>
                    <div class="pa-div-ind-value">${sectorCount}个</div>
                </div>
                <div class="pa-div-ind">
                    <div class="pa-div-ind-label">涉及基金</div>
                    <div class="pa-div-ind-value">${fundCount}只</div>
                </div>
                <div class="pa-div-ind">
                    <div class="pa-div-ind-label">
                        HHI指数
                        <span class="pa-help-btn pa-help-inline" data-help="hhi">?</span>
                    </div>
                    <div class="pa-div-ind-value">${div.hhi}</div>
                </div>
                <div class="pa-div-ind">
                    <div class="pa-div-ind-label">最大板块</div>
                    <div class="pa-div-ind-value ${conc && conc.warning ? 'up' : ''}">${conc ? conc.max_sector : '--'}</div>
                    <div class="pa-div-ind-sub">${conc ? conc.max_pct + '%' : ''}</div>
                </div>
            </div>
        </div>`;

    if (conc && conc.warning) {
        html += `<div class="pa-conc-warning">
            <span class="pa-conc-icon">&#9888;</span>
            <span>${conc.message}</span>
        </div>`;
    }

    html += `</div>`;
    return html;
}

// ==================== ③ 板块分布 ====================
function renderSectorSection() {
    const sectors = analysisData.sector_distribution;
    if (!sectors || !sectors.length) return '';

    const sectorColors = [
        '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7',
        '#06b6d4', '#d97706', '#ec4899', '#6366f1', '#14b8a6',
        '#f97316', '#64748b',
    ];

    let html = `<div class="pa-analysis-card pa-sector-section">
        <div class="pa-card-title">板块分布
            <span class="pa-card-sub">基于基金属性与重仓股行业映射</span>
        </div>
        <div class="pa-sector-layout">
            <div class="pa-sector-chart-wrap">
                <canvas id="sectorChart" width="220" height="220"></canvas>
            </div>
            <div class="pa-sector-bars">`;

    const maxWeight = sectors[0].weight;
    sectors.forEach((s, i) => {
        const barW = maxWeight > 0 ? (s.weight / maxWeight) * 100 : 0;
        const color = sectorColors[i % sectorColors.length];
        // 计算该板块涉及的基金数（funds数组 + stocks按fund_name去重）
        const fundNames = new Set();
        if (s.funds) s.funds.forEach(f => fundNames.add(f.name));
        if (s.stocks) s.stocks.forEach(st => fundNames.add(st.fund_name));
        const totalFunds = fundNames.size;
        const fundLabel = totalFunds > 0 ? `${totalFunds}只基金` : `${s.stock_count}只股`;
        html += `<div class="pa-sector-row" data-sector-idx="${i}" style="--bar-color:${color}">
            <span class="pa-sector-name">${s.name}</span>
            <div class="pa-sector-track"><div class="pa-sector-fill" style="width:${barW}%"></div></div>
            <span class="pa-sector-pct">${s.weight.toFixed(1)}%</span>
            <span class="pa-sector-cnt">${fundLabel}</span>
        </div>`;
    });

    html += `</div></div>
        <div class="pa-detail-panel" id="sectorDetailPanel" style="display:none"></div>
    </div>`;
    return html;
}

// ==================== ④ 资产配置分布（Chart.js + 点击展开） ====================
function renderTypeSection() {
    if (!analysisData.type_distribution || !analysisData.type_distribution.length) return '';

    const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#d97706'];

    let html = `<div class="pa-analysis-card pa-type-section">
        <div class="pa-card-title">资产配置分布</div>
        <div class="pa-sector-layout">
            <div class="pa-sector-chart-wrap">
                <canvas id="typeChart" width="220" height="220"></canvas>
            </div>
            <div class="pa-sector-bars" id="typeLegendList">`;

    analysisData.type_distribution.forEach((item, i) => {
        const color = colors[i % colors.length];
        const fundLabel = item.funds ? `${item.funds.length}只基金` : '';
        html += `<div class="pa-sector-row" data-type-idx="${i}" style="--bar-color:${color}">
            <span class="pa-sector-name">${item.name}</span>
            <div class="pa-sector-track"><div class="pa-sector-fill" style="width:${item.value}%"></div></div>
            <span class="pa-sector-pct">${item.value.toFixed(1)}%</span>
            <span class="pa-sector-cnt">${fundLabel}</span>
        </div>`;
    });

    html += `</div></div>
        <div class="pa-detail-panel" id="typeDetailPanel" style="display:none"></div>
    </div>`;
    return html;
}

// ==================== ⑤ 重叠持仓（可展开） ====================
function renderOverlapSection() {
    if (!analysisData.stock_overlap || !analysisData.stock_overlap.length) return '';

    let html = `<div class="pa-analysis-card">
        <div class="pa-card-title">重叠持仓
            <span class="pa-card-sub">多只基金共同持有，点击展开明细</span>
        </div>
        <div class="pa-overlap-list">`;

    analysisData.stock_overlap.forEach((s, idx) => {
        html += `<div class="pa-overlap-item" data-idx="${idx}">
            <div class="pa-overlap-main">
                <div class="pa-overlap-left">
                    <span class="pa-overlap-arrow">&#9654;</span>
                    <span class="pa-overlap-name">${s.name}</span>
                    <span class="pa-overlap-code">${s.code}</span>
                </div>
                <div class="pa-overlap-right">
                    <span class="pa-overlap-badge">${s.count}只基金</span>
                    <span class="pa-overlap-pct">${s.total_pct.toFixed(2)}%</span>
                </div>
            </div>
            <div class="pa-overlap-detail" style="display:none">`;

        s.funds.forEach(f => {
            html += `<div class="pa-overlap-fund">
                <span class="pa-overlap-fund-name">${f.name}</span>
                <span class="pa-overlap-fund-pct">持仓 ${f.pct.toFixed(2)}%</span>
            </div>`;
        });

        html += `</div></div>`;
    });

    html += `</div></div>`;
    return html;
}

// ==================== 图表渲染 ====================
function renderSectorChart() {
    const canvas = document.getElementById("sectorChart");
    if (!canvas || !analysisData.sector_distribution) return;

    const sectors = analysisData.sector_distribution;
    const colors = [
        '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7',
        '#06b6d4', '#d97706', '#ec4899', '#6366f1', '#14b8a6',
        '#f97316', '#64748b',
    ];

    if (window._sectorChartInstance) window._sectorChartInstance.destroy();

    window._sectorChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: sectors.map(s => s.name),
            datasets: [{
                data: sectors.map(s => s.weight),
                backgroundColor: sectors.map((_, i) => colors[i % colors.length]),
                borderWidth: 2,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fff',
                hoverBorderWidth: 3,
            }]
        },
        options: {
            responsive: false,
            cutout: '55%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => {
                            const s = sectors[ctx.dataIndex];
                            const label = s.fund_count ? `${s.fund_count}只基金` : `${s.stock_count}只股票`;
                            return `${s.name}: ${s.weight.toFixed(1)}% (${label})`;
                        }
                    }
                }
            },
            onClick: (evt, elements) => {
                if (elements.length > 0) {
                    showSectorDetail(sectors[elements[0].index]);
                }
            }
        }
    });
}

function renderTypePieChart() {
    const data = analysisData.type_distribution;
    if (!data || !data.length) return;

    const canvas = document.getElementById("typeChart");
    if (!canvas) return;

    const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#d97706'];

    if (window._typeChartInstance) window._typeChartInstance.destroy();

    window._typeChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.name),
            datasets: [{
                data: data.map(d => d.value),
                backgroundColor: data.map((_, i) => colors[i % colors.length]),
                borderWidth: 2,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fff',
                hoverBorderWidth: 3,
            }]
        },
        options: {
            responsive: false,
            cutout: '55%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => {
                            const item = data[ctx.dataIndex];
                            const fundLabel = item.funds ? ` (${item.funds.length}只基金)` : '';
                            return `${item.name}: ${item.value.toFixed(1)}%${fundLabel}`;
                        }
                    }
                }
            },
            onClick: (evt, elements) => {
                if (elements.length > 0) {
                    showTypeDetail(data[elements[0].index], colors[elements[0].index]);
                }
            }
        }
    });
}

// ==================== 详情面板 ====================
function showSectorDetail(sector) {
    const panel = document.getElementById("sectorDetailPanel");
    if (!panel) return;

    const isVisible = panel.style.display !== 'none' && panel.dataset.sector === sector.name;
    if (isVisible) { panel.style.display = 'none'; return; }

    let html = `<div class="pa-detail-header">
        <span class="pa-detail-title">${sector.name}</span>
        <span class="pa-detail-weight">组合权重 ${sector.weight.toFixed(2)}%</span>
        <button class="pa-detail-close" onclick="this.closest('.pa-detail-panel').style.display='none'">&times;</button>
    </div>`;

    // 合并基金列表：funds数组 + stocks按fund_name分组
    const allFunds = [];

    // 1) 从funds数组取（基金属性明确的板块）
    if (sector.funds && sector.funds.length) {
        sector.funds.forEach(f => {
            allFunds.push({
                name: f.name,
                code: f.code,
                weight: f.weight,
                holdings: f.top_holdings || [],
            });
        });
    }

    // 2) 从stocks数组按fund_name分组（重仓股分散归类的板块）
    if (sector.stocks && sector.stocks.length) {
        const grouped = {};
        sector.stocks.forEach(st => {
            if (!grouped[st.fund_name]) {
                grouped[st.fund_name] = { holdings: [], weight: 0 };
            }
            grouped[st.fund_name].holdings.push({
                name: st.name,
                code: st.code,
                pct: st.fund_pct,
                portfolio_pct: st.portfolio_pct,
            });
            grouped[st.fund_name].weight += st.portfolio_pct;
        });
        // 只加入funds数组中没有的基金（避免重复）
        const existingNames = new Set(allFunds.map(f => f.name));
        Object.keys(grouped).forEach(fname => {
            if (!existingNames.has(fname)) {
                const code = grouped[fname].holdings[0]?.code?.substring(0, 6) || '';
                allFunds.push({
                    name: fname,
                    code: code,
                    weight: parseFloat(grouped[fname].weight.toFixed(2)),
                    holdings: grouped[fname].holdings,
                });
            }
        });
    }

    // 按权重排序
    allFunds.sort((a, b) => b.weight - a.weight);

    if (allFunds.length) {
        html += `<div class="pa-detail-subtitle">持仓基金</div>`;
        allFunds.forEach((f, fi) => {
            html += `<div class="pa-fund-expand" data-fund-idx="${fi}">
                <div class="pa-fund-row">
                    <span class="pa-fund-arrow">&#9654;</span>
                    <span class="pa-fund-name">${f.name}</span>
                    <span class="pa-pct-cell">${f.weight}%</span>
                </div>`;
            if (f.holdings && f.holdings.length) {
                html += `<div class="pa-fund-holdings" style="display:none">
                    <table class="pa-detail-table"><thead><tr><th>重仓股</th><th>代码</th><th>基金占比</th></tr></thead><tbody>`;
                f.holdings.forEach(s => {
                    html += `<tr><td>${s.name}</td><td class="pa-code-cell">${s.code}</td><td class="pa-pct-cell">${s.pct}%</td></tr>`;
                });
                html += `</tbody></table></div>`;
            } else {
                html += `<div class="pa-fund-holdings" style="display:none"><div class="pa-no-data">暂无重仓股数据</div></div>`;
            }
            html += `</div>`;
        });
    }

    panel.innerHTML = html;
    panel.style.display = 'block';
    panel.dataset.sector = sector.name;

    // 绑定基金展开事件
    panel.querySelectorAll('.pa-fund-expand').forEach(item => {
        item.querySelector('.pa-fund-row').addEventListener('click', () => {
            const holdings = item.querySelector('.pa-fund-holdings');
            const arrow = item.querySelector('.pa-fund-arrow');
            const isOpen = holdings.style.display !== 'none';
            holdings.style.display = isOpen ? 'none' : 'block';
            if (arrow) arrow.innerHTML = isOpen ? '&#9654;' : '&#9660;';
            item.classList.toggle('pa-expanded', !isOpen);
        });
    });

    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showTypeDetail(typeItem, color) {
    const panel = document.getElementById("typeDetailPanel");
    if (!panel) return;

    const isVisible = panel.style.display !== 'none' && panel.dataset.type === typeItem.name;
    if (isVisible) { panel.style.display = 'none'; return; }

    let html = `<div class="pa-detail-header">
        <span class="pa-detail-title" style="color:${color}">${typeItem.name}</span>
        <span class="pa-detail-weight">配置占比 ${typeItem.value.toFixed(2)}%</span>
        <button class="pa-detail-close" onclick="this.closest('.pa-detail-panel').style.display='none'">&times;</button>
    </div>`;

    if (typeItem.funds && typeItem.funds.length) {
        html += `<div class="pa-detail-table-wrap"><table class="pa-detail-table">
            <thead><tr><th>基金名称</th><th>基金代码</th><th>组合权重</th></tr></thead>
            <tbody>`;
        typeItem.funds.forEach(f => {
            html += `<tr><td>${f.name}</td><td class="pa-code-cell">${f.code}</td><td class="pa-pct-cell">${f.weight}%</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }

    panel.innerHTML = html;
    panel.style.display = 'block';
    panel.dataset.type = typeItem.name;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ==================== 事件绑定 ====================
function bindAllEvents(container) {
    // 板块分布点击
    container.querySelectorAll('.pa-sector-row[data-sector-idx]').forEach(row => {
        row.addEventListener('click', () => {
            const idx = parseInt(row.dataset.sectorIdx);
            const sectors = analysisData.sector_distribution;
            if (sectors && sectors[idx]) showSectorDetail(sectors[idx]);
        });
    });

    // 资产配置点击
    container.querySelectorAll('.pa-sector-row[data-type-idx]').forEach(row => {
        row.addEventListener('click', () => {
            const idx = parseInt(row.dataset.typeIdx);
            const types = analysisData.type_distribution;
            const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#d97706'];
            if (types && types[idx]) showTypeDetail(types[idx], colors[idx % colors.length]);
        });
    });

    // 重叠持仓展开
    container.querySelectorAll('.pa-overlap-item').forEach(item => {
        item.addEventListener('click', () => {
            const detail = item.querySelector('.pa-overlap-detail');
            const arrow = item.querySelector('.pa-overlap-arrow');
            if (!detail) return;
            const isOpen = detail.style.display !== 'none';
            detail.style.display = isOpen ? 'none' : 'block';
            if (arrow) arrow.innerHTML = isOpen ? '&#9654;' : '&#9660;';
            item.classList.toggle('pa-expanded', !isOpen);
        });
    });

    // 帮助按钮
    container.querySelectorAll('.pa-help-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            showHelpTip(btn.dataset.help);
        });
    });

    // 回撤点击
    const ddCard = container.querySelector('[data-action="showDrawdown"]');
    if (ddCard) {
        ddCard.addEventListener('click', e => {
            if (e.target.classList.contains('pa-help-btn')) return;
            showDrawdownDetail();
        });
    }
}

export function initPortfolioAnalysis() {}

// ==================== CSS ====================
export const PORTFOLIO_CSS = `
/* ===== 组合分析基础 ===== */
.portfolio-analysis { display: flex; flex-direction: column; gap: 12px; padding: 2px 0; }

.pa-analysis-card {
    background: var(--card, #fff); border-radius: 12px;
    padding: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    border: 1px solid var(--border, #e5e7eb);
}
.pa-card-title {
    font-size: 14px; font-weight: 700; color: var(--text, #1a1a1a);
    margin-bottom: 12px; display: flex; align-items: center; gap: 6px;
}
.pa-card-sub { font-size: 11px; color: var(--text3, #999); font-weight: 400; }

/* ===== 风险指标 ===== */
.pa-risk-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.pa-risk-card {
    background: var(--card, #fff); border-radius: 12px; padding: 14px 10px;
    text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    border: 1px solid var(--border, #e5e7eb); position: relative;
    transition: box-shadow 0.2s, transform 0.15s;
}
.pa-risk-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.pa-risk-card.pa-clickable { cursor: pointer; }
.pa-risk-card.pa-clickable:hover { border-color: var(--primary, #3b82f6); }
.pa-risk-label { font-size: 11px; color: var(--text3, #888); margin-bottom: 6px; font-weight: 500; }
.pa-risk-value { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.2; }
.pa-risk-sub { font-size: 10px; color: var(--text3, #999); margin-top: 4px; }
.pa-click-hint { font-size: 9px; color: var(--primary, #3b82f6); margin-top: 6px; opacity: 0.7; }

/* ===== 帮助按钮 ===== */
.pa-help-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--bg, #f5f5f5); color: var(--text3, #999);
    font-size: 10px; font-weight: 700; cursor: pointer;
    position: absolute; top: 8px; right: 8px;
    transition: all 0.15s; line-height: 1;
}
.pa-help-btn:hover { background: var(--primary, #3b82f6); color: #fff; }
.pa-help-inline { position: static; width: 14px; height: 14px; font-size: 9px; vertical-align: middle; margin-left: 2px; }

/* ===== 帮助弹窗 ===== */
.help-tip-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999; animation: fadeIn 0.15s;
}
.help-tip-box {
    background: var(--card, #fff); border-radius: 16px; padding: 20px;
    max-width: 420px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    animation: slideUp 0.2s;
}
.help-tip-content { font-size: 13px; line-height: 1.7; color: var(--text, #333); }
.help-tip-close {
    display: block; margin: 16px auto 0; padding: 8px 24px;
    background: var(--primary, #3b82f6); color: #fff;
    border: none; border-radius: 8px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s;
}
.help-tip-close:hover { opacity: 0.85; }

/* ===== 回撤明细弹窗 — 新版 ===== */
.pa-dd-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45);
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999; animation: fadeIn 0.15s;
}
.pa-dd-modal {
    background: var(--card, #fff); border-radius: 16px;
    max-width: 680px; width: 94%; max-height: 85vh;
    display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04);
    animation: slideUp 0.25s cubic-bezier(0.16,1,0.3,1);
    overflow: hidden;
}
.pa-dd-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 2px solid transparent;
    border-image: linear-gradient(90deg, var(--primary, #3b82f6), var(--up, #ef4444)) 1;
    flex-shrink: 0;
}
.pa-dd-modal-title {
    font-size: 16px; font-weight: 700; color: var(--text, #1a1a1a);
    display: flex; align-items: center; gap: 8px;
}
.pa-dd-close-x {
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--bg, #f5f5f5); border: none;
    font-size: 20px; line-height: 1; color: var(--text3, #999);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
}
.pa-dd-close-x:hover { background: var(--border, #e5e7eb); color: var(--text, #333); }
.pa-dd-modal-body {
    padding: 16px 20px; overflow-y: auto; flex: 1;
}
.pa-dd-modal-footer {
    padding: 12px 20px; border-top: 1px solid var(--border, #e5e7eb);
    display: flex; justify-content: flex-end; flex-shrink: 0;
}

/* 关键指标条 */
.pa-dd-stats-bar {
    display: flex; align-items: center; gap: 0;
    background: var(--bg, #f9f9f9); border-radius: 12px;
    padding: 12px 16px; margin-bottom: 16px;
}
.pa-dd-stat-item { display: flex; flex-direction: column; align-items: center; flex: 1; }
.pa-dd-stat-label { font-size: 11px; color: var(--text3, #888); margin-bottom: 4px; }
.pa-dd-stat-value { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
.pa-dd-stat-divider { width: 1px; height: 32px; background: var(--border, #e5e7eb); flex-shrink: 0; }

/* 区域标题 */
.pa-dd-section-title {
    font-size: 13px; font-weight: 700; color: var(--text, #333);
    margin-bottom: 10px; display: flex; align-items: center; gap: 6px;
}

/* 图表区域 */
.pa-dd-chart-section { margin-bottom: 16px; }
.pa-dd-chart-wrap {
    background: var(--bg, #f9f9f9); border-radius: 12px;
    padding: 12px; position: relative;
}
.pa-dd-chart-wrap canvas { width: 100% !important; display: block; }

/* 峰谷卡片 */
.pa-dd-peak-cards {
    display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
}
.pa-dd-peak-card {
    flex: 1; display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; border-radius: 12px;
    border: 1px solid var(--border, #e5e7eb);
}
.pa-dd-peak-card--peak { border-left: 3px solid #22c55e; }
.pa-dd-peak-card--trough { border-left: 3px solid #ef4444; }
.pa-dd-peak-icon { font-size: 18px; color: #22c55e; flex-shrink: 0; line-height: 1; }
.pa-dd-peak-icon.up { color: #ef4444; }
.pa-dd-peak-info { min-width: 0; }
.pa-dd-peak-label { font-size: 11px; color: var(--text3, #888); }
.pa-dd-peak-date { font-size: 13px; font-weight: 700; color: var(--text, #333); }
.pa-dd-peak-nav { font-size: 12px; color: var(--text2, #666); font-variant-numeric: tabular-nums; }
.pa-dd-peak-arrow {
    display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0; min-width: 48px;
}
.pa-dd-arrow-line { width: 2px; height: 8px; background: var(--border, #ddd); border-radius: 1px; }
.pa-dd-arrow-badge {
    font-size: 13px; font-weight: 800; padding: 3px 8px;
    border-radius: 8px; background: rgba(239,68,68,0.08);
    white-space: nowrap; font-variant-numeric: tabular-nums;
}

/* 公式高亮 */
.pa-dd-formula {
    background: var(--bg, #f9f9f9); border-radius: 10px;
    padding: 10px 14px; margin-bottom: 16px;
    font-size: 12px; color: var(--text2, #555);
    text-align: center; font-variant-numeric: tabular-nums;
}
.pa-dd-formula strong { color: var(--up, #ef4444); font-size: 14px; }

/* 表格 */
.pa-dd-table-wrap { overflow-x: auto; margin-bottom: 12px; border-radius: 10px; border: 1px solid var(--border, #e5e7eb); }
.pa-dd-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pa-dd-table th {
    padding: 10px 12px; text-align: left; font-size: 11px;
    color: var(--text3, #888); background: var(--bg, #f9f9f9);
    font-weight: 600; border-bottom: 1px solid var(--border, #e5e7eb);
    position: sticky; top: 0;
}
.pa-dd-table td { padding: 9px 12px; border-bottom: 1px solid var(--border, #f0f0f0); }
.pa-dd-table tbody tr:hover { background: var(--bg, #fafafa); }
.pa-dd-table-total { font-weight: 700; background: var(--bg, #f9f9f9) !important; }
.pa-dd-table-total td { border-top: 2px solid var(--border, #e5e7eb); padding-top: 10px; }
.pa-dd-name { font-weight: 600; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pa-dd-code { color: var(--text3, #888); font-size: 11px; }
.pa-dd-weight { font-variant-numeric: tabular-nums; }
.pa-dd-value { font-weight: 700; font-variant-numeric: tabular-nums; }
.pa-dd-contrib-bar {
    display: inline-block; height: 6px; border-radius: 3px; vertical-align: middle;
    background: var(--up, #ef4444); opacity: 0.3; margin-right: 4px;
}

/* 折叠说明 */
.pa-dd-note-section { margin-top: 4px; }
.pa-dd-note-toggle {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--text3, #888); cursor: pointer;
    padding: 6px 0; transition: color 0.15s;
}
.pa-dd-note-toggle:hover { color: var(--primary, #3b82f6); }
.pa-dd-note-icon { font-size: 14px; }
.pa-dd-note-arrow { font-size: 10px; transition: transform 0.2s; }
.pa-dd-note-open .pa-dd-note-arrow { transform: rotate(180deg); }
.pa-dd-note-content {
    background: var(--bg, #f9f9f9); border-radius: 10px;
    padding: 12px 14px; font-size: 12px; color: var(--text2, #555);
    line-height: 1.8; margin-top: 6px; animation: slideDown 0.2s ease;
}
.pa-dd-note-content div { margin-bottom: 2px; }

/* 关闭按钮 */
.pa-dd-close-btn {
    padding: 8px 28px; border-radius: 10px;
    background: var(--primary, #3b82f6); color: #fff;
    border: none; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s, transform 0.1s;
}
.pa-dd-close-btn:hover { opacity: 0.85; }
.pa-dd-close-btn:active { transform: scale(0.97); }

/* ===== 多样化评分 ===== */
.pa-div-section {
    background: var(--card, #fff); border-radius: 12px; padding: 14px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid var(--border, #e5e7eb);
}
.pa-div-grid { display: flex; gap: 16px; align-items: center; }
.pa-div-score-wrap { display: flex; flex-direction: column; align-items: center; min-width: 90px; }
.pa-div-ring { width: 80px; height: 80px; position: relative; }
.pa-div-ring svg { width: 100%; height: 100%; }
.pa-ring-progress { transition: stroke-dasharray 0.6s ease; }
.pa-div-score-num {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    font-size: 22px; font-weight: 900; line-height: 1;
}
.pa-div-score-label { font-size: 10px; color: var(--text3, #888); margin-top: 4px; }
.pa-div-score-level { font-size: 13px; font-weight: 700; }
.pa-div-score-desc { font-size: 10px; color: var(--text3, #999); }

.pa-div-indicators { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; flex: 1; }
.pa-div-ind {
    background: var(--bg, #f9f9f9); border-radius: 10px; padding: 10px;
    text-align: center;
}
.pa-div-ind-label { font-size: 11px; color: var(--text3, #888); margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 2px; }
.pa-div-ind-value { font-size: 17px; font-weight: 800; }
.pa-div-ind-sub { font-size: 11px; color: var(--text3, #999); margin-top: 2px; }

/* ===== 集中度预警 ===== */
.pa-conc-warning {
    display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 10px 12px;
    background: #fff7ed; border-radius: 10px; font-size: 12px; color: #c2410c;
    border: 1px solid #fed7aa;
}
[data-theme="dark"] .pa-conc-warning {
    background: #431407; color: #fdba74; border-color: #7c2d12;
}
.pa-conc-icon { font-size: 16px; flex-shrink: 0; }

/* ===== 板块分布 / 资产配置 共用布局 ===== */
.pa-sector-layout { display: flex; gap: 14px; align-items: flex-start; }
.pa-sector-chart-wrap { flex-shrink: 0; }
.pa-sector-bars { flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.pa-sector-row {
    display: flex; align-items: center; gap: 8px; cursor: pointer;
    padding: 5px 8px; border-radius: 8px; transition: background 0.15s;
}
.pa-sector-row:hover { background: var(--bg, #f5f5f5); }
.pa-sector-name { font-size: 12px; font-weight: 600; min-width: 55px; max-width: 90px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pa-sector-track { flex: 1; height: 14px; background: var(--bg, #f0f0f0); border-radius: 7px; overflow: hidden; min-width: 40px; }
.pa-sector-fill { height: 100%; border-radius: 7px; background: var(--bar-color, var(--primary, #3b82f6)); transition: width 0.3s ease; opacity: 0.8; }
.pa-sector-row:hover .pa-sector-fill { opacity: 1; }
.pa-sector-pct { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; min-width: 42px; text-align: right; }
.pa-sector-cnt { font-size: 10px; color: var(--text3, #999); min-width: 46px; text-align: right; }

/* ===== 详情面板 ===== */
.pa-detail-panel {
    margin-top: 10px; padding: 12px; background: var(--bg, #f9f9f9);
    border-radius: 10px; border: 1px solid var(--border, #e5e7eb);
    animation: slideDown 0.2s ease;
}
.pa-detail-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.pa-detail-title { font-size: 14px; font-weight: 700; }
.pa-detail-weight { font-size: 12px; color: var(--primary, #3b82f6); font-weight: 600; }
.pa-detail-close { margin-left: auto; background: none; border: none; font-size: 18px; cursor: pointer; color: var(--text3, #999); line-height: 1; padding: 2px 4px; }
.pa-detail-close:hover { color: var(--text, #333); }
.pa-detail-subtitle { font-size: 12px; font-weight: 600; color: var(--text2, #666); margin: 8px 0 6px; }
.pa-detail-table-wrap { overflow-x: auto; }
.pa-detail-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pa-detail-table th { padding: 6px 10px; text-align: left; font-size: 11px; color: var(--text3, #888); font-weight: 600; background: var(--card, #fff); border-bottom: 2px solid var(--border, #e5e7eb); }
.pa-detail-table td { padding: 6px 10px; border-bottom: 1px solid var(--border, #eee); }
.pa-stock-name { font-weight: 600; }
.pa-code-cell { font-size: 10px; color: var(--text3, #999); }
.pa-pct-cell { font-weight: 600; color: var(--primary, #3b82f6); font-variant-numeric: tabular-nums; }

/* ===== 基金展开（板块详情内） ===== */
.pa-fund-expand {
    border: 1px solid var(--border, #e5e7eb); border-radius: 8px;
    margin-bottom: 6px; overflow: hidden; cursor: pointer;
    transition: border-color 0.15s;
}
.pa-fund-expand:hover { border-color: var(--primary, #3b82f6); }
.pa-fund-expand.pa-expanded { border-color: var(--primary, #3b82f6); }
.pa-fund-row {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
}
.pa-fund-arrow { font-size: 8px; color: var(--text3, #999); flex-shrink: 0; transition: transform 0.2s; }
.pa-fund-name { font-size: 12px; font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pa-fund-holdings {
    padding: 6px 10px 8px 24px; background: var(--card, #fff);
    border-top: 1px solid var(--border, #eee);
}
.pa-no-data { font-size: 11px; color: var(--text3, #999); padding: 6px 0; }

/* ===== 回撤明细列 ===== */
.pa-dd-holding { font-size: 11px; color: var(--text3, #888); }

/* ===== 重叠持仓 ===== */
.pa-overlap-list { display: flex; flex-direction: column; gap: 6px; max-height: 400px; overflow-y: auto; }
.pa-overlap-item {
    border: 1px solid var(--border, #e5e7eb); border-radius: 10px;
    overflow: hidden; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
}
.pa-overlap-item:hover { border-color: var(--primary, #3b82f6); }
.pa-overlap-item.pa-expanded { border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 1px var(--primary, #3b82f6); }
.pa-overlap-main { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; }
.pa-overlap-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.pa-overlap-arrow { font-size: 9px; color: var(--text3, #999); transition: transform 0.2s; flex-shrink: 0; }
.pa-overlap-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pa-overlap-code { font-size: 10px; color: var(--text3, #999); flex-shrink: 0; }
.pa-overlap-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.pa-overlap-badge { background: #fef2f2; color: var(--up, #ef4444); font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 600; }
.pa-overlap-pct { font-size: 13px; font-weight: 700; color: var(--primary, #3b82f6); font-variant-numeric: tabular-nums; }
.pa-overlap-detail {
    padding: 8px 12px 10px 30px; border-top: 1px solid var(--border, #eee);
    background: var(--bg, #fafafa); animation: slideDown 0.2s ease;
}
.pa-overlap-fund { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
.pa-overlap-fund-name { font-size: 12px; color: var(--text2, #555); }
.pa-overlap-fund-pct { font-size: 11px; color: var(--primary, #3b82f6); font-weight: 600; font-variant-numeric: tabular-nums; }

/* ===== 动画 ===== */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 500px; } }

/* ===== 响应式 ===== */
@media (max-width: 600px) {
    .pa-risk-metrics { grid-template-columns: repeat(2, 1fr); }
    .pa-div-grid { flex-direction: column; }
    .pa-sector-layout { flex-direction: column; }
    .pa-sector-chart-wrap { width: 100%; display: flex; justify-content: center; }
    .pa-sector-name { max-width: 60px; }
    .pa-div-indicators { grid-template-columns: repeat(2, 1fr); width: 100%; }
    .pa-dd-modal { width: 98%; max-height: 92vh; border-radius: 12px; }
    .pa-dd-modal-header { padding: 12px 14px; }
    .pa-dd-modal-body { padding: 12px 14px; }
    .pa-dd-stats-bar { flex-direction: column; gap: 8px; padding: 10px; }
    .pa-dd-stat-divider { width: 80%; height: 1px; }
    .pa-dd-peak-cards { flex-direction: column; }
    .pa-dd-peak-arrow { flex-direction: row; min-width: auto; }
    .pa-dd-arrow-line { width: 8px; height: 2px; }
    .pa-dd-table th, .pa-dd-table td { padding: 7px 8px; font-size: 11px; }
    .pa-dd-name { max-width: 100px; }
}
`;

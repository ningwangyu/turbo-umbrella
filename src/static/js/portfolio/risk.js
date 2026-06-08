/** 组合风险模块 — 将波动率、最大回撤、夏普比率等风险指标转换为解释性视图。 */
import { analysisData } from './state.js';
import { HELP_TEXTS, formatFullDate } from './helpers.js';
import { showToast } from '../utils.js';

export function showHelpTip(key) {
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
export function renderRiskSection() {
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
export function showDrawdownDetail() {
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

    const peakDate = dd ? formatFullDate(dd.peak_date) : '--';
    const troughDate = dd ? formatFullDate(dd.trough_date) : '--';
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

export function drawDDChart(dd) {
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


/**
 * 市场情绪监控模块
 */
import { fmtMoney, colorCls } from './utils.js';

/**
 * 获取并渲染市场情绪页面
 */
export async function renderSentiment(container) {
    container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载市场情绪数据...</div>';

    try {
        const r = await fetch("/api/market/sentiment");
        const data = await r.json();
        renderSentimentPage(container, data);
    } catch (e) {
        container.innerHTML = '<div class="panel-loading" style="color:var(--up)">加载失败</div>';
    }
}

function renderSentimentPage(container, data) {
    let html = '<div class="sentiment-page">';

    // 恐慌/贪婪指数仪表盘
    const scoreColor = data.score >= 60 ? "var(--up)" : data.score <= 40 ? "var(--down)" : "var(--flat)";
    html += `<div class="sentiment-gauge-card">
        <div class="sentiment-gauge-wrap">
            <canvas id="sentimentGauge" width="200" height="130"></canvas>
            <div class="sentiment-gauge-center">
                <div class="sentiment-score" style="color:${scoreColor}">${data.score}</div>
                <div class="sentiment-label">${data.emoji} ${data.label}</div>
            </div>
        </div>
        <div class="sentiment-advice">${data.advice}</div>
    </div>`;

    // 指标明细
    if (data.indicators) {
        html += `<div class="sentiment-indicators">`;
        const indKeys = ["涨跌比", "涨跌停", "北向资金"];
        indKeys.forEach(key => {
            const ind = data.indicators[key];
            if (!ind) return;
            let cls = "";
            if (key === "北向资金" && ind.amount != null) {
                cls = ind.amount > 0 ? "up" : ind.amount < 0 ? "down" : "flat";
            }
            html += `<div class="sentiment-ind-card">
                <div class="sentiment-ind-label">${key}</div>
                <div class="sentiment-ind-value ${cls}">${ind.value}</div>
            </div>`;
        });
        html += `</div>`;
    }

    // ETF资金流入排行
    const etfList = data.indicators?.etf_list;
    if (etfList && etfList.length) {
        html += `<div class="analysis-section">
            <div class="section-title">ETF资金流入排行</div>
            <div class="etf-list">`;
        etfList.forEach((etf, i) => {
            const rank = i < 3 ? "top3" : "";
            html += `<div class="etf-item">
                <span class="etf-rank ${rank}">${i + 1}</span>
                <span class="etf-name">${etf.name}</span>
                <span class="etf-code">${etf.code}</span>
                <span class="etf-change ${colorCls(etf.change_pct)}">${fmtMoney(etf.change_pct)}%</span>
                <span class="etf-inflow ${colorCls(etf.net_inflow)}">${etf.net_inflow > 0 ? "+" : ""}${etf.net_inflow}亿</span>
            </div>`;
        });
        html += `</div></div>`;
    }

    html += `<div class="update-info">${data.updated_at} 更新</div>`;
    html += '</div>';
    container.innerHTML = html;

    // 绘制仪表盘
    requestAnimationFrame(() => drawSentimentGauge(data.score));
}

function drawSentimentGauge(score) {
    const canvas = document.getElementById("sentimentGauge");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // Canvas 实际像素 200x130，圆弧圆心偏下方
    const cx = 100, cy = 100, r = 75, lw = 10;

    // 背景弧（渐变色：绿→黄→红）
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.strokeStyle = "#eee";
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.stroke();

    // 分段颜色
    const segments = [
        { end: 0.2, color: "#27ae60" },   // 极度恐慌=绿
        { end: 0.4, color: "#66bb6a" },
        { end: 0.6, color: "#f5a623" },    // 中性=黄
        { end: 0.8, color: "#ef5350" },
        { end: 1.0, color: "#e74c3c" },    // 极度贪婪=红
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

/**
 * 市场情绪CSS
 */
export const SENTIMENT_CSS = `
.sentiment-page { display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }

/* 仪表盘卡片 */
.sentiment-gauge-card {
    background: var(--card); border-radius: var(--radius);
    padding: 16px 16px 12px; box-shadow: var(--shadow); text-align: center;
}
.sentiment-gauge-wrap { position: relative; width: 200px; height: 130px; margin: 0 auto 8px; }
.sentiment-gauge-wrap canvas { width: 200px !important; height: 130px !important; }
.sentiment-gauge-center {
    position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
    text-align: center; pointer-events: none;
}
.sentiment-score { font-size: 28px; font-weight: 800; line-height: 1; }
.sentiment-label { font-size: 12px; font-weight: 600; margin-top: 2px; }
.sentiment-advice {
    font-size: 12px; color: var(--text2);
    margin-top: 8px; padding: 10px 12px;
    background: var(--bg); border-radius: 8px; line-height: 1.6;
    clear: both;
}

/* 指标卡片 */
.sentiment-indicators { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sentiment-ind-card {
    background: var(--card); border-radius: var(--radius);
    padding: 12px 8px; text-align: center; box-shadow: var(--shadow);
}
.sentiment-ind-label { font-size: 10px; color: var(--text3); margin-bottom: 6px; }
.sentiment-ind-value { font-size: 14px; font-weight: 700; word-break: break-all; }

/* ETF列表 */
.etf-list { display: flex; flex-direction: column; gap: 2px; }
.etf-item {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 8px; font-size: 11px;
    border-bottom: 1px solid var(--border);
}
.etf-item:last-child { border-bottom: none; }
.etf-rank { width: 18px; text-align: center; font-size: 10px; color: var(--text3); flex-shrink: 0; }
.etf-rank.top3 { color: var(--up); font-weight: 700; }
.etf-name { font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.etf-code { color: var(--text3); font-size: 9px; flex-shrink: 0; }
.etf-change { font-weight: 600; font-variant-numeric: tabular-nums; min-width: 50px; text-align: right; flex-shrink: 0; }
.etf-inflow { font-weight: 600; font-variant-numeric: tabular-nums; min-width: 60px; text-align: right; flex-shrink: 0; }
@media (max-width: 600px) { .sentiment-indicators { grid-template-columns: 1fr; } }
`;

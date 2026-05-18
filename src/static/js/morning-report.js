/**
 * AI每日晨报模块
 */
import { holdings } from './state.js';
import { showToast } from './utils.js';

/**
 * 渲染AI晨报页面
 */
export async function renderMorningReport(container) {
    let html = '<div class="report-page">';

    html += `<div class="report-card">
        <div class="section-title">AI 每日晨报</div>
        <p class="report-desc">基于您的持仓和当日市场数据，AI 自动生成投资分析晨报。</p>
        <button class="btn btn-primary" id="btnGenerateReport">
            <span id="reportBtnText">生成今日晨报</span>
        </button>
    </div>`;

    html += `<div id="reportContent"></div>`;
    html += '</div>';
    container.innerHTML = html;

    container.querySelector("#btnGenerateReport").addEventListener("click", () => generateReport(container));
}

async function generateReport(container) {
    const btn = container.querySelector("#btnGenerateReport");
    const btnText = container.querySelector("#reportBtnText");
    const contentDiv = container.querySelector("#reportContent");

    btn.disabled = true;
    btnText.textContent = "AI 正在撰写中...";
    contentDiv.innerHTML = '<div class="panel-loading"><span class="spinner"></span>AI 正在分析市场数据并撰写晨报，请稍候...</div>';

    try {
        const r = await fetch("/api/report/morning", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                holdings: holdings.map(h => ({ code: h.code, value: h.value, profit: h.profit })),
            }),
        });
        const data = await r.json();
        renderReportResult(contentDiv, data);
    } catch (e) {
        contentDiv.innerHTML = '<div class="panel-loading" style="color:var(--up)">晨报生成失败，请稍后重试</div>';
    }

    btn.disabled = false;
    btnText.textContent = "重新生成";
}

function renderReportResult(container, data) {
    let html = '<div class="report-result">';

    // 持仓摘要卡片
    if (data.holdings_data && data.holdings_data.length) {
        html += `<div class="report-holdings-summary">
            <div class="report-stat"><span class="report-stat-label">持仓总市值</span><span class="report-stat-value">${data.total_value?.toLocaleString() || '--'}元</span></div>
            <div class="report-stat"><span class="report-stat-label">今日预估</span><span class="report-stat-value ${data.total_today >= 0 ? 'up' : 'down'}">${data.total_today >= 0 ? '+' : ''}${data.total_today?.toFixed(2) || '0'}元</span></div>
        </div>`;

        html += `<div class="report-holdings-detail">`;
        data.holdings_data.forEach(h => {
            const cls = h.change_pct >= 0 ? "up" : "down";
            html += `<div class="report-holding-item">
                <span class="report-holding-name">${h.name}</span>
                <span class="report-holding-change ${cls}">${h.change_pct >= 0 ? '+' : ''}${h.change_pct.toFixed(2)}%</span>
                <span class="report-holding-today ${cls}">${h.today >= 0 ? '+' : ''}${h.today.toFixed(2)}</span>
            </div>`;
        });
        html += `</div>`;
    }

    // AI晨报正文
    if (data.report) {
        html += `<div class="report-body">${formatReport(data.report)}</div>`;
    }

    html += `<div class="report-footer">生成时间: ${data.generated_at || '--'}</div>`;
    html += '</div>';
    container.innerHTML = html;
}

function formatReport(text) {
    // 简单Markdown格式化：标题加粗、换行保留
    return text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/#{1,3}\s*(.*?)(?:<br>|$)/g, '<div class="report-section-title">$1</div>');
}

/**
 * AI晨报CSS
 */
export const REPORT_CSS = `
.report-page { display: flex; flex-direction: column; gap: 10px; }
.report-card { background: var(--card); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow); }
.report-desc { font-size: 11px; color: var(--text2); margin: 4px 0 10px; line-height: 1.5; }
.report-result { display: flex; flex-direction: column; gap: 10px; }
.report-holdings-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.report-stat { background: var(--card); border-radius: var(--radius); padding: 10px; text-align: center; box-shadow: var(--shadow); }
.report-stat-label { font-size: 10px; color: var(--text3); display: block; margin-bottom: 4px; }
.report-stat-value { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.report-holdings-detail { background: var(--card); border-radius: var(--radius); padding: 8px; box-shadow: var(--shadow); }
.report-holding-item { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; border-bottom: 1px solid var(--border); font-size: 11px; }
.report-holding-item:last-child { border-bottom: none; }
.report-holding-name { font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.report-holding-change { font-weight: 600; font-variant-numeric: tabular-nums; min-width: 55px; text-align: right; }
.report-holding-today { font-weight: 600; font-variant-numeric: tabular-nums; min-width: 65px; text-align: right; }
.report-body { background: var(--card); border-radius: var(--radius); padding: 14px; box-shadow: var(--shadow); font-size: 13px; line-height: 1.8; color: var(--text); }
.report-body strong { color: var(--primary); }
.report-section-title { font-weight: 700; font-size: 14px; margin: 8px 0 4px; color: var(--text); }
.report-footer { text-align: center; font-size: 10px; color: var(--text3); padding: 4px 0; }
`;

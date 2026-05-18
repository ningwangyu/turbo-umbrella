/**
 * 智能定投模拟器模块
 */
import { holdings, fundDataCache } from './state.js';
import { fmtMoney, colorCls, showToast } from './utils.js';

/**
 * 渲染定投模拟器页面
 */
export function renderBacktest(container) {
    let html = '<div class="backtest-page">';

    // 输入表单
    html += `<div class="backtest-form">
        <div class="section-title">智能定投模拟器</div>
        <div class="backtest-form-grid">
            <div class="backtest-field">
                <label class="backtest-label">基金代码</label>
                <input type="text" id="btCode" class="add-input" placeholder="6位代码" maxlength="6" inputmode="numeric">
                <div class="backtest-hint" id="btCodeHint"></div>
            </div>
            <div class="backtest-field">
                <label class="backtest-label">每期金额（元）</label>
                <input type="number" id="btAmount" class="add-input" value="1000" min="100" step="100" inputmode="decimal">
            </div>
            <div class="backtest-field">
                <label class="backtest-label">定投频率</label>
                <select id="btFrequency" class="add-input">
                    <option value="weekly">每周</option>
                    <option value="biweekly">每两周</option>
                    <option value="monthly" selected>每月</option>
                </select>
            </div>
        </div>
        <button class="btn btn-primary" id="btnBacktest" style="margin-top:8px">开始回测</button>
    </div>`;

    // 持仓快捷选择
    if (holdings.length > 0) {
        html += `<div class="backtest-quick">
            <div class="backtest-quick-label">从持仓选择：</div>`;
        holdings.forEach(h => {
            const fd = fundDataCache[h.code];
            html += `<button class="compare-quick-btn backtest-quick-btn" data-code="${h.code}">${(fd ? fd.name : h.code).substring(0, 8)}</button>`;
        });
        html += `</div>`;
    }

    // 回测结果区
    html += `<div id="backtestResults"></div>`;

    html += '</div>';
    container.innerHTML = html;

    // 绑定事件
    const codeInput = container.querySelector("#btCode");
    const btnRun = container.querySelector("#btnBacktest");

    // 快捷选择
    container.querySelectorAll(".backtest-quick-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            codeInput.value = btn.dataset.code;
            updateCodeHint(btn.dataset.code);
        });
    });

    codeInput.addEventListener("input", () => {
        const code = codeInput.value.trim();
        updateCodeHint(code);
    });

    btnRun.addEventListener("click", () => runBacktest(container));
}

function updateCodeHint(code) {
    const hint = document.getElementById("btCodeHint");
    if (!hint) return;
    const fd = fundDataCache[code];
    if (fd) {
        hint.textContent = fd.name;
        hint.style.color = "var(--primary)";
    } else {
        hint.textContent = "";
    }
}

async function runBacktest(container) {
    const code = container.querySelector("#btCode").value.trim();
    const amount = parseFloat(container.querySelector("#btAmount").value) || 1000;
    const frequency = container.querySelector("#btFrequency").value;

    if (!/^\d{6}$/.test(code)) { showToast("请输入6位基金代码"); return; }

    const btn = container.querySelector("#btnBacktest");
    btn.disabled = true;
    btn.textContent = "回测中...";

    const resultsDiv = container.querySelector("#backtestResults");
    resultsDiv.innerHTML = '<div class="panel-loading"><span class="spinner"></span>正在计算回测数据...</div>';

    try {
        const r = await fetch("/api/backtest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, amount, frequency }),
        });
        const data = await r.json();
        if (data.error) {
            resultsDiv.innerHTML = `<div class="panel-loading" style="color:var(--up)">${data.error}</div>`;
        } else {
            renderBacktestResults(resultsDiv, data);
        }
    } catch (e) {
        resultsDiv.innerHTML = '<div class="panel-loading" style="color:var(--up)">回测请求失败</div>';
    }

    btn.disabled = false;
    btn.textContent = "开始回测";
}

function renderBacktestResults(container, data) {
    const freqLabel = { weekly: "每周", biweekly: "每两周", monthly: "每月" };
    let html = `<div class="backtest-results">
        <div class="backtest-header">
            <div class="backtest-title">回测结果</div>
            <div class="backtest-meta">${freqLabel[data.frequency] || data.frequency} · 每期${data.amount}元</div>
        </div>`;

    // 策略对比卡片
    const strategies = ["fixed", "smart", "value"];
    const labels = { fixed: "普通定投", smart: "慧定投", value: "价值平均" };
    const colors = ["#1a73e8", "#e74c3c", "#27ae60"];

    html += `<div class="backtest-compare">`;
    strategies.forEach((key, i) => {
        const result = data.results[key];
        if (!result || result.error) return;
        const s = result.summary;
        html += `<div class="backtest-card">
            <div class="backtest-card-title" style="color:${colors[i]}">${result.strategy}</div>
            <div class="backtest-card-row"><span>总投入</span><span class="backtest-val">${fmtMoney(s.total_invested)}元</span></div>
            <div class="backtest-card-row"><span>最终市值</span><span class="backtest-val ${colorCls(s.profit)}">${fmtMoney(s.final_value)}元</span></div>
            <div class="backtest-card-row"><span>总收益</span><span class="backtest-val ${colorCls(s.profit)}">${fmtMoney(s.profit)}元</span></div>
            <div class="backtest-card-row"><span>收益率</span><span class="backtest-val ${colorCls(s.profit_pct)}">${fmtMoney(s.profit_pct)}%</span></div>
            <div class="backtest-card-row"><span>平均成本</span><span class="backtest-val">${s.avg_cost}</span></div>
            <div class="backtest-card-row"><span>定投期数</span><span class="backtest-val">${s.periods}期</span></div>
        </div>`;
    });
    html += `</div>`;

    // 收益对比图
    html += `<div class="analysis-section" style="margin-top:10px">
        <div class="section-title">策略收益对比</div>
        <div class="backtest-chart-wrap"><canvas id="backtestChart"></canvas></div>
    </div>`;

    html += `</div>`;
    container.innerHTML = html;

    // 绘制柱状对比图
    requestAnimationFrame(() => {
        const canvas = document.getElementById("backtestChart");
        if (!canvas) return;
        const labels_bar = [];
        const values_bar = [];
        const bgColors = [];
        strategies.forEach((key, i) => {
            const result = data.results[key];
            if (!result || result.error) return;
            labels_bar.push(result.strategy);
            values_bar.push(result.summary.profit_pct);
            bgColors.push(colors[i]);
        });
        if (labels_bar.length) {
            new Chart(canvas, {
                type: "bar",
                data: {
                    labels: labels_bar,
                    datasets: [{
                        label: "收益率%",
                        data: values_bar,
                        backgroundColor: bgColors.map(c => c + "88"),
                        borderColor: bgColors,
                        borderWidth: 1,
                    }],
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { callback: v => v + "%" } } },
                },
            });
        }
    });
}

/**
 * 定投模拟器CSS
 */
export const BACKTEST_CSS = `
.backtest-page { display: flex; flex-direction: column; gap: 10px; }
.backtest-form { background: var(--card); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow); }
.backtest-form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
.backtest-field { display: flex; flex-direction: column; gap: 3px; }
.backtest-label { font-size: 10px; color: var(--text2); font-weight: 500; }
.backtest-hint { font-size: 10px; min-height: 14px; }
.backtest-quick { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.backtest-quick-label { font-size: 11px; color: var(--text3); white-space: nowrap; }
.backtest-results { }
.backtest-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.backtest-title { font-size: 14px; font-weight: 700; }
.backtest-meta { font-size: 11px; color: var(--text3); }
.backtest-compare { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.backtest-card { background: var(--card); border-radius: var(--radius); padding: 10px; box-shadow: var(--shadow); }
.backtest-card-title { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
.backtest-card-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; color: var(--text2); }
.backtest-val { font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
.backtest-chart-wrap { height: 180px; position: relative; }
@media (max-width: 700px) {
    .backtest-form-grid { grid-template-columns: 1fr 1fr; }
    .backtest-compare { grid-template-columns: 1fr; }
}
`;

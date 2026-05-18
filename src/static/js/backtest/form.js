import { holdings, fundDataCache } from '../state.js';
import { showToast } from '../utils.js';
import { STRATEGIES, TIME_RANGES } from './config.js';
import { requestBacktest } from './api.js';
import { renderBacktestResults } from './results.js';

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

        <div class="backtest-field" style="margin-top:8px">
            <label class="backtest-label">时间区间</label>
            <div class="bt-time-range" id="btTimeRange">
                ${TIME_RANGES.map(r =>
                    `<button class="bt-range-btn${r.key === '3m' ? ' active' : ''}" data-range="${r.key}">${r.label}</button>`
                ).join('')}
            </div>
        </div>

        <div class="backtest-field" style="margin-top:8px">
            <label class="backtest-label">选择策略（可多选）</label>
            <div class="bt-strategy-selector" id="btStrategySelector">
                ${Object.values(STRATEGIES).map(s =>
                    `<button class="bt-strategy-btn active" data-strategy="${s.key}">
                        <span class="bt-strategy-icon">${s.icon}</span>
                        <span class="bt-strategy-name">${s.label}</span>
                        <span class="bt-strategy-check">✓</span>
                    </button>`
                ).join('')}
            </div>
        </div>

        <button class="btn btn-primary" id="btnBacktest" style="margin-top:10px">开始回测</button>
    </div>`;

    // 策略介绍折叠面板
    html += `<details class="bt-info-panel">
        <summary class="bt-info-summary">了解三种定投策略</summary>
        <div class="bt-info-content">
            ${Object.values(STRATEGIES).map(s =>
                `<div class="bt-info-item">
                    <div class="bt-info-title" style="color:${s.color}">${s.icon} ${s.label}</div>
                    <div class="bt-info-desc">${s.desc}</div>
                </div>`
            ).join('')}
        </div>
    </details>`;

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

    // 事件绑定
    const codeInput = container.querySelector("#btCode");
    const btnRun = container.querySelector("#btnBacktest");

    container.querySelectorAll(".backtest-quick-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            codeInput.value = btn.dataset.code;
            updateCodeHint(btn.dataset.code);
        });
    });

    codeInput.addEventListener("input", () => updateCodeHint(codeInput.value.trim()));

    // 时间区间切换
    container.querySelectorAll(".bt-range-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            container.querySelectorAll(".bt-range-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    // 策略选择切换
    container.querySelectorAll(".bt-strategy-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const active = container.querySelectorAll(".bt-strategy-btn.active");
            if (active.length === 1 && btn.classList.contains("active")) {
                showToast("至少选择一种策略");
                return;
            }
            btn.classList.toggle("active");
            const check = btn.querySelector(".bt-strategy-check");
            check.style.display = btn.classList.contains("active") ? "" : "none";
        });
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

function getSelectedStrategies(container) {
    return Array.from(container.querySelectorAll(".bt-strategy-btn.active")).map(b => b.dataset.strategy);
}

function getActiveTimeRange(container) {
    const btn = container.querySelector(".bt-range-btn.active");
    return btn ? btn.dataset.range : "3m";
}

async function runBacktest(container) {
    const code = container.querySelector("#btCode").value.trim();
    const amount = parseFloat(container.querySelector("#btAmount").value) || 1000;
    const frequency = container.querySelector("#btFrequency").value;
    const timeRange = getActiveTimeRange(container);
    const strategies = getSelectedStrategies(container);

    if (!/^\d{6}$/.test(code)) { showToast("请输入6位基金代码"); return; }
    if (!strategies.length) { showToast("请至少选择一种策略"); return; }

    const btn = container.querySelector("#btnBacktest");
    btn.disabled = true;
    btn.textContent = "回测中...";

    const resultsDiv = container.querySelector("#backtestResults");
    resultsDiv.innerHTML = '<div class="panel-loading"><span class="spinner"></span>正在计算回测数据...</div>';

    try {
        const r = await fetch("/api/backtest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, amount, frequency, strategies, time_range: timeRange }),
        });
        const data = await r.json();
        if (data.error) {
            resultsDiv.innerHTML = `<div class="panel-loading" style="color:var(--up)">${data.error}</div>`;
        } else {
            renderBacktestResults(resultsDiv, data, strategies);
        }
    } catch (e) {
        resultsDiv.innerHTML = '<div class="panel-loading" style="color:var(--up)">回测请求失败</div>';
    }

    btn.disabled = false;
    btn.textContent = "开始回测";
}

/* ============================================================
 * 结果渲染
 * ============================================================ */

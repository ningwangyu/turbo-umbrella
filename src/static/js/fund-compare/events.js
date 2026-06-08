/** 基金对比事件模块 — 集中绑定添加、删除、切换周期等交互，避免视图层膨胀。 */
import { holdings, fundDataCache, signalCache, setFundDataCache, setSignalCache } from '../state.js';
import { showToast } from '../utils.js';
import { fetchCompareData } from './api.js';
import { compareState } from './state.js';
import { renderFundCompare } from './view.js';
import { renderCompareChart } from './chart.js';
import { openSignalModal } from './signal-modal.js';

let compareLoading = false;

export function bindCompareEvents(container) {
    // 输入补全
    const input = container.querySelector("#compareFundInput");
    const acBox = container.querySelector("#compareAutocomplete");
    if (input && acBox) {
        input.addEventListener("input", () => {
            const q = input.value.trim();
            clearTimeout(compareState.searchTimer);
            if (q.length < 1) { acBox.classList.remove("show"); return; }
            // 如果是纯数字且6位，不触发补全
            if (/^\d{6}$/.test(q)) { acBox.classList.remove("show"); return; }
            compareState.searchTimer = setTimeout(() => doSearch(q, acBox, input, container), 300);
        });
        input.addEventListener("blur", () => setTimeout(() => acBox.classList.remove("show"), 200));
        input.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                acBox.classList.remove("show");
                addCompareFund(input.value.trim(), container);
            }
        });
    }

    // 添加对比按钮
    const btnAdd = container.querySelector("#btnAddCompare");
    if (btnAdd && input) {
        btnAdd.addEventListener("click", () => addCompareFund(input.value.trim(), container));
    }

    // 删除对比
    container.querySelectorAll(".compare-chip-x").forEach(btn => {
        btn.addEventListener("click", () => {
            compareState.compareFunds = compareState.compareFunds.filter(c => c !== btn.dataset.code);
            refreshCompare(container);
        });
    });

    // 快捷添加（持仓）
    container.querySelectorAll(".compare-quick-btn").forEach(btn => {
        btn.addEventListener("click", () => addCompareFund(btn.dataset.code, container));
    });

    // 周期切换
    container.querySelectorAll(".compare-period-btns .compare-period-btn").forEach(btn => {
        btn.addEventListener("click", function () {
            container.querySelectorAll(".compare-period-btns .compare-period-btn").forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            compareState.currentPeriod = this.dataset.period;
            renderCompareChart(compareState.currentPeriod);
        });
    });

    // 信号单元格点击
    container.querySelectorAll(".signal-cell").forEach(cell => {
        cell.addEventListener("click", () => openSignalModal(cell.dataset.code));
    });
}

// ============================================================
async function doSearch(query, acBox, input, container) {
    try {
        const r = await fetch(`/api/fund/search?q=${encodeURIComponent(query)}`);
        const data = await r.json();
        if (!data.length) { acBox.classList.remove("show"); return; }

        acBox.innerHTML = data.slice(0, 6).map(f =>
            `<div class="ac-item" data-code="${f.code}">
                <span class="ac-code">${f.code}</span>
                <span class="ac-name">${f.name}</span>
                <span class="ac-type">${f.type}</span>
            </div>`
        ).join("");
        acBox.classList.add("show");

        acBox.querySelectorAll(".ac-item").forEach(item => {
            item.addEventListener("click", () => {
                input.value = "";
                acBox.classList.remove("show");
                addCompareFund(item.dataset.code, container);
            });
        });
    } catch (e) {
        console.error("Compare search:", e);
    }
}

// ============================================================
// 添加 / 刷新
// ============================================================

async function addCompareFund(code, container) {
    if (compareLoading) { showToast("对比数据加载中，请稍候"); return; }

    // 支持纯代码和名称
    let fundCode = code;

    // 如果不是6位数字，尝试搜索
    if (!/^\d{6}$/.test(fundCode)) {
        try {
            const r = await fetch(`/api/fund/search?q=${encodeURIComponent(fundCode)}`);
            const data = await r.json();
            if (data.length > 0) {
                fundCode = data[0].code;
            } else {
                showToast("未找到匹配的基金"); return;
            }
        } catch {
            showToast("搜索失败"); return;
        }
    }

    if (compareState.compareFunds.includes(fundCode)) { showToast("已在对比列表中"); return; }
    if (compareState.compareFunds.length >= 3) { showToast("最多对比3只基金"); return; }

    compareLoading = true;
    compareState.compareFunds.push(fundCode);
    try {
        await fetchCompareData(compareState.compareFunds);
        if (!compareState.compareData[fundCode]) {
            compareState.compareFunds = compareState.compareFunds.filter(c => c !== fundCode);
            showToast("基金数据获取失败，无法加入对比");
            await fetchCompareData(compareState.compareFunds);
        }
        renderFundCompare(container);
    } finally {
        compareLoading = false;
    }
}

async function refreshCompare(container) {
    if (compareLoading) { showToast("对比数据加载中，请稍候"); return; }

    compareLoading = true;
    try {
        if (compareState.compareFunds.length) {
            await fetchCompareData(compareState.compareFunds);
        }
        renderFundCompare(container);
    } finally {
        compareLoading = false;
    }
}

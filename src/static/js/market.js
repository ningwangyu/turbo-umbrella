/**
 * 市场指数模块 — A股三大指数获取/渲染 + 指数详情弹窗
 */
import { $, $indexModal, $indexModalTitle, $indexModalBody, $indexModalClose } from './state.js';
import { colorCls, showToast } from './utils.js';

/** 获取并渲染A股三大指数 */
export async function fetchMarketIndex() {
    try { const r = await fetch("/api/market/index"); const data = await r.json(); renderMarketIndex(data); } catch (e) { console.error("Index:", e); }
}

export function applyMarketIndex(data) {
    if (!data || data.error) return;
    renderMarketIndex(data);
}

function renderMarketIndex(data) {
    const mapping = { "sh000001": "idx-sh", "sz399001": "idx-sz", "sz399006": "idx-cy" };
    for (const [key, domId] of Object.entries(mapping)) {
        const item = data[key], el = $(domId);
        if (!item || !el) continue;
        const dir = colorCls(item.change);
        el.querySelector(".index-price").textContent = item.price.toFixed(2);
        el.querySelector(".index-price").className = "index-price " + dir;
        const sign = item.change >= 0 ? "+" : "";
        el.querySelector(".index-change").textContent = `${sign}${item.change.toFixed(2)} (${sign}${item.change_pct.toFixed(2)}%)`;
        el.querySelector(".index-change").className = "index-change " + dir;
    }
}

/** 初始化指数详情弹窗事件 */
export function initIndexModal() {
    document.querySelectorAll(".index-item").forEach(item => {
        item.addEventListener("click", async function () {
            const key = this.dataset.key;
            try {
                const r = await fetch("/api/market/index");
                const data = await r.json();
                const idx = data[key];
                if (!idx) { showToast("无数据"); return; }
                $indexModalTitle.textContent = idx.name + " 详情";
                const dir = colorCls(idx.change);
                $indexModalBody.innerHTML = `
                    <div class="index-detail-grid">
                        <div class="index-detail-item"><span class="index-detail-label">最新价</span><span class="index-detail-value ${dir}">${idx.price.toFixed(2)}</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">涨跌额</span><span class="index-detail-value ${dir}">${idx.change >= 0 ? "+" : ""}${idx.change.toFixed(2)}</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">涨跌幅</span><span class="index-detail-value ${dir}">${idx.change >= 0 ? "+" : ""}${idx.change_pct.toFixed(2)}%</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">振幅</span><span class="index-detail-value">${idx.amplitude.toFixed(2)}%</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">今开</span><span class="index-detail-value">${idx.open.toFixed(2)}</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">昨收</span><span class="index-detail-value">${idx.prev_close.toFixed(2)}</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">最高</span><span class="index-detail-value up">${idx.high.toFixed(2)}</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">最低</span><span class="index-detail-value down">${idx.low.toFixed(2)}</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">成交量</span><span class="index-detail-value">${idx.volume.toFixed(0)} 万手</span></div>
                        <div class="index-detail-item"><span class="index-detail-label">成交额</span><span class="index-detail-value">${idx.amount.toFixed(0)} 亿</span></div>
                    </div>
                    <div style="font-size:10px;color:#bbb;text-align:right;">${idx.trade_date}</div>`;
                $indexModal.classList.add("show");
            } catch (e) { showToast("获取详情失败"); }
        });
    });
    $indexModalClose.addEventListener("click", () => $indexModal.classList.remove("show"));
    $indexModal.addEventListener("click", e => { if (e.target === $indexModal) $indexModal.classList.remove("show"); });
}

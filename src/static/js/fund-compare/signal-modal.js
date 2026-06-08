/** 信号解读弹窗模块 — 将量化因子评分翻译成用户可理解的买卖依据。 */
import { fundDataCache, signalCache } from '../state.js';

export function openSignalModal(code) {
    const sig = signalCache[code];
    if (!sig || sig.error) return;

    // 移除已有弹窗
    closeSignalModal();

    const fd = fundDataCache[code];
    const name = fd ? fd.name : code;
    const sLabel = sig.signal_en === "strong_buy" || sig.signal_en === "buy" ? "buy"
        : sig.signal_en === "strong_sell" || sig.signal_en === "sell" ? "sell" : "hold";

    let html = '<div class="detail-signal">';
    html += `<div class="detail-signal-left"><span class="signal-label ${sLabel}">${sig.signal}</span><span class="signal-sub">买${sig.buy_score} / 卖${sig.sell_score}</span></div>`;
    html += `<div class="detail-signal-meter"><span class="meter-label" style="color:var(--down)">买</span><div class="meter-bar-bg"><div class="meter-indicator" style="left:${sig.buy_score}%"></div></div><span class="meter-label" style="color:var(--up)">卖</span></div>`;
    html += `<div class="detail-signal-summary">${sig.summary}</div>`;

    if (sig.factors && sig.factors.length) {
        html += '<div class="factor-list">';
        sig.factors.forEach(f => {
            const fDir = f.score >= 55 ? "up" : f.score <= 45 ? "down" : "flat";
            html += `<div class="factor-row"><span class="factor-name">${f.name}</span><div class="factor-bar-bg"><div class="factor-bar-fill ${fDir}" style="width:${Math.max(5, Math.min(100, f.score))}%"></div></div><span class="factor-score ${fDir}">${f.score}</span><span class="factor-detail">${f.detail || ""}</span></div>`;
        });
        html += '</div>';
    }

    // 参考结论
    const conclusion = generateSignalConclusion(sig);
    html += `<div class="signal-conclusion">${conclusion}</div>`;
    html += '</div>';

    const mask = document.createElement("div");
    mask.className = "modal-mask show";
    mask.id = "compareSignalModal";
    mask.innerHTML = `<div class="modal" style="max-width:520px;">
        <div class="modal-top"><h3>${name} 量化信号详情</h3><button class="modal-close" id="compareSignalClose">&times;</button></div>
        <div class="signal-modal-body">${html}</div>
    </div>`;

    document.body.appendChild(mask);

    mask.querySelector("#compareSignalClose").addEventListener("click", closeSignalModal);
    mask.addEventListener("click", e => { if (e.target === mask) closeSignalModal(); });
}

function closeSignalModal() {
    const m = document.getElementById("compareSignalModal");
    if (m) m.remove();
}

export function generateSignalConclusion(sig) {
    const bullish = sig.factors.filter(f => f.score >= 55).length;
    const bearish = sig.factors.filter(f => f.score <= 45).length;
    const total = sig.factors.length;

    let text = "";
    if (sig.buy_score >= 70) {
        text = `${total}项指标中${bullish}项看多、${bearish}项看空，多头信号占优。当前买入评分${sig.buy_score}分，处于偏高区间，综合判断倾向买入。`;
    } else if (sig.buy_score >= 55) {
        text = `${total}项指标中${bullish}项看多、${bearish}项看空，信号偏多但不强烈。当前买入评分${sig.buy_score}分，可适量关注，注意控制仓位。`;
    } else if (sig.buy_score >= 45) {
        text = `${total}项指标中${bullish}项看多、${bearish}项看空，多空分歧不大。当前买入评分${sig.buy_score}分，建议观望为主，等待更明确信号。`;
    } else if (sig.buy_score >= 30) {
        text = `${total}项指标中${bullish}项看多、${bearish}项看空，空头信号占优。当前买入评分${sig.buy_score}分，综合判断倾向卖出，建议减仓规避风险。`;
    } else {
        text = `${total}项指标中${bullish}项看多、${bearish}项看空，空头信号强烈。当前买入评分${sig.buy_score}分，建议尽快卖出止损。`;
    }
    return text;
}


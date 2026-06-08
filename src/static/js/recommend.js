/**
 * 推荐系统模块 — 获取、筛选、渲染推荐列表，并支持一键加入持仓。
 *
 * 创新点：前端不重新计算推荐结论，只展示后端推荐引擎给出的评分、因子和分层标签，
 * 保证“推荐依据”与后端算法一致，同时通过筛选器降低高分候选过多时的阅读成本。
 */
import { holdings, $recommendList, $addHoldingModal, $addHoldingClose, $addHoldingCode, $addHoldingName, $addHoldingValue, $addHoldingProfit, $btnConfirmAddHolding, $recFilter, allRecommendData, recMeta, setAllRecommendData, setRecMeta, fundDataCache, signalCache, saveHoldingToServer } from './state.js';
import { colorCls, fmtMoney, fmtPlain, showToast } from './utils.js';
import { fetchFundData, renderFundList, renderSummary } from './fund-card.js';

function _renderRecError(type, retryFn) {
    const retryBtn = retryFn ? '<button class="btn-retry" onclick="this.parentElement._retry()">重试</button>' : '';
    const configs = {
        network: { icon: '📡', title: '网络连接失败', desc: '无法连接到服务器，请检查网络后重试', color: '#e74c3c' },
        server:  { icon: '⚠️', title: '服务暂时不可用', desc: '推荐引擎计算异常，请稍后重试', color: '#e67e22' },
        empty:   { icon: '📭', title: '暂无推荐数据', desc: '候选基金池为空，可能是数据源暂不可用', color: '#999' },
    };
    const c = configs[type] || configs.server;
    $recommendList.innerHTML = `<div class="panel-loading" style="color:${c.color};text-align:center;padding:24px 16px">
        <div style="font-size:32px;margin-bottom:8px">${c.icon}</div>
        <div style="font-weight:600;margin-bottom:4px">${c.title}</div>
        <div style="font-size:12px;color:#999;margin-bottom:12px">${c.desc}</div>
        ${retryBtn}
    </div>`;
    if (retryFn) $recommendList.querySelector('.btn-retry').onclick = retryFn;
}

export async function fetchRecommendations() {
    if (!$recommendList) return;
    $recommendList.innerHTML = '<div class="panel-loading">加载中...</div>';
    try {
        const r = await fetch("/api/fund/recommend");
        if (!r.ok) {
            console.error("Recommend HTTP error:", r.status);
            _renderRecError('server', fetchRecommendations);
            return;
        }
        const resp = await r.json();
        if (resp.error) {
            console.error("Recommend API error:", resp.error);
            _renderRecError('server', fetchRecommendations);
            return;
        }
        const items = resp.items || resp;
        setAllRecommendData(items);
        setRecMeta(resp.meta || null);
        if (!items || !items.length) {
            _renderRecError('empty', fetchRecommendations);
            return;
        }
        applyRecFilter();
    } catch (e) {
        console.error("Recommend:", e);
        _renderRecError('network', fetchRecommendations);
    }
}

export function applyRecFilter() {
    const filter = $recFilter ? $recFilter.value : "all";
    let filtered = allRecommendData;
    if (filter !== "all") {
        filtered = allRecommendData.filter(item => item.recommend_level === filter);
    }
    const countEl = document.getElementById("recFilterCount");
    if (countEl) {
        if (recMeta && recMeta.total_scored) {
            countEl.textContent = `${filtered.length}只（共评估${recMeta.total_scored}只）`;
        } else {
            countEl.textContent = `${filtered.length}/${allRecommendData.length}`;
        }
    }
    renderRecommendations(filtered);
}

function renderRecommendations(items) {
    if (!$recommendList) return;
    if (!items || !items.length) { $recommendList.innerHTML = '<div class="panel-loading" style="color:#999">暂无推荐</div>'; return; }
    const alreadyHeld = new Set(holdings.map(h => h.code));
    $recommendList.innerHTML = items.map(item => {
        const held = alreadyHeld.has(item.code), chgDir = colorCls(+item.estimated_change_pct || 0);
        const level = item.recommend_level || "hold";
        const label = item.recommend_label || "观望";
        const labelClass = level === "strong_buy" ? "rec-strong" : level === "buy" ? "rec-buy" : level === "watch" ? "rec-watch" : "rec-hold";
        const wScore = item.weighted_score || item.buy_score || 50;
        let factorRows = "";
        if (item.factors && item.factors.length) { factorRows = item.factors.map(f => { const fDir = f.score >= 55 ? "up" : f.score <= 45 ? "down" : "flat"; const ddLabel = f.drawdown_label ? `<span style="font-size:9px;color:var(--text3);margin-left:4px">${f.drawdown_label}</span>` : ''; return `<div class="recommend-expand-row"><span class="recommend-expand-name">${f.name}</span><div class="recommend-expand-bar-bg"><div class="recommend-expand-bar ${fDir}" style="width:${Math.max(5, Math.min(100, f.score))}%"></div></div><span class="recommend-expand-score" style="color:var(--${fDir})">${f.score}</span>${ddLabel}</div>`; }).join(""); }
        return `<div class="recommend-card ${labelClass}" data-code="${item.code}">
            <div class="recommend-card-head"><span class="recommend-card-name">${item.name}</span><span class="recommend-card-label ${labelClass}">${label}</span></div>
            <div class="recommend-card-info"><span class="recommend-card-code">${item.code}</span><span class="recommend-card-type">${item.type}</span><span>净值 ${item.nav}</span><span class="${chgDir}">${fmtMoney(+item.estimated_change_pct || 0)}%</span><span class="rec-score">评分${wScore.toFixed(0)}</span></div>
            <div class="recommend-card-factors">共${item.factor_total || 0}项指标，<span class="bull">${item.bullish_count || 0}项看多</span>，<span class="bear">${item.bearish_count || 0}项看空</span>。今日估值${fmtMoney(+item.estimated_change_pct || 0)}%。</div>
            ${item.reference_rule ? `<div class="recommend-card-rule">${item.reference_rule}</div>` : ""}
            <div class="recommend-card-expand" id="recExpand-${item.code}">${factorRows}</div>
            <div class="recommend-card-bottom"><span class="recommend-card-signal ${labelClass}">${item.signal || item.recommend_label}</span>${held ? '<span style="font-size:9px;color:#999">已持有</span>' : `<button class="recommend-card-add" data-code="${item.code}" data-name="${item.name}">+ 加入持仓</button>`}</div>
        </div>`;
    }).join("");
    $recommendList.querySelectorAll(".recommend-card").forEach(card => { card.addEventListener("click", function (e) { if (e.target.closest(".recommend-card-add")) return; const expand = this.querySelector(".recommend-card-expand"); if (expand) expand.classList.toggle("show"); }); });
    $recommendList.querySelectorAll(".recommend-card-add").forEach(btn => { btn.addEventListener("click", function (e) { e.stopPropagation(); const code = this.dataset.code, name = this.dataset.name; if (holdings.some(h => h.code === code)) { showToast("该基金已存在"); return; } openAddHoldingModal(code, name); }); });
}

export function openAddHoldingModal(code, name) { $addHoldingModal.classList.add("show"); $addHoldingCode.value = code; $addHoldingName.textContent = name || code; $addHoldingValue.value = ""; $addHoldingProfit.value = ""; $addHoldingValue.focus(); }
function closeAddHoldingModal() { $addHoldingModal.classList.remove("show"); }

export function initRecommendModule() {
    if ($recFilter) { $recFilter.addEventListener("change", applyRecFilter); }
    $addHoldingClose.addEventListener("click", closeAddHoldingModal);
    $addHoldingModal.addEventListener("click", function (e) { if (e.target === $addHoldingModal) closeAddHoldingModal(); });
    $btnConfirmAddHolding.addEventListener("click", async function () {
        const code = $addHoldingCode.value, value = $addHoldingValue.value.trim(), profit = $addHoldingProfit.value.trim();
        if (!value || +value <= 0) { showToast("请输入持有金额"); return; }
        if (holdings.some(h => h.code === code)) { showToast("该基金已存在"); closeAddHoldingModal(); return; }
        this.disabled = true; this.textContent = "添加中...";
        const fd = await fetchFundData(code);
        if (!fd) { showToast("获取基金数据失败"); this.disabled = false; this.textContent = "确认加入"; return; }
        await saveHoldingToServer({ code, value: +value || 0, profit: +profit || 0 }); fundDataCache[code] = fd;
        renderFundList(); renderSummary(); fetchRecommendations(); closeAddHoldingModal();
        this.disabled = false; this.textContent = "确认加入"; showToast(`已添加 ${fd.name}`); fetchSignal(code);
    });
    $addHoldingProfit.addEventListener("keydown", e => { if (e.key === "Enter") $btnConfirmAddHolding.click(); });
    $addHoldingValue.addEventListener("keydown", e => { if (e.key === "Enter") $addHoldingProfit.focus(); });
}

async function fetchSignal(code) { try { const r = await fetch(`/api/fund/signal/${code}`); const data = await r.json(); if (!data.error) { signalCache[code] = data; renderFundList(); renderSummary(); } } catch (e) { console.error("Signal:", e); } }

/** ETF 情绪模块 — 展示连续流入/流出 ETF，突出资金行为的持续性。 */
import { ETF_CONSECUTIVE_DAY_OPTIONS, sentimentState } from './state.js';
import { fetchEtfConsecutive } from './api.js';

export function bindEtfTabs() {
    document.querySelectorAll('.etf-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            const tabKey = this.dataset.etfTab;
            document.querySelectorAll('.etf-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.etf-tab-panel').forEach(p => p.classList.remove('show'));
            const target = tabKey === 'daily' ? document.getElementById('etfTabDaily') : document.getElementById('etfTabConsecutive');
            if (target) target.classList.add('show');
            if (tabKey === 'consecutive' && !sentimentState.etfConsecutiveLoaded) {
                loadEtfConsecutive(sentimentState.currentEtfConsecutiveDays);
            }
        });
    });

    document.querySelectorAll('.consecutive-filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const days = Number(this.dataset.days) || 7;
            if (days === sentimentState.currentEtfConsecutiveDays && sentimentState.etfConsecutiveCache[days]) return;
            sentimentState.currentEtfConsecutiveDays = days;
            document.querySelectorAll('.consecutive-filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            loadEtfConsecutive(days);
        });
    });

    document.querySelectorAll('.consecutive-flow-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const flow = this.dataset.flow === 'outflow' ? 'outflow' : 'inflow';
            if (flow === sentimentState.currentEtfConsecutiveFlow) return;
            sentimentState.currentEtfConsecutiveFlow = flow;
            document.querySelectorAll('.consecutive-flow-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const panel = document.getElementById('etfConsecutiveContent');
            const cached = sentimentState.etfConsecutiveCache[sentimentState.currentEtfConsecutiveDays];
            if (panel && cached) renderEtfConsecutive(panel, cached);
        });
    });
}

async function loadEtfConsecutive(days = sentimentState.currentEtfConsecutiveDays) {
    const panel = document.getElementById('etfConsecutiveContent');
    if (!panel) return;

    if (sentimentState.etfConsecutiveCache[days]) {
        renderEtfConsecutive(panel, sentimentState.etfConsecutiveCache[days]);
        sentimentState.etfConsecutiveLoaded = true;
        return;
    }

    const requestId = ++sentimentState.etfConsecutiveRequestId;
    panel.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载持续流入流出数据...</div>';

    try {
        const data = await fetchEtfConsecutive(days);
        if (requestId !== sentimentState.etfConsecutiveRequestId || days !== sentimentState.currentEtfConsecutiveDays) return;
        sentimentState.etfConsecutiveCache[days] = data;
        sentimentState.etfConsecutiveLoaded = true;
        renderEtfConsecutive(panel, data);
    } catch (e) {
        if (requestId !== sentimentState.etfConsecutiveRequestId || days !== sentimentState.currentEtfConsecutiveDays) return;
        panel.innerHTML = `<div class="panel-loading" style="color:var(--up)">${e.message || '加载失败'}</div>`;
    }
}

function renderEtfConsecutive(panel, data) {
    const days = data.days || sentimentState.currentEtfConsecutiveDays;
    const inflow = data.inflow || [];
    const outflow = data.outflow || [];
    const flow = sentimentState.currentEtfConsecutiveFlow === 'outflow' ? 'outflow' : 'inflow';
    const list = flow === 'inflow' ? inflow : outflow;
    const flowText = flow === 'inflow' ? '流入' : '流出';
    const flowClass = flow === 'inflow' ? 'up' : 'down';

    if (!inflow.length && !outflow.length) {
        const hasLocalStats = data.latest_trade_date || data.updated_at;
        panel.innerHTML = `<div class="detail-empty">${hasLocalStats ? `暂无连续${formatConsecutiveDays(days)}流入/流出数据` : '暂无本地 ETF 资金流统计，请先刷新数据'}</div>`;
        return;
    }

    if (!list.length) {
        panel.innerHTML = `<div class="consecutive-summary">连续${formatConsecutiveDays(days)}及以上：流入 ${inflow.length} 只 / 流出 ${outflow.length} 只</div>
            <div class="detail-empty">暂无连续${formatConsecutiveDays(days)}及以上${flowText}数据</div>`;
        return;
    }

    let html = `<div class="consecutive-summary">连续${formatConsecutiveDays(days)}及以上：流入 ${inflow.length} 只 / 流出 ${outflow.length} 只</div>
        <div class="consecutive-section">
            <div class="consecutive-title ${flowClass}">持续${flowText}排行</div>`;

    list.forEach((etf, i) => {
        const rank = i < 3 ? "top3" : "";
        const totalFlow = flow === 'inflow' && etf.total_flow > 0 ? `+${etf.total_flow}` : etf.total_flow;
        html += `<div class="consecutive-row">
            <span class="consecutive-rank ${rank}">${i + 1}</span>
            <span class="consecutive-name">${etf.name}</span>
            <span class="consecutive-code">${etf.code}</span>
            <span class="consecutive-days ${flowClass}">${etf.consecutive_days}天</span>
            <span class="consecutive-flow ${flowClass}">${totalFlow}亿</span>
        </div>`;
    });
    html += `</div>`;

    panel.innerHTML = html;
}

export function formatConsecutiveDays(days) {
    return ETF_CONSECUTIVE_DAY_OPTIONS.find(opt => opt.value === days)?.label || `${days}天`;
}


// ==================== Canvas仪表盘 ====================


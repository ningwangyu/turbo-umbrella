import { analysisData } from './state.js';
import { colorCls } from '../utils.js';

export function renderDiversificationSection() {
    const div = analysisData.diversification;
    const conc = analysisData.sector_concentration;
    if (!div) return '';

    const sectorCount = analysisData.sector_distribution ? analysisData.sector_distribution.length : 0;
    const fundCount = analysisData.sector_distribution
        ? analysisData.sector_distribution.reduce((sum, s) => sum + (s.fund_count || 0), 0) : 0;
    const scoreColor = div.score >= 60 ? 'down' : div.score >= 40 ? '' : 'up';
    const scoreLevel = div.score >= 80 ? '优秀' : div.score >= 60 ? '良好' : div.score >= 40 ? '一般' : div.score >= 20 ? '较差' : '集中';
    const scoreDesc = div.score >= 60 ? '分散良好' : div.score >= 40 ? '适度集中' : '集中度偏高';

    let html = `<div class="pa-div-section">
        <div class="pa-div-grid">
            <div class="pa-div-score-wrap">
                <div class="pa-div-ring">
                    <svg viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" stroke-width="8"/>
                        <circle cx="50" cy="50" r="42" fill="none"
                            stroke="${div.score >= 60 ? 'var(--down)' : div.score >= 40 ? '#f5a623' : 'var(--up)'}"
                            stroke-width="8"
                            stroke-dasharray="${(div.score / 100) * 263.9} 263.9"
                            stroke-linecap="round" transform="rotate(-90 50 50)"
                            class="pa-ring-progress"/>
                    </svg>
                    <div class="pa-div-score-num">${div.score}</div>
                </div>
                <div class="pa-div-score-label">多样化评分</div>
                <div class="pa-div-score-level ${scoreColor}">${scoreLevel}</div>
                <div class="pa-div-score-desc">${scoreDesc}</div>
            </div>
            <div class="pa-div-indicators">
                <div class="pa-div-ind">
                    <div class="pa-div-ind-label">板块数量</div>
                    <div class="pa-div-ind-value">${sectorCount}个</div>
                </div>
                <div class="pa-div-ind">
                    <div class="pa-div-ind-label">涉及基金</div>
                    <div class="pa-div-ind-value">${fundCount}只</div>
                </div>
                <div class="pa-div-ind">
                    <div class="pa-div-ind-label">
                        HHI指数
                        <span class="pa-help-btn pa-help-inline" data-help="hhi">?</span>
                    </div>
                    <div class="pa-div-ind-value">${div.hhi}</div>
                </div>
                <div class="pa-div-ind">
                    <div class="pa-div-ind-label">最大板块</div>
                    <div class="pa-div-ind-value ${conc && conc.warning ? 'up' : ''}">${conc ? conc.max_sector : '--'}</div>
                    <div class="pa-div-ind-sub">${conc ? conc.max_pct + '%' : ''}</div>
                </div>
            </div>
        </div>`;

    if (conc && conc.warning) {
        html += `<div class="pa-conc-warning">
            <span class="pa-conc-icon">&#9888;</span>
            <span>${conc.message}</span>
        </div>`;
    }

    html += `</div>`;
    return html;
}

// ==================== ③ 板块分布 ====================
export function renderSectorSection() {
    const sectors = analysisData.sector_distribution;
    if (!sectors || !sectors.length) return '';

    const sectorColors = [
        '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7',
        '#06b6d4', '#d97706', '#ec4899', '#6366f1', '#14b8a6',
        '#f97316', '#64748b',
    ];

    let html = `<div class="pa-analysis-card pa-sector-section">
        <div class="pa-card-title">板块分布
            <span class="pa-card-sub">基于基金属性与重仓股行业映射</span>
        </div>
        <div class="pa-sector-layout">
            <div class="pa-sector-chart-wrap">
                <canvas id="sectorChart" width="220" height="220"></canvas>
            </div>
            <div class="pa-sector-bars">`;

    const maxWeight = sectors[0].weight;
    sectors.forEach((s, i) => {
        const barW = maxWeight > 0 ? (s.weight / maxWeight) * 100 : 0;
        const color = sectorColors[i % sectorColors.length];
        // 计算该板块涉及的基金数（funds数组 + stocks按fund_name去重）
        const fundNames = new Set();
        if (s.funds) s.funds.forEach(f => fundNames.add(f.name));
        if (s.stocks) s.stocks.forEach(st => fundNames.add(st.fund_name));
        const totalFunds = fundNames.size;
        const fundLabel = totalFunds > 0 ? `${totalFunds}只基金` : `${s.stock_count}只股`;
        html += `<div class="pa-sector-row" data-sector-idx="${i}" style="--bar-color:${color}">
            <span class="pa-sector-name">${s.name}</span>
            <div class="pa-sector-track"><div class="pa-sector-fill" style="width:${barW}%"></div></div>
            <span class="pa-sector-pct">${s.weight.toFixed(1)}%</span>
            <span class="pa-sector-cnt">${fundLabel}</span>
        </div>`;
    });

    html += `</div></div>
        <div class="pa-detail-panel" id="sectorDetailPanel" style="display:none"></div>
    </div>`;
    return html;
}

// ==================== ④ 资产配置分布（Chart.js + 点击展开） ====================
export function renderTypeSection() {
    if (!analysisData.type_distribution || !analysisData.type_distribution.length) return '';

    const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#d97706'];

    let html = `<div class="pa-analysis-card pa-type-section">
        <div class="pa-card-title">资产配置分布</div>
        <div class="pa-sector-layout">
            <div class="pa-sector-chart-wrap">
                <canvas id="typeChart" width="220" height="220"></canvas>
            </div>
            <div class="pa-sector-bars" id="typeLegendList">`;

    analysisData.type_distribution.forEach((item, i) => {
        const color = colors[i % colors.length];
        const fundLabel = item.funds ? `${item.funds.length}只基金` : '';
        html += `<div class="pa-sector-row" data-type-idx="${i}" style="--bar-color:${color}">
            <span class="pa-sector-name">${item.name}</span>
            <div class="pa-sector-track"><div class="pa-sector-fill" style="width:${item.value}%"></div></div>
            <span class="pa-sector-pct">${item.value.toFixed(1)}%</span>
            <span class="pa-sector-cnt">${fundLabel}</span>
        </div>`;
    });

    html += `</div></div>
        <div class="pa-detail-panel" id="typeDetailPanel" style="display:none"></div>
    </div>`;
    return html;
}

// ==================== ⑤ 重叠持仓（可展开） ====================
export function renderOverlapSection() {
    if (!analysisData.stock_overlap || !analysisData.stock_overlap.length) return '';

    let html = `<div class="pa-analysis-card">
        <div class="pa-card-title">重叠持仓
            <span class="pa-card-sub">多只基金共同持有，点击展开明细</span>
        </div>
        <div class="pa-overlap-list">`;

    analysisData.stock_overlap.forEach((s, idx) => {
        html += `<div class="pa-overlap-item" data-idx="${idx}">
            <div class="pa-overlap-main">
                <div class="pa-overlap-left">
                    <span class="pa-overlap-arrow">&#9654;</span>
                    <span class="pa-overlap-name">${s.name}</span>
                    <span class="pa-overlap-code">${s.code}</span>
                </div>
                <div class="pa-overlap-right">
                    <span class="pa-overlap-badge">${s.count}只基金</span>
                    <span class="pa-overlap-pct">${s.total_pct.toFixed(2)}%</span>
                </div>
            </div>
            <div class="pa-overlap-detail" style="display:none">`;

        s.funds.forEach(f => {
            html += `<div class="pa-overlap-fund">
                <span class="pa-overlap-fund-name">${f.name}</span>
                <span class="pa-overlap-fund-pct">持仓 ${f.pct.toFixed(2)}%</span>
            </div>`;
        });

        html += `</div></div>`;
    });

    html += `</div></div>`;
    return html;
}

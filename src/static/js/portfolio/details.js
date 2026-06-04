import { analysisData } from './state.js';

export function showSectorDetail(sector) {
    const panel = document.getElementById("sectorDetailPanel");
    if (!panel) return;

    const isVisible = panel.style.display !== 'none' && panel.dataset.sector === sector.name;
    if (isVisible) { panel.style.display = 'none'; return; }

    let html = `<div class="pa-detail-header">
        <span class="pa-detail-title">${sector.name}</span>
        <span class="pa-detail-weight">组合权重 ${sector.weight.toFixed(2)}%</span>
        <button class="pa-detail-close" onclick="this.closest('.pa-detail-panel').style.display='none'">&times;</button>
    </div>`;

    // 合并基金列表：funds数组 + stocks按fund_name分组
    const allFunds = [];

    // 1) 从funds数组取（基金属性明确的板块）
    if (sector.funds && sector.funds.length) {
        sector.funds.forEach(f => {
            allFunds.push({
                name: f.name,
                code: f.code,
                weight: f.weight,
                holdings: f.top_holdings || [],
            });
        });
    }

    // 2) 从stocks数组按fund_name分组（重仓股分散归类的板块）
    if (sector.stocks && sector.stocks.length) {
        const grouped = {};
        sector.stocks.forEach(st => {
            if (!grouped[st.fund_name]) {
                grouped[st.fund_name] = { holdings: [], weight: 0 };
            }
            grouped[st.fund_name].holdings.push({
                name: st.name,
                code: st.code,
                pct: st.fund_pct,
                portfolio_pct: st.portfolio_pct,
            });
            grouped[st.fund_name].weight += st.portfolio_pct;
        });
        // 只加入funds数组中没有的基金（避免重复）
        const existingNames = new Set(allFunds.map(f => f.name));
        Object.keys(grouped).forEach(fname => {
            if (!existingNames.has(fname)) {
                const code = grouped[fname].holdings[0]?.code?.substring(0, 6) || '';
                allFunds.push({
                    name: fname,
                    code: code,
                    weight: parseFloat(grouped[fname].weight.toFixed(2)),
                    holdings: grouped[fname].holdings,
                });
            }
        });
    }

    // 按权重排序
    allFunds.sort((a, b) => b.weight - a.weight);

    if (allFunds.length) {
        html += `<div class="pa-detail-subtitle">持仓基金</div>`;
        allFunds.forEach((f, fi) => {
            html += `<div class="pa-fund-expand" data-fund-idx="${fi}">
                <div class="pa-fund-row">
                    <span class="pa-fund-arrow">&#9654;</span>
                    <span class="pa-fund-name">${f.name}</span>
                    <span class="pa-pct-cell">${f.weight}%</span>
                </div>`;
            if (f.holdings && f.holdings.length) {
                html += `<div class="pa-fund-holdings" style="display:none">
                    <table class="pa-detail-table"><thead><tr><th>重仓股</th><th>代码</th><th>基金占比</th></tr></thead><tbody>`;
                f.holdings.forEach(s => {
                    html += `<tr><td>${s.name}</td><td class="pa-code-cell">${s.code}</td><td class="pa-pct-cell">${s.pct}%</td></tr>`;
                });
                html += `</tbody></table></div>`;
            } else {
                html += `<div class="pa-fund-holdings" style="display:none"><div class="pa-no-data">暂无重仓股数据</div></div>`;
            }
            html += `</div>`;
        });
    }

    panel.innerHTML = html;
    panel.style.display = 'block';
    panel.dataset.sector = sector.name;

    // 绑定基金展开事件
    panel.querySelectorAll('.pa-fund-expand').forEach(item => {
        item.querySelector('.pa-fund-row').addEventListener('click', () => {
            const holdings = item.querySelector('.pa-fund-holdings');
            const arrow = item.querySelector('.pa-fund-arrow');
            const isOpen = holdings.style.display !== 'none';
            holdings.style.display = isOpen ? 'none' : 'block';
            if (arrow) arrow.innerHTML = isOpen ? '&#9654;' : '&#9660;';
            item.classList.toggle('pa-expanded', !isOpen);
        });
    });

    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function showTypeDetail(typeItem, color) {
    const panel = document.getElementById("typeDetailPanel");
    if (!panel) return;

    const isVisible = panel.style.display !== 'none' && panel.dataset.type === typeItem.name;
    if (isVisible) { panel.style.display = 'none'; return; }

    let html = `<div class="pa-detail-header">
        <span class="pa-detail-title" style="color:${color}">${typeItem.name}</span>
        <span class="pa-detail-weight">配置占比 ${typeItem.value.toFixed(2)}%</span>
        <button class="pa-detail-close" onclick="this.closest('.pa-detail-panel').style.display='none'">&times;</button>
    </div>`;

    if (typeItem.funds && typeItem.funds.length) {
        html += `<div class="pa-detail-table-wrap"><table class="pa-detail-table">
            <thead><tr><th>基金名称</th><th>基金代码</th><th>组合权重</th></tr></thead>
            <tbody>`;
        typeItem.funds.forEach(f => {
            html += `<tr><td>${f.name}</td><td class="pa-code-cell">${f.code}</td><td class="pa-pct-cell">${f.weight}%</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }

    panel.innerHTML = html;
    panel.style.display = 'block';
    panel.dataset.type = typeItem.name;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

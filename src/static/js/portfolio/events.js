/** 组合事件模块 — 绑定分析页展开、刷新和图表交互事件。 */
import { analysisData } from './state.js';
import { showHelpTip, showDrawdownDetail } from './risk.js';
import { showSectorDetail, showTypeDetail } from './details.js';

export function bindAllEvents(container) {
    // 板块分布点击
    container.querySelectorAll('.pa-sector-row[data-sector-idx]').forEach(row => {
        row.addEventListener('click', () => {
            const idx = parseInt(row.dataset.sectorIdx);
            const sectors = analysisData.sector_distribution;
            if (sectors && sectors[idx]) showSectorDetail(sectors[idx]);
        });
    });

    // 资产配置点击
    container.querySelectorAll('.pa-sector-row[data-type-idx]').forEach(row => {
        row.addEventListener('click', () => {
            const idx = parseInt(row.dataset.typeIdx);
            const types = analysisData.type_distribution;
            const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#d97706'];
            if (types && types[idx]) showTypeDetail(types[idx], colors[idx % colors.length]);
        });
    });

    // 重叠持仓展开
    container.querySelectorAll('.pa-overlap-item').forEach(item => {
        item.addEventListener('click', () => {
            const detail = item.querySelector('.pa-overlap-detail');
            const arrow = item.querySelector('.pa-overlap-arrow');
            if (!detail) return;
            const isOpen = detail.style.display !== 'none';
            detail.style.display = isOpen ? 'none' : 'block';
            if (arrow) arrow.innerHTML = isOpen ? '&#9654;' : '&#9660;';
            item.classList.toggle('pa-expanded', !isOpen);
        });
    });

    // 帮助按钮
    container.querySelectorAll('.pa-help-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            showHelpTip(btn.dataset.help);
        });
    });

    // 回撤点击
    const ddCard = container.querySelector('[data-action="showDrawdown"]');
    if (ddCard) {
        ddCard.addEventListener('click', e => {
            if (e.target.classList.contains('pa-help-btn')) return;
            showDrawdownDetail();
        });
    }
}

export function initPortfolioAnalysis() {}

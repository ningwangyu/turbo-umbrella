import { showSectorDetail, showTypeDetail } from './details.js';
import { analysisData } from './state.js';

export function renderSectorChart() {
    const canvas = document.getElementById("sectorChart");
    if (!canvas || !analysisData.sector_distribution) return;

    const sectors = analysisData.sector_distribution;
    const colors = [
        '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7',
        '#06b6d4', '#d97706', '#ec4899', '#6366f1', '#14b8a6',
        '#f97316', '#64748b',
    ];

    if (window._sectorChartInstance) window._sectorChartInstance.destroy();

    window._sectorChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: sectors.map(s => s.name),
            datasets: [{
                data: sectors.map(s => s.weight),
                backgroundColor: sectors.map((_, i) => colors[i % colors.length]),
                borderWidth: 2,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fff',
                hoverBorderWidth: 3,
            }]
        },
        options: {
            responsive: false,
            cutout: '55%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => {
                            const s = sectors[ctx.dataIndex];
                            const label = s.fund_count ? `${s.fund_count}只基金` : `${s.stock_count}只股票`;
                            return `${s.name}: ${s.weight.toFixed(1)}% (${label})`;
                        }
                    }
                }
            },
            onClick: (evt, elements) => {
                if (elements.length > 0) {
                    showSectorDetail(sectors[elements[0].index]);
                }
            }
        }
    });
}

export function renderTypePieChart() {
    const data = analysisData.type_distribution;
    if (!data || !data.length) return;

    const canvas = document.getElementById("typeChart");
    if (!canvas) return;

    const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#d97706'];

    if (window._typeChartInstance) window._typeChartInstance.destroy();

    window._typeChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.name),
            datasets: [{
                data: data.map(d => d.value),
                backgroundColor: data.map((_, i) => colors[i % colors.length]),
                borderWidth: 2,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fff',
                hoverBorderWidth: 3,
            }]
        },
        options: {
            responsive: false,
            cutout: '55%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => {
                            const item = data[ctx.dataIndex];
                            const fundLabel = item.funds ? ` (${item.funds.length}只基金)` : '';
                            return `${item.name}: ${item.value.toFixed(1)}%${fundLabel}`;
                        }
                    }
                }
            },
            onClick: (evt, elements) => {
                if (elements.length > 0) {
                    showTypeDetail(data[elements[0].index], colors[elements[0].index]);
                }
            }
        }
    });
}

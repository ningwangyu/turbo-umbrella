import { fetchPortfolioAnalysis } from './portfolio/api.js';
import { setAnalysisData } from './portfolio/state.js';
import { renderRiskSection } from './portfolio/risk.js';
import { renderDiversificationSection, renderSectorSection, renderTypeSection, renderOverlapSection } from './portfolio/allocation.js';
import { renderSectorChart, renderTypePieChart } from './portfolio/charts.js';
import { bindAllEvents } from './portfolio/events.js';
export { fetchPortfolioAnalysis } from './portfolio/api.js';
export { PORTFOLIO_CSS } from './portfolio/styles.js';

export function renderPortfolioAnalysis(container) {
    fetchPortfolioAnalysis().then(data => {
        if (data.error) {
            container.innerHTML = `<div class="panel-loading" style="color:var(--up)">${data.error}</div>`;
            return;
        }
        setAnalysisData(data);
        container.innerHTML = `
            <div class="portfolio-analysis">
                ${renderRiskSection()}
                ${renderDiversificationSection()}
                ${renderSectorSection()}
                ${renderTypeSection()}
                ${renderOverlapSection()}
            </div>`;
        renderSectorChart();
        renderTypePieChart();
        bindAllEvents(container);
    }).catch(() => {
        container.innerHTML = '<div class="panel-loading" style="color:var(--up)">组合分析失败</div>';
    });
}

export function initPortfolioAnalysis() {}

/**
 * 风险分析模块入口 — 懒加载facade
 *
 * 导出 renderRiskAnalysis() 和 RISK_ANALYSIS_CSS 供 app.js 动态导入。
 * 内部按功能拆分为多个子模块（allocation, return-trend, benchmark等）。
 */
export { renderRiskAnalysis } from './risk-analysis/render.js';
export { RISK_ANALYSIS_CSS } from './risk-analysis/styles.js';

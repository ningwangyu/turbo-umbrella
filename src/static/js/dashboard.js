/**
 * 仪表盘模块入口 — 懒加载facade
 *
 * 导出 renderDashboard() 和 DASHBOARD_CSS 供 app.js 动态导入。
 * 内部按功能拆分为多个子模块（market-bar, holdings-detail, allocation等）。
 */
export { renderDashboard } from './dashboard/render.js';
export { DASHBOARD_CSS } from './dashboard/styles.js';
export { TIMELINE_CSS } from './dashboard/timeline.js';

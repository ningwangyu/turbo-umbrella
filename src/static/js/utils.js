/**
 * 格式化与UI工具函数
 */
import { $toast } from './state.js';

// 带正负号的金额显示（+123.45 / -67.89）
export function fmtMoney(v) { const n = +v || 0; return (n >= 0 ? "+" : "") + n.toFixed(2); }

// 纯数字金额显示（12345.67）
export function fmtPlain(v) { return (+v || 0).toFixed(2); }

// 涨跌颜色CSS类（涨=up红, 跌=down绿, 平=flat灰）
export function colorCls(v) { const n = +v || 0; return n > 0 ? "up" : n < 0 ? "down" : "flat"; }

// 格式化时间为 HH:MM
export function fmtTime(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }

// 显示轻提示（2.5秒后自动消失）
export function showToast(msg) { if (!$toast) return; $toast.textContent = msg; $toast.classList.add("show"); setTimeout(() => $toast.classList.remove("show"), 2500); }

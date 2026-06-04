/**
 * 数据导出模块 — 导出持仓为JSON/CSV
 */
import { holdings, replaceHoldingsOnServer } from './state.js';
import { showToast } from './utils.js';

/**
 * 渲染数据导出页面
 */
export function renderDataExport(container) {
    let html = '<div class="export-page">';
    html += `<div class="export-card">
        <div class="section-title">数据导出与备份</div>
        <p class="export-desc">导出您的持仓数据，可用于备份或在其他设备恢复。</p>
        <div class="export-actions">
            <button class="btn btn-export" id="btnExportJSON">
                <span class="export-icon">📋</span>导出 JSON
            </button>
            <button class="btn btn-export" id="btnExportCSV">
                <span class="export-icon">📊</span>导出 CSV
            </button>
        </div>
    </div>`;

    html += `<div class="export-card">
        <div class="section-title">数据恢复</div>
        <p class="export-desc">从JSON备份文件恢复持仓数据（将替换当前持仓）。</p>
        <label class="upload-zone" id="importBackupZone" style="margin-top:6px">
            <input type="file" id="backupFileInput" accept=".json" hidden>
            <span class="upload-icon">📁</span><span>点击上传备份文件</span>
        </label>
    </div>`;

    html += '</div>';
    container.innerHTML = html;

    // 绑定事件
    container.querySelector("#btnExportJSON").addEventListener("click", () => exportData("json"));
    container.querySelector("#btnExportCSV").addEventListener("click", () => exportData("csv"));

    const fileInput = container.querySelector("#backupFileInput");
    fileInput.addEventListener("change", (e) => restoreFromBackup(e));
}

async function exportData(format) {
    if (!holdings.length) {
        showToast("没有持仓数据可导出");
        return;
    }

    try {
        const r = await fetch(`/api/export/${format}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ holdings: holdings.map(h => ({ code: h.code, value: h.value, profit: h.profit })) }),
        });

        if (!r.ok) throw new Error("导出失败");

        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fund_holdings_${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("导出成功");
    } catch (e) {
        showToast("导出失败: " + e.message);
    }
}

function restoreFromBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.holdings || !Array.isArray(data.holdings)) {
                showToast("备份文件格式不正确");
                return;
            }

            const newHoldings = data.holdings
                .filter(h => /^\d{6}$/.test(h.code))
                .map(h => ({
                    code: h.code,
                    name: h.name,
                    value: parseFloat(h.holding_value || h.value) || 0,
                    profit: parseFloat(h.holding_profit || h.profit) || 0,
                    source: "backup",
                }));

            if (newHoldings.length === 0) {
                showToast("备份中没有有效持仓数据");
                return;
            }

            if (confirm(`即将恢复 ${newHoldings.length} 只基金的持仓数据，当前持仓将被覆盖。是否继续？`)) {
                replaceHoldingsOnServer(newHoldings).then(() => {
                    showToast(`已恢复 ${newHoldings.length} 只基金，页面将刷新`);
                    setTimeout(() => location.reload(), 1000);
                }).catch(err => {
                    showToast(err.message || "恢复失败");
                });
            }
        } catch (err) {
            showToast("文件解析失败: " + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = "";
}

/**
 * 数据导出CSS
 */
export const EXPORT_CSS = `
.export-page { display: flex; flex-direction: column; gap: 10px; }
.export-card { background: var(--card); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow); }
.export-desc { font-size: 11px; color: var(--text2); margin: 4px 0 8px; line-height: 1.5; }
.export-actions { display: flex; gap: 8px; }
.btn-export { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
    background: var(--primary); color: #fff; border: none; border-radius: 8px; cursor: pointer;
    padding: 10px; font-size: 12px; font-weight: 600; font-family: inherit; transition: all .15s; }
.btn-export:hover { background: var(--primary-dark); }
.btn-export:active { transform: scale(.97); }
.export-icon { font-size: 16px; }
`;

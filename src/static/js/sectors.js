/**
 * 热门板块模块 — 行情获取与渲染
 */
import { $sectorList } from './state.js';
import { colorCls } from './utils.js';

export async function fetchSectors() {
    if (!$sectorList) return;
    try {
        const r = await fetch("/api/market/sectors");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        renderSectors(data);
    } catch (e) {
        if ($sectorList.querySelector('.panel-loading')) {
            $sectorList.innerHTML = '<span style="color:#999;font-size:10px;">暂无数据</span>';
        }
    }
}

function renderSectors(sectors) {
    if (!$sectorList) return;
    if (!sectors || !sectors.length) { $sectorList.innerHTML = '<span style="color:#999;font-size:10px;">暂无数据</span>'; return; }
    const top17 = sectors.slice(0, 17);
    const rest = sectors.slice(17);
    const chipHTML = (s) => {
        const dir = colorCls(s.change_pct), sign = s.change_pct >= 0 ? "+" : "";
        return `<div class="sector-chip"><span class="sector-chip-name">${s.name}</span><span class="sector-chip-change ${dir}">${sign}${s.change_pct.toFixed(2)}%</span>${s.leader_name ? `<span class="sector-chip-leader">${s.leader_name}</span>` : ""}</div>`;
    };
    let row1Chips = top17.map(chipHTML).join("");
    if (rest.length) {
        row1Chips += `<div class="sector-chip sector-more-btn" id="sectorMoreBtn">更多 ▾</div>`;
    }
    let restHTML = "";
    if (rest.length) {
        restHTML = `<div class="sector-row2" id="sectorRow2" style="display:none;">` + rest.map(chipHTML).join("") + `</div>`;
    }
    $sectorList.innerHTML = `<div class="sector-row1">${row1Chips}</div>${restHTML}`;

    const moreBtn = document.getElementById('sectorMoreBtn');
    const row2 = document.getElementById('sectorRow2');
    if (moreBtn) {
        moreBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (row2) {
                const visible = row2.style.display !== 'none';
                row2.style.display = visible ? 'none' : 'flex';
                this.textContent = visible ? '更多 ▾' : '收起 ▴';
            }
        });
    }
}

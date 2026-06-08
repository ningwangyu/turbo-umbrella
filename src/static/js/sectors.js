/**
 * 热门板块模块 — 行情获取与渲染（带 localStorage 持久化 + ETag 条件请求）
 */
import { $sectorList } from './state.js';
import { colorCls } from './utils.js';

const LS_KEY = "dashboard_sectors";
const LS_TTL = 3 * 60 * 1000; // localStorage 缓存 3 分钟（1.5x 后端 TTL）

let sectorsCache = [];
let lastEtag = "";

// ---- localStorage 读写 ----
function loadPersistedSectors() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (Date.now() - entry.ts > LS_TTL) return null;
        lastEtag = entry.etag || "";
        return entry.data;
    } catch { return null; }
}

function persistSectors(data, etag) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({ data, etag: etag || "", ts: Date.now() }));
    } catch { /* quota exceeded, ignore */ }
}

// ---- 首屏快速渲染（从 localStorage） ----
export function restoreSectorsFromCache() {
    const cached = loadPersistedSectors();
    if (cached && cached.length) {
        sectorsCache = cached;
        renderSectors(cached);
        return true;
    }
    return false;
}

export function applySectors(data) {
    if (!data || !data.length) return;
    sectorsCache = data;
    renderSectors(data);
}

export async function fetchSectors() {
    if (!$sectorList) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
        const headers = {};
        if (lastEtag) headers["If-None-Match"] = lastEtag;
        const r = await fetch("/api/market/sectors", { signal: controller.signal, headers });
        if (r.status === 304) {
            if (sectorsCache.length) persistSectors(sectorsCache, lastEtag);
            return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const etag = r.headers.get("ETag") || "";
        const data = await r.json();
        lastEtag = etag;
        persistSectors(data, etag);
        renderSectors(data);
    } catch (e) {
        console.debug("Sectors:", e);
        if (sectorsCache.length) {
            renderSectors(sectorsCache);
        } else if ($sectorList.querySelector('.panel-loading')) {
            $sectorList.innerHTML = '<div class="panel-loading" style="color:#999">热门板块行情暂不可用，稍后自动刷新</div>';
        }
    } finally {
        clearTimeout(timer);
    }
}

function isStaticSectorFallback(sectors) {
    return sectors.length > 0 && sectors.every(s =>
        Number(s.change_pct) === 0 && !s.leader_name && !Number(s.up_count) && !Number(s.down_count)
    );
}

function renderSectors(sectors) {
    if (!$sectorList) return;
    if (!sectors || !sectors.length) {
        if (sectorsCache.length) {
            sectors = sectorsCache;
        } else {
            $sectorList.innerHTML = '<div class="panel-loading" style="color:#999">热门板块行情暂不可用，稍后自动刷新</div>';
            return;
        }
    }
    if (isStaticSectorFallback(sectors)) {
        $sectorList.innerHTML = '<div class="panel-loading" style="color:#999">热门板块行情暂不可用，稍后自动刷新</div>';
        return;
    }
    sectorsCache = sectors;
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

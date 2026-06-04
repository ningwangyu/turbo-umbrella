/**
 * 仪表盘持仓明细组件 — 可排序表格，展示每只基金的市值、权重、收益等。
 *
 * 点击表头可切换升序/降序排列，使用 fmtMoney() 和 colorCls() 格式化。
 */
import { fmtMoney, colorCls, showToast } from '../utils.js';

/** 当前排序状态 */
let sortField = 'current_value';
let sortDir = 'desc';   // 'asc' | 'desc'

/**
 * 格式化百分比权重。
 * @param {number} weight - 权重百分比
 * @returns {string}
 */
function fmtWeight(weight) {
    if (weight == null) return '--';
    return Number(weight).toFixed(2) + '%';
}

/**
 * 格式化收益率。
 * @param {number} rate - 收益率百分比
 * @returns {string}
 */
function fmtRate(rate) {
    if (rate == null) return '--';
    const n = Number(rate);
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

/**
 * 格式化市值金额（大数字简写：万/亿）。
 * @param {number} value
 * @returns {string}
 */
function fmtMarketValue(value) {
    if (value == null) return '--';
    const n = Number(value);
    if (n >= 100000000) {
        return (n / 100000000).toFixed(2) + '亿';
    }
    if (n >= 10000) {
        return (n / 10000).toFixed(2) + '万';
    }
    return n.toFixed(2);
}

/**
 * 获取排序比较函数。
 * @param {string} field - 排序字段
 * @param {string} dir - 'asc' | 'desc'
 * @returns {Function}
 */
function getSortComparator(field, dir) {
    return (a, b) => {
        let va = a[field] ?? 0;
        let vb = b[field] ?? 0;
        // 名称字段按字符串排序
        if (field === 'name') {
            va = String(va);
            vb = String(vb);
            const cmp = va.localeCompare(vb, 'zh-CN');
            return dir === 'asc' ? cmp : -cmp;
        }
        // 数值字段
        const cmp = Number(va) - Number(vb);
        return dir === 'asc' ? cmp : -cmp;
    };
}

/** 排序列定义 */
const COLUMNS = [
    { field: 'name',            label: '基金名称', align: 'left',  sortable: true },
    { field: 'current_value',   label: '当前市值', align: 'right', sortable: true },
    { field: 'weight',          label: '权重',     align: 'right', sortable: true },
    { field: 'today',           label: '今日收益', align: 'right', sortable: true },
    { field: 'profit',          label: '累计收益', align: 'right', sortable: true },
    { field: 'profit_pct',      label: '收益率',   align: 'right', sortable: true },
];

/**
 * 渲染持仓明细表格。
 * @param {HTMLElement} container - 容器
 * @param {Array|Object} data - holdings-detail 接口返回的数据（可能是数组或包含 fund_details 的对象）
 */
export function renderHoldingsDetail(container, data) {
    if (!container) return;

    // 支持多种数据结构：数组、fund_details字段、items字段、holdings字段
    const items = Array.isArray(data) ? data : (data?.fund_details || data?.items || data?.holdings || []);

    if (!items.length) {
        container.innerHTML = `
            <div class="dash-section-title">持仓明细</div>
            <div class="dash-empty">暂无持仓数据</div>`;
        return;
    }

    // 重置排序状态
    sortField = 'current_value';
    sortDir = 'desc';

    container.innerHTML = `
        <div class="dash-section-title">
            持仓明细
            <span class="dash-section-sub">${items.length}只基金</span>
        </div>
        <div class="dash-holdings-table-wrap" id="dashHoldingsTableWrap"></div>`;

    renderTable(container.querySelector('#dashHoldingsTableWrap'), items);
}

/**
 * 渲染表格内容（用于排序后重绘）。
 * @param {HTMLElement} wrapEl - 表格容器
 * @param {Array} items - 数据列表
 */
function renderTable(wrapEl, items) {
    if (!wrapEl) return;

    const sorted = [...items].sort(getSortComparator(sortField, sortDir));

    let html = '<table class="dash-holdings-table"><thead><tr>';
    COLUMNS.forEach(col => {
        const isSorted = sortField === col.field;
        const cls = [
            col.sortable ? 'sortable' : '',
            isSorted ? (sortDir === 'asc' ? 'sort-asc' : 'sort-desc') : '',
        ].filter(Boolean).join(' ');
        html += `<th class="${cls}" data-field="${col.field}" style="text-align:${col.align}">${col.label}</th>`;
    });
    html += '</tr></thead><tbody>';

    sorted.forEach(item => {
        const profitCls = colorCls(item.today);
        const cumProfitCls = colorCls(item.profit);
        const rateCls = colorCls(item.profit_pct);

        html += `<tr>
            <td style="text-align:left">
                <span class="dash-holding-name">${item.name || '--'}</span>
                <span class="dash-holding-code">${item.code || ''}</span>
            </td>
            <td style="text-align:right"><span class="dash-holding-money">${fmtMarketValue(item.current_value)}</span></td>
            <td style="text-align:right"><span class="dash-holding-pct">${fmtWeight(item.weight)}</span></td>
            <td style="text-align:right"><span class="${profitCls}">${fmtMoney(item.today)}</span></td>
            <td style="text-align:right"><span class="${cumProfitCls}">${fmtMoney(item.profit)}</span></td>
            <td style="text-align:right"><span class="${rateCls}">${fmtRate(item.profit_pct)}</span></td>
        </tr>`;
    });

    html += '</tbody></table>';
    wrapEl.innerHTML = html;

    // 绑定排序事件
    wrapEl.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.field;
            if (sortField === field) {
                // 同列切换方向
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                // 新列默认降序
                sortField = field;
                sortDir = 'desc';
            }
            renderTable(wrapEl, items);
        });
    });
}

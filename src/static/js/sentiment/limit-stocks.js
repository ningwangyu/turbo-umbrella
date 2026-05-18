import { holdings } from '../state.js';
import { colorCls, fmtMoney, showToast } from '../utils.js';
import { fetchLimitStocks, fetchStockFunds } from './api.js';
import { sentimentState } from './state.js';

export function bindLimitTabs() {
    document.querySelectorAll('.limit-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.limit-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            const dir = this.dataset.dir;
            sentimentState.currentLimitTab = dir;
            loadLimitStocks(dir);
        });
    });
}

export async function loadLimitStocks(direction) {
    const listEl = document.getElementById('limitStocksList');
    if (!listEl) return;

    // 缓存命中
    if (sentimentState.limitDataCache[direction]) {
        renderLimitStocksList(listEl, sentimentState.limitDataCache[direction], direction);
        return;
    }

    listEl.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载中...</div>';

    try {
        const data = await fetchLimitStocks(direction);
        sentimentState.limitDataCache[direction] = data;
        renderLimitStocksList(listEl, data, direction);
    } catch (e) {
        listEl.innerHTML = '<div class="panel-loading" style="color:var(--up)">加载失败</div>';
    }
}

function renderLimitStocksList(container, stocks, direction) {
    if (!stocks || !stocks.length) {
        container.innerHTML = '<div class="limit-empty">暂无数据库涨跌停数据，等待后台刷新</div>';
        return;
    }

    let html = '';
    stocks.forEach(s => {
        const cls = direction === 'up' ? 'limit-stock-up' : 'limit-stock-down';
        html += `<div class="limit-stock-row ${cls}" data-code="${s.code}" data-name="${s.name}">
            <span class="limit-stock-name">${s.name}</span>
            <span class="limit-stock-code">${s.code}</span>
            <span class="limit-stock-price">${s.price}</span>
            <span class="limit-stock-change ${colorCls(s.change_pct)}">${fmtMoney(s.change_pct)}%</span>
            <span class="limit-stock-arrow">›</span>
        </div>`;
    });
    container.innerHTML = html;

    // 绑定点击事件：查看重仓基金
    container.querySelectorAll('.limit-stock-row').forEach(row => {
        row.addEventListener('click', () => {
            showStockFundsModal(row.dataset.code, row.dataset.name);
        });
    });
}


// ==================== 股票→基金弹窗 ====================

async function showStockFundsModal(stockCode, stockName) {
    // 创建或复用modal
    let modal = document.getElementById('stockFundsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stockFundsModal';
        modal.className = 'modal-mask';
        modal.innerHTML = `<div class="modal" style="max-width:520px;">
            <div class="modal-top"><h3 id="stockFundsTitle">重仓基金</h3><button class="modal-close" id="stockFundsClose">&times;</button></div>
            <div id="stockFundsBody"></div>
        </div>`;
        document.body.appendChild(modal);
        // 绑定关闭事件
        document.getElementById('stockFundsClose').addEventListener('click', () => {
            modal.classList.remove('show');
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    }

    document.getElementById('stockFundsTitle').textContent = `持有 ${stockName}(${stockCode}) 的基金`;
    document.getElementById('stockFundsBody').innerHTML = '<div class="panel-loading"><span class="spinner"></span>查询持有基金...</div>';
    modal.classList.add('show');

    try {
        const funds = await fetchStockFunds(stockCode);

        if (funds.error) {
            document.getElementById('stockFundsBody').innerHTML = `<div class="limit-empty">${funds.error}</div>`;
            return;
        }

        if (!funds || !funds.length) {
            document.getElementById('stockFundsBody').innerHTML = '<div class="limit-empty">暂未找到持有该股的基金</div>';
            return;
        }

        let html = '<div class="stock-funds-list">';
        funds.forEach(f => {
            const typeTag = f.fund_type ? `<span class="sf-type">${f.fund_type}</span>` : '';
            html += `<div class="sf-row" data-fund-code="${f.fund_code}" data-fund-name="${f.fund_name}">
                <div class="sf-info">
                    <div class="sf-name">${f.fund_name}</div>
                    <div class="sf-meta">
                        <span class="sf-code">${f.fund_code}</span>
                        ${typeTag}
                    </div>
                </div>
                <div class="sf-pct">${f.holding_pct ? f.holding_pct.toFixed(2) + '%' : '--'}</div>
                <button class="sf-add-btn" title="加入持仓">+</button>
            </div>`;
        });
        html += '</div>';
        document.getElementById('stockFundsBody').innerHTML = html;

        // 绑定"加入持仓"按钮
        document.querySelectorAll('.sf-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = btn.closest('.sf-row');
                const code = row.dataset.fundCode;
                const name = row.dataset.fundName;
                // 触发主页面的加入持仓弹窗
                if (window._addHoldingFromSentiment) {
                    window._addHoldingFromSentiment(code, name);
                } else {
                    showToast(`基金 ${name}(${code})，请在首页添加`);
                }
            });
        });

    } catch (e) {
        document.getElementById('stockFundsBody').innerHTML = '<div class="limit-empty" style="color:var(--up)">查询失败</div>';
    }
}


// ==================== ETF图表 ====================

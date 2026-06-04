export const HELP_TEXTS = {
    total_value: '当前组合所有基金市值合计。系统按每只基金的持仓金额汇总，用于估算整体资金规模。',
    daily_profit: '根据基金实时估值涨跌幅估算的今日盈亏，仅供盘中参考，最终以基金公司公布净值为准。',
    beta: '组合相对市场的敏感度。β>1 表示波动大于市场，β<1 表示更稳健。',
    sharpe: '衡量承担每单位波动风险获得的超额收益，数值越高代表风险调整后收益越好。',
    max_drawdown: '历史高点到低点的最大回撤幅度，反映极端情况下可能承受的亏损。',
    drawdown: '组合在近1年从阶段高点回落到低点的最大跌幅，用于衡量持有期间可能经历的极端亏损。',
    volatility: '收益波动程度，数值越高说明净值起伏越大。',
    diversification: '根据行业集中度、基金数量和相关性综合评估组合分散程度。',
    hhi: 'HHI指数用于衡量板块集中度，数值越高代表资金越集中在少数板块，分散程度越低。',
    overlap: '不同基金前十大持仓中重复出现的股票数量，重复越多说明隐性集中度越高。',
};

export function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export function formatFullDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

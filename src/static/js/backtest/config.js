/** 回测配置模块 — 集中维护策略、频率和时间范围选项，避免表单与结果页重复定义。 */
export const STRATEGIES = {
    fixed: { key: "fixed", label: "普通定投", icon: "📌", color: "#1a73e8",
        desc: "最简单的定投方式，每期投入固定金额。不择时、不择额，利用「微笑曲线」摊平成本，适合新手入门。" },
    smart: { key: "smart", label: "慧定投", icon: "📈", color: "#e74c3c",
        desc: "基于均线策略，净值低于均线时加大投入（最多2倍），高于均线时减少投入（最少30%）。低位多买、高位少买，增强收益弹性。" },
    value: { key: "value", label: "价值平均法", icon: "⚖️", color: "#27ae60",
        desc: "设定账户每期目标增长额，实际投入 = 目标市值 - 当前市值。涨多了少投甚至不投，跌多了多投。纪律性最强，追求资产匀速增长。" },
};

export const TIME_RANGES = [
    { key: "1m", label: "1个月" },
    { key: "3m", label: "3个月" },
    { key: "6m", label: "6个月" },
    { key: "1y", label: "1年" },
    { key: "2y", label: "2年" },
    { key: "3y", label: "3年" },
    { key: "all", label: "全部" },
];


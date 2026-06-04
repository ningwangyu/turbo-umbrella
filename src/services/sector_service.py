"""
板块分类服务 — 基金属性优先、重仓股补充的行业板块映射

映射策略：
1. 优先根据基金名称/类型判断板块（债→债券、QDII→海外、科技→科技等）
2. 基金属性不明确时，通过重仓股关键词补充判断
3. 计算组合层面的板块分布、集中度和多样化评分
"""

import math
from collections import defaultdict

# 板块关键词映射：板块名 → 关键词列表（匹配股票名称）
_SECTOR_KEYWORDS = {
    "消费": [
        "食品", "白酒", "乳业", "调味", "啤酒", "饮料", "牧原", "猪肉",
        "家电", "美的", "格力", "海尔", "海天", "伊利", "茅台", "五粮液",
        "泸州", "洋河", "汾酒", "古井", "双汇", "安井", "绝味",
        "免税", "旅游", "酒店", "中免", "李宁", "安踏",
    ],
    "科技/互联网": [
        "电子", "芯片", "半导体", "软件", "互联网", "通信", "5G", "6G",
        "腾讯", "阿里", "百度", "美团", "京东", "拼多多",
        "立讯", "海康", "中芯", "韦尔", "兆易", "澜起", "紫光",
        "传音", "歌尔", "蓝思", "大华", "科大讯飞",
        "半导体", "封测", "晶圆", "存储", "面板", "显示",
    ],
    "医药": [
        "医药", "生物", "药", "医疗", "疫苗", "CXO", "创新药",
        "恒瑞", "迈瑞", "药明", "片仔癀", "云南白药", "爱尔",
        "通策", "华兰", "智飞", "康龙", "泰格", "凯莱英",
        "中药", "中医", "诊断", "器械", "基因",
    ],
    "金融": [
        "银行", "保险", "证券", "信托", "金融",
        "招行", "平安", "兴业", "中信", "光大", "民生", "工商",
        "建设", "农业", "交通", "浦发", "华夏", "宁波",
        "人寿", "太保", "新华", "国寿",
        "券商", "投行", "期货",
    ],
    "新能源": [
        "光伏", "锂电", "宁德", "风电", "储能", "新能源", "碳中和",
        "隆基", "通威", "阳光电源", "天合", "晶澳", "晶科",
        "亿纬", "国轩", "天齐", "赣锋", "华友",
        "氢能", "充电", "特斯拉", "比亚迪",
    ],
    "能源": [
        "石油", "石化", "煤炭", "天然气", "煤", "油",
        "中石化", "中石油", "中海油", "神华", "陕煤", "兖矿",
        "油田", "炼化", "管道",
    ],
    "制造/工业": [
        "汽车", "机械", "航空", "军工", "航天", "船舶",
        "中航", "航发", "沈飞", "成飞", "洪都",
        "三一", "中联", "徐工", "潍柴",
        "长城", "吉利", "广汽", "上汽", "长安",
        "高铁", "轨交", "中车", "工业母机", "数控",
    ],
    "地产/基建": [
        "地产", "建筑", "水泥", "建材", "装饰",
        "万科", "保利", "招商蛇口", "华润", "中海",
        "海螺", "中国建筑", "中国中铁", "中国交建",
        "物业", "城建", "基建", "交建",
    ],
    "材料/有色": [
        "铜", "铝", "黄金", "稀土", "锂", "钴", "镍", "锌", "锡",
        "紫金", "洛阳钼业", "北方稀土", "中国铝业",
        "钢铁", "宝钢", "鞍钢", "化工", "万华", "荣盛",
        "化纤", "橡胶", "塑料", "涂料",
    ],
    "传媒/文化": [
        "传媒", "游戏", "广告", "影视", "文化", "出版",
        "分众", "芒果", "光线", "华谊", "完美世界", "三七",
        "短视频", "直播", "抖音", "快手", "B站", "哔哩",
    ],
    "交通运输": [
        "物流", "快递", "航运", "港口", "机场", "铁路",
        "顺丰", "中通", "圆通", "韵达",
        "上港", "宁波港", "招商轮船", "中外运",
        "南方航空", "东方航空", "国航", "春秋",
    ],
    "公用事业": [
        "电力", "水务", "燃气", "环保", "污水", "垃圾",
        "长江电力", "华能", "国电", "大唐", "华电",
        "核电", "水电", "风电运营", "光伏电站",
    ],
}


# 基金名称→板块映射（优先级高于重仓股映射）
_FUND_SECTOR_KEYWORDS = {
    "债券": ["债", "信用", "利率", "短债", "中短债", "可转债", "固收", "纯债"],
    "货币": ["货币", "现金"],
    "商品": ["黄金", "白银", "贵金属", "商品", "原油", "石油"],
    "QDII/海外": ["QDII", "美国", "纳斯达克", "标普", "全球", "海外", "恒生", "中概", "日经", "德国", "欧洲"],
    "科技/互联网": ["科技", "半导体", "芯片", "电子", "信息", "互联网", "人工智能", "AI", "数字", "通信", "TMT"],
    "消费": ["消费", "食品", "白酒", "农业", "养殖", "家电"],
    "医药": ["医药", "医疗", "健康", "生物", "制药", "创新药"],
    "金融": ["金融", "银行", "证券", "保险", "非银"],
    "新能源": ["新能源", "碳中和", "光伏", "锂电", "储能", "风电", "电力设备"],
    "制造/工业": ["制造", "工业", "军工", "航空", "机械", "汽车"],
    "地产/基建": ["地产", "基建", "建筑", "建材", "房地产"],
    "材料/有色": ["材料", "有色", "化工", "钢铁", "资源"],
    "传媒/文化": ["传媒", "文化", "游戏", "娱乐", "体育"],
    "交通运输": ["交通", "运输", "物流", "航运", "航空"],
    "公用事业": ["公用", "电力", "水务", "燃气", "环保"],
    "指数": ["指数", "ETF", "LOF", "沪深300", "中证500", "上证50", "创业板", "科创", "中证1000"],
}


def classify_fund_sector(name: str, fund_type: str = "") -> str:
    """
    根据基金名称和类型判断板块归属（优先级最高）。

    Args:
        name: 基金名称（如"华夏科技混合"）
        fund_type: 基金类型（如"混合型"、"股票型"）

    Returns:
        板块名称字符串，无法判断时返回""
    """
    if not name:
        return ""
    for sector, keywords in _FUND_SECTOR_KEYWORDS.items():
        for kw in keywords:
            if kw in name:
                return sector
    return ""


def classify_stock_sector(name: str, code: str = "") -> str:
    """
    根据股票名称（和代码）判断所属板块。

    优先匹配名称中的关键词，按关键词长度降序匹配以避免短词误匹配。
    未匹配到任何板块时返回"其他"。

    Args:
        name: 股票名称（如"贵州茅台"、"宁德时代"）
        code: 股票代码（如"600519"），用于辅助判断

    Returns:
        板块名称字符串
    """
    if not name:
        return "其他"

    for sector, keywords in _SECTOR_KEYWORDS.items():
        for kw in keywords:
            if kw in name:
                return sector

    return "其他"


def calculate_sector_distribution(
    fund_holdings_map: dict, fund_values: dict, total_value: float
) -> list:
    """
    计算组合的板块分布。基金属性优先，属性不明确时通过重仓股补充。

    Returns:
        list: [{name, weight, stock_count, funds: [{code, name, weight}], stocks: [...]}]
    """
    sector_map = defaultdict(lambda: {"weight": 0, "stocks": [], "funds": []})

    for fund_code, holdings_data in fund_holdings_map.items():
        fund_info = fund_values.get(fund_code, {})
        fund_value = fund_info.get("value", 0)
        fund_name = fund_info.get("name", fund_code)
        fund_weight_pct = fund_value / total_value * 100 if total_value > 0 else 0

        # 第一步：尝试通过基金名称判断板块
        fund_sector = classify_fund_sector(fund_name)

        if fund_sector:
            # 基金属性明确 → 整只基金归入该板块
            entry = sector_map[fund_sector]
            entry["weight"] += fund_weight_pct
            # 附带该基金重仓股信息
            top_holdings = []
            if holdings_data and "holdings" in holdings_data:
                for s in holdings_data["holdings"][:5]:
                    top_holdings.append({
                        "name": s.get("name", ""),
                        "code": s.get("code", ""),
                        "pct": round(s.get("pct", 0), 2),
                    })
            entry["funds"].append({
                "code": fund_code,
                "name": fund_name,
                "weight": round(fund_weight_pct, 2),
                "top_holdings": top_holdings,
            })
        else:
            # 基金属性不明确 → 通过重仓股分散到各板块
            if not holdings_data or "holdings" not in holdings_data:
                # 无重仓股数据，归入"其他"
                entry = sector_map["其他"]
                entry["weight"] += fund_weight_pct
                entry["funds"].append({
                    "code": fund_code,
                    "name": fund_name,
                    "weight": round(fund_weight_pct, 2),
                    "top_holdings": [],
                })
                continue

            # 计算该基金的重仓股
            top_holdings = []
            fund_weight = fund_value / total_value if total_value > 0 else 0
            fund_sectors_seen = set()
            for stock in holdings_data["holdings"]:
                stock_code = stock.get("code", "")
                stock_name = stock.get("name", "")
                stock_pct = stock.get("pct", 0)
                sector = classify_stock_sector(stock_name, stock_code)
                portfolio_pct = fund_weight * stock_pct

                entry = sector_map[sector]
                entry["weight"] += portfolio_pct
                entry["stocks"].append({
                    "name": stock_name,
                    "code": stock_code,
                    "fund_name": fund_name,
                    "fund_pct": round(stock_pct, 2),
                    "portfolio_pct": round(portfolio_pct, 2),
                })
                if sector not in fund_sectors_seen:
                    fund_sectors_seen.add(sector)
                    top_holdings.append({"name": stock_name, "code": stock_code, "pct": round(stock_pct, 2)})
            # 按权重最大的板块记录该基金的归属
            if fund_sectors_seen:
                primary_sector = max(fund_sectors_seen,
                    key=lambda s: sum(st["portfolio_pct"] for st in sector_map[s]["stocks"]
                                      if st["fund_name"] == fund_name))
                sector_map[primary_sector]["funds"].append({
                    "code": fund_code,
                    "name": fund_name,
                    "weight": round(fund_weight_pct, 2),
                    "top_holdings": top_holdings[:5],
                })

    result = []
    for sector_name, data in sector_map.items():
        data["stocks"].sort(key=lambda s: s["portfolio_pct"], reverse=True)
        data["funds"].sort(key=lambda f: f["weight"], reverse=True)
        result.append({
            "name": sector_name,
            "weight": round(data["weight"], 2),
            "stock_count": len(data["stocks"]),
            "fund_count": len(data["funds"]),
            "funds": data["funds"],
            "stocks": data["stocks"],
        })

    result.sort(key=lambda x: x["weight"], reverse=True)
    return result


def assess_sector_concentration(sector_data: list) -> dict:
    """
    评估板块集中度风险。

    如果单一板块占比超过30%则发出预警。

    Args:
        sector_data: calculate_sector_distribution 的返回值

    Returns:
        {max_sector, max_pct, warning, message}
    """
    if not sector_data:
        return {"max_sector": "", "max_pct": 0, "warning": False, "message": "暂无板块数据"}

    top = sector_data[0]
    max_pct = top["weight"]
    max_sector = top["name"]

    warning = max_pct >= 30
    if max_pct >= 50:
        message = f"{max_sector}板块占比{max_pct:.1f}%，严重集中，建议大幅分散"
    elif max_pct >= 30:
        message = f"{max_sector}板块占比{max_pct:.1f}%，集中度偏高，建议适当分散"
    elif max_pct >= 20:
        message = f"{max_sector}板块占比{max_pct:.1f}%，适度集中，可接受"
    else:
        message = f"最大板块{max_sector}仅占{max_pct:.1f}%，分散度良好"

    return {
        "max_sector": max_sector,
        "max_pct": round(max_pct, 2),
        "warning": warning,
        "message": message,
    }


def calculate_diversification_score(sector_data: list) -> dict:
    """
    基于HHI (Herfindahl-Hirschman Index) 计算多样化评分。

    HHI = Σ(wi²)，wi为每个板块的权重（小数形式）
    - HHI=1.0 → 完全集中（1个板块=100%）→ score=0
    - HHI=0.0 → 完全分散（无数板块均分）→ score=100
    - score = (1 - HHI) × 100（线性映射）

    Args:
        sector_data: calculate_sector_distribution 的返回值

    Returns:
        {score: int 0-100, level: str, detail: str, hhi: float}
    """
    if not sector_data:
        return {"score": 0, "level": "无数据", "detail": "暂无持仓板块数据", "hhi": 0}

    # HHI 计算
    hhi = 0
    for s in sector_data:
        w = s["weight"] / 100  # 转为小数
        hhi += w * w

    score = max(0, min(100, round((1 - hhi) * 100)))

    sector_count = len(sector_data)
    if score >= 80:
        level = "优秀"
    elif score >= 60:
        level = "良好"
    elif score >= 40:
        level = "一般"
    elif score >= 20:
        level = "较差"
    else:
        level = "集中"

    detail = f"持仓分布在{sector_count}个板块，HHI指数{hhi:.3f}，分散度{level}"
    return {"score": score, "level": level, "detail": detail, "hhi": round(hhi, 4)}

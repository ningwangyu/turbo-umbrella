"""
板块分类服务单元测试
"""

import pytest
from services.sector_service import (
    classify_fund_sector,
    classify_stock_sector,
    calculate_sector_distribution,
    assess_sector_concentration,
    calculate_diversification_score,
)


# ==================== classify_fund_sector ====================

class TestClassifyFundSector:
    """测试基金名称→板块分类"""

    @pytest.mark.parametrize("name,expected", [
        ("华夏科技混合A", "科技/互联网"),
        ("易方达消费行业股票", "消费"),
        ("中欧医疗健康混合A", "医药"),
        ("工银金融地产混合", "金融"),
        ("天弘中证新能源指数", "新能源"),
        ("富国中证军工指数", "制造/工业"),
        ("招商中证白酒指数", "消费"),
        ("华夏债券A", "债券"),
        ("南方原油QDII", "商品"),
        ("华夏纳斯达克100ETF联接", "QDII/海外"),
        ("景顺长城新能源产业股票", "新能源"),
        ("汇添富中证500指数A", "指数"),
        ("华安黄金ETF联接A", "商品"),
        ("鹏华中债1-3年农发行债券指数", "债券"),
    ])
    def test_known_funds(self, name, expected):
        assert classify_fund_sector(name) == expected

    def test_unknown_fund_returns_empty(self):
        assert classify_fund_sector("某某混合优选A") == ""

    def test_empty_name_returns_empty(self):
        assert classify_fund_sector("") == ""


# ==================== classify_stock_sector ====================

class TestClassifyStockSector:
    """测试股票→板块分类映射"""

    @pytest.mark.parametrize("name,code,expected", [
        # 消费
        ("贵州茅台", "600519", "消费"),
        ("五粮液", "000858", "消费"),
        ("美的集团", "000333", "消费"),
        ("格力电器", "000651", "消费"),
        ("海天味业", "603288", "消费"),
        ("伊利股份", "600887", "消费"),
        # 科技/互联网
        ("立讯精密", "002475", "科技/互联网"),
        ("海康威视", "002415", "科技/互联网"),
        ("韦尔股份", "603501", "科技/互联网"),
        ("中芯国际", "688981", "科技/互联网"),
        ("科大讯飞", "002230", "科技/互联网"),
        ("兆易创新", "603986", "科技/互联网"),
        # 医药
        ("恒瑞医药", "600276", "医药"),
        ("迈瑞医疗", "300760", "医药"),
        ("药明康德", "603259", "医药"),
        ("片仔癀", "600436", "医药"),
        ("智飞生物", "300122", "医药"),
        # 金融
        ("招商银行", "600036", "金融"),
        ("中国平安", "601318", "金融"),
        ("兴业银行", "601166", "金融"),
        ("中信证券", "600030", "金融"),
        # 新能源
        ("宁德时代", "300750", "新能源"),
        ("隆基绿能", "601012", "新能源"),
        ("比亚迪", "002594", "新能源"),
        ("阳光电源", "300274", "新能源"),
        ("通威股份", "600438", "新能源"),
        # 能源
        ("中国石化", "600028", "能源"),
        ("中国石油", "601857", "能源"),
        ("中国神华", "601088", "能源"),
        # 制造/工业
        ("三一重工", "600031", "制造/工业"),
        ("中航沈飞", "600760", "制造/工业"),
        ("潍柴动力", "000338", "制造/工业"),
        # 地产/基建
        ("万科A", "000002", "地产/基建"),
        ("保利发展", "600048", "地产/基建"),
        ("海螺水泥", "600585", "地产/基建"),
        # 材料/有色
        ("紫金矿业", "601899", "材料/有色"),
        ("洛阳钼业", "603993", "材料/有色"),
        ("万华化学", "600309", "材料/有色"),
        # 传媒
        ("分众传媒", "002027", "传媒/文化"),
        ("芒果超媒", "300413", "传媒/文化"),
        # 交通运输
        ("顺丰控股", "002352", "交通运输"),
        # 公用事业
        ("长江电力", "600900", "公用事业"),
    ])
    def test_known_stocks(self, name, code, expected):
        assert classify_stock_sector(name, code) == expected

    def test_unknown_stock_returns_other(self):
        assert classify_stock_sector("未知公司", "999999") == "其他"

    def test_empty_name_returns_other(self):
        assert classify_stock_sector("", "123456") == "其他"

    def test_none_name_returns_other(self):
        assert classify_stock_sector(None, "123456") == "其他"


# ==================== calculate_sector_distribution ====================

class TestCalculateSectorDistribution:
    """测试板块分布计算"""

    def test_basic_distribution(self):
        fund_holdings = {
            "000001": {
                "holdings": [
                    {"code": "600519", "name": "贵州茅台", "pct": 9.5},
                    {"code": "601318", "name": "中国平安", "pct": 7.2},
                ]
            },
            "000002": {
                "holdings": [
                    {"code": "300750", "name": "宁德时代", "pct": 8.0},
                    {"code": "002475", "name": "立讯精密", "pct": 6.5},
                ]
            },
        }
        fund_values = {
            "000001": {"value": 10000, "name": "某某混合优选A"},  # 无明确板块属性
            "000002": {"value": 10000, "name": "某某成长混合"},   # 无明确板块属性
        }
        total = 20000

        result = calculate_sector_distribution(fund_holdings, fund_values, total)

        assert len(result) > 0
        names = [s["name"] for s in result]
        assert "消费" in names
        assert "科技/互联网" in names
        total_weight = sum(s["weight"] for s in result)
        assert abs(total_weight - 15.6) < 0.5

    def test_fund_sector_priority(self):
        """基金名称有明确板块属性时，整只基金归入该板块"""
        fund_holdings = {
            "000001": {
                "holdings": [
                    {"code": "600519", "name": "贵州茅台", "pct": 9.5},
                    {"code": "300750", "name": "宁德时代", "pct": 8.0},
                ]
            },
        }
        fund_values = {
            "000001": {"value": 10000, "name": "华夏消费行业股票"},  # 明确属于"消费"
        }
        total = 10000

        result = calculate_sector_distribution(fund_holdings, fund_values, total)

        # 整只基金应归入"消费"，而非分散到消费+新能源
        assert len(result) == 1
        assert result[0]["name"] == "消费"
        assert abs(result[0]["weight"] - 100.0) < 0.1
        # 应有基金信息而非股票信息
        assert result[0]["fund_count"] == 1
        assert len(result[0]["funds"]) == 1

    def test_mixed_fund_and_stock_classification(self):
        """混合场景：一只基金有明确属性，另一只没有"""
        fund_holdings = {
            "000001": {"holdings": [{"code": "600519", "name": "贵州茅台", "pct": 10}]},
            "000002": {"holdings": [{"code": "300750", "name": "宁德时代", "pct": 8}]},
        }
        fund_values = {
            "000001": {"value": 10000, "name": "易方达消费行业股票"},  # 明确属于"消费"
            "000002": {"value": 10000, "name": "某某成长混合"},       # 无明确属性
        }
        total = 20000

        result = calculate_sector_distribution(fund_holdings, fund_values, total)
        names = [s["name"] for s in result]

        # 消费应由基金属性决定（整只50%权重）
        consumer = next(s for s in result if s["name"] == "消费")
        assert abs(consumer["weight"] - 50.0) < 0.1

        # 新能源应由重仓股决定（10000/20000 * 8 = 4%）
        assert "新能源" in names

    def test_empty_holdings(self):
        result = calculate_sector_distribution({}, {}, 10000)
        assert result == []

    def test_stocks_sorted_within_sector(self):
        fund_holdings = {
            "001": {
                "holdings": [
                    {"code": "600519", "name": "贵州茅台", "pct": 10.0},
                    {"code": "000858", "name": "五粮液", "pct": 5.0},
                ]
            }
        }
        fund_values = {"001": {"value": 10000, "name": "某某混合优选A"}}
        result = calculate_sector_distribution(fund_holdings, fund_values, 10000)

        consumer = next(s for s in result if s["name"] == "消费")
        assert consumer["stocks"][0]["name"] == "贵州茅台"


# ==================== assess_sector_concentration ====================

class TestAssessSectorConcentration:
    """测试板块集中度评估"""

    def test_high_concentration_warning(self):
        data = [{"name": "消费", "weight": 55.0}, {"name": "科技/互联网", "weight": 20.0}]
        result = assess_sector_concentration(data)
        assert result["warning"] is True
        assert "严重集中" in result["message"]

    def test_moderate_concentration_warning(self):
        data = [{"name": "金融", "weight": 35.0}, {"name": "消费", "weight": 15.0}]
        result = assess_sector_concentration(data)
        assert result["warning"] is True
        assert "偏高" in result["message"]

    def test_no_warning_good_diversification(self):
        data = [{"name": "消费", "weight": 18.0}, {"name": "科技/互联网", "weight": 16.0}]
        result = assess_sector_concentration(data)
        assert result["warning"] is False
        assert "良好" in result["message"] or "可接受" in result["message"]

    def test_empty_data(self):
        result = assess_sector_concentration([])
        assert result["warning"] is False


# ==================== calculate_diversification_score ====================

class TestDiversificationScore:
    """测试多样化评分"""

    def test_perfectly_concentrated(self):
        """单一板块100% → HHI=1.0 → score=0"""
        data = [{"name": "消费", "weight": 100.0}]
        result = calculate_diversification_score(data)
        assert result["score"] == 0
        assert result["hhi"] == 1.0
        assert result["level"] == "集中"

    def test_two_equal_sectors(self):
        """两个板块各50% → HHI=0.5 → score=50"""
        data = [
            {"name": "消费", "weight": 50.0},
            {"name": "科技/互联网", "weight": 50.0},
        ]
        result = calculate_diversification_score(data)
        assert result["score"] == 50
        assert abs(result["hhi"] - 0.5) < 0.01

    def test_many_equal_sectors_high_score(self):
        """10个板块各10% → HHI=0.1 → score=90"""
        data = [{"name": f"板块{i}", "weight": 10.0} for i in range(10)]
        result = calculate_diversification_score(data)
        assert result["score"] == 90
        assert abs(result["hhi"] - 0.1) < 0.01

    def test_empty_data(self):
        result = calculate_diversification_score([])
        assert result["score"] == 0

    def test_score_range_0_100(self):
        """极端数据验证分数不越界"""
        data = [{"name": "A", "weight": 99.9}, {"name": "B", "weight": 0.1}]
        result = calculate_diversification_score(data)
        assert 0 <= result["score"] <= 100

"""
组合分析API集成测试
"""

import json
from unittest.mock import patch, MagicMock

import pytest
from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def _mock_estimation(code):
    return {
        "code": code,
        "name": f"测试基金{code}",
        "estimated_change_pct": "1.5",
    }


def _mock_holdings(code):
    return {
        "holdings": [
            {"code": "600519", "name": "贵州茅台", "pct": 9.5},
            {"code": "000858", "name": "五粮液", "pct": 5.2},
            {"code": "300750", "name": "宁德时代", "pct": 7.0},
        ]
    }


def _mock_performance(code):
    return {
        "trend": [
            {"date": 1700000000000 + i * 86400000, "nav": 1.0 + i * 0.001, "return": 0.1}
            for i in range(200)
        ],
        "returns": {"1y": 12.5, "6m": 8.3, "3m": 3.1, "1m": 1.2},
    }


class TestPortfolioAnalysis:
    """测试 /api/portfolio/analysis 端点"""

    @patch("routes.portfolio_routes.fetch_fund_performance", side_effect=_mock_performance)
    @patch("routes.portfolio_routes.fetch_fund_holdings", side_effect=_mock_holdings)
    @patch("routes.portfolio_routes.fetch_fund_estimation", side_effect=_mock_estimation)
    def test_analysis_returns_all_fields(self, mock_est, mock_hold, mock_perf, client):
        payload = {
            "holdings": [
                {"code": "000001", "value": 10000, "profit": 1000},
                {"code": "000002", "value": 15000, "profit": 2000},
            ]
        }
        resp = client.post(
            "/api/portfolio/analysis",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = resp.get_json()

        # 原有字段
        assert "total_value" in data
        assert "type_distribution" in data
        assert "stock_overlap" in data
        assert "risk_metrics" in data

        # 新增字段
        assert "sector_distribution" in data
        assert "sector_concentration" in data
        assert "diversification" in data
        assert "fund_drawdowns" in data

    @patch("routes.portfolio_routes.fetch_fund_performance", side_effect=_mock_performance)
    @patch("routes.portfolio_routes.fetch_fund_holdings", side_effect=_mock_holdings)
    @patch("routes.portfolio_routes.fetch_fund_estimation", side_effect=_mock_estimation)
    def test_sector_distribution_structure(self, mock_est, mock_hold, mock_perf, client):
        payload = {"holdings": [{"code": "000001", "value": 10000, "profit": 1000}]}
        resp = client.post("/api/portfolio/analysis", data=json.dumps(payload), content_type="application/json")
        data = resp.get_json()

        sectors = data["sector_distribution"]
        assert isinstance(sectors, list)
        assert len(sectors) > 0

        for s in sectors:
            assert "name" in s
            assert "weight" in s
            assert "stock_count" in s
            assert "stocks" in s
            for stock in s["stocks"]:
                assert "name" in stock
                assert "code" in stock
                assert "fund_name" in stock
                assert "fund_pct" in stock
                assert "portfolio_pct" in stock

    @patch("routes.portfolio_routes.fetch_fund_performance", side_effect=_mock_performance)
    @patch("routes.portfolio_routes.fetch_fund_holdings", side_effect=_mock_holdings)
    @patch("routes.portfolio_routes.fetch_fund_estimation", side_effect=_mock_estimation)
    def test_concentration_and_diversification(self, mock_est, mock_hold, mock_perf, client):
        payload = {"holdings": [{"code": "000001", "value": 10000, "profit": 1000}]}
        resp = client.post("/api/portfolio/analysis", data=json.dumps(payload), content_type="application/json")
        data = resp.get_json()

        conc = data["sector_concentration"]
        assert "max_sector" in conc
        assert "max_pct" in conc
        assert "warning" in conc
        assert isinstance(conc["warning"], bool)

        div = data["diversification"]
        assert "score" in div
        assert isinstance(div["score"], int)
        assert 0 <= div["score"] <= 100
        assert "level" in div
        assert "hhi" in div

    def test_empty_holdings_returns_400(self, client):
        resp = client.post(
            "/api/portfolio/analysis",
            data=json.dumps({"holdings": []}),
            content_type="application/json",
        )
        assert resp.status_code == 400


class TestPortfolioStats:
    """测试 /api/portfolio/stats 端点"""

    @patch("routes.portfolio_routes.fetch_fund_estimation", side_effect=_mock_estimation)
    def test_stats_basic(self, mock_est, client):
        payload = {
            "holdings": [
                {"code": "000001", "value": 10000, "profit": 1000},
            ]
        }
        resp = client.post("/api/portfolio/stats", data=json.dumps(payload), content_type="application/json")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "total_value" in data
        assert "total_cost" in data
        assert "funds" in data
        assert len(data["funds"]) == 1

    def test_stats_empty_returns_400(self, client):
        resp = client.post(
            "/api/portfolio/stats",
            data=json.dumps({"holdings": []}),
            content_type="application/json",
        )
        assert resp.status_code == 400

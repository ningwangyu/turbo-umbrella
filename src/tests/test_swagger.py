"""
Swagger/OpenAPI集成测试

验证Swagger UI可访问、OpenAPI spec结构合法、所有API端点都包含在spec中、特殊端点spec正确
"""

import pytest


class TestSwaggerUI:
    """验证Swagger UI页面可访问"""

    def test_swagger_ui_returns_200(self, client):
        """GET /api/docs/ 应返回200"""
        resp = client.get("/api/docs/")
        assert resp.status_code == 200

    def test_swagger_ui_contains_swagger(self, client):
        """Swagger UI页面应包含swagger相关内容"""
        resp = client.get("/api/docs/")
        html = resp.data.decode("utf-8")
        assert "swagger" in html.lower() or "flasgger" in html.lower()

    def test_apispec_json_returns_200(self, client):
        """GET /apispec.json 应返回200和JSON"""
        resp = client.get("/apispec.json")
        assert resp.status_code == 200
        assert resp.content_type == "application/json"


class TestOpenAPIStructure:
    """验证OpenAPI spec的基本结构"""

    def test_spec_has_info(self, swagger_spec):
        """spec应包含info字段"""
        assert "info" in swagger_spec
        assert "title" in swagger_spec["info"]
        assert "version" in swagger_spec["info"]

    def test_spec_has_paths(self, swagger_spec):
        """spec应包含paths字段"""
        assert "paths" in swagger_spec
        assert len(swagger_spec["paths"]) > 0

    def test_spec_has_definitions(self, swagger_spec):
        """spec应包含definitions字段"""
        assert "definitions" in swagger_spec
        assert "Error" in swagger_spec["definitions"]
        assert "Holding" in swagger_spec["definitions"]
        assert "HoldingsRequest" in swagger_spec["definitions"]

    def test_spec_has_tags(self, swagger_spec):
        """spec应包含12个模块标签"""
        assert "tags" in swagger_spec
        assert len(swagger_spec["tags"]) == 12

    def test_info_title_is_chinese(self, swagger_spec):
        """info.title应包含中文"""
        assert "基金" in swagger_spec["info"]["title"]


class TestEndpointCoverage:
    """验证所有API端点都包含在OpenAPI spec中"""

    FUND_ENDPOINTS = [
        ("GET", "/api/fund/{code}"),
        ("POST", "/api/fund/batch"),
        ("GET", "/api/fund/search"),
        ("GET", "/api/fund/holdings/{code}"),
        ("GET", "/api/fund/performance/{code}"),
        ("GET", "/api/fund/signal/{code}"),
        ("GET", "/api/fund/recommend"),
        ("POST", "/api/import/text"),
        ("POST", "/api/import/image"),
    ]
    MARKET_ENDPOINTS = [
        ("GET", "/api/market/index"),
        ("GET", "/api/market/sectors"),
        ("GET", "/api/price/metals"),
        ("GET", "/api/price/metals/trend"),
    ]
    AI_ENDPOINTS = [
        ("POST", "/api/ai/chat"),
        ("POST", "/api/ai/recognize-image"),
    ]
    ALERT_ENDPOINTS = [
        ("GET", "/api/alerts"),
        ("POST", "/api/alerts"),
        ("DELETE", "/api/alerts/{alert_id}"),
        ("GET", "/api/alerts/check"),
    ]
    PORTFOLIO_ENDPOINTS = [
        ("POST", "/api/portfolio/stats"),
        ("POST", "/api/portfolio/analysis"),
    ]
    BACKTEST_ENDPOINTS = [
        ("POST", "/api/backtest"),
    ]
    SENTIMENT_ENDPOINTS = [
        ("GET", "/api/market/sentiment"),
        ("GET", "/api/market/sentiment/limits"),
        ("GET", "/api/market/sentiment/limits/state"),
        ("POST", "/api/market/sentiment/limits/refresh"),
        ("GET", "/api/market/sentiment/stock-funds"),
        ("GET", "/api/market/sentiment/volume-trend"),
        ("GET", "/api/market/sentiment/etf-consecutive"),
        ("POST", "/api/market/sentiment/etf-consecutive/refresh"),
    ]
    EXPORT_ENDPOINTS = [
        ("POST", "/api/export/json"),
        ("POST", "/api/export/csv"),
    ]
    REPORT_ENDPOINTS = [
        ("POST", "/api/report/morning"),
    ]
    HOLDING_ENDPOINTS = [
        ("GET", "/api/holdings"),
        ("POST", "/api/holdings"),
        ("PUT", "/api/holdings"),
        ("DELETE", "/api/holdings/{code}"),
    ]
    DASHBOARD_ENDPOINTS = [
        ("POST", "/api/dashboard/overview"),
        ("POST", "/api/dashboard/holdings-detail"),
        ("GET", "/api/dashboard/health"),
        ("POST", "/api/dashboard/timeline"),
        ("GET", "/api/dashboard/prefetch-status"),
        ("GET", "/api/dashboard/optimize"),
        ("POST", "/api/dashboard/warmup"),
        ("POST", "/api/dashboard/overview-fast"),
    ]
    RISK_ENDPOINTS = [
        ("POST", "/api/risk/allocation"),
        ("POST", "/api/risk/return-trend"),
        ("POST", "/api/risk/forecast"),
        ("POST", "/api/risk/signal-scorecard"),
        ("POST", "/api/risk/rebalancing"),
        ("POST", "/api/risk/benchmark"),
        ("POST", "/api/risk/stress-test"),
        ("POST", "/api/risk/rolling-metrics"),
        ("POST", "/api/risk/tail-risk"),
    ]

    ALL_ENDPOINTS = (
        FUND_ENDPOINTS + MARKET_ENDPOINTS + AI_ENDPOINTS + ALERT_ENDPOINTS
        + PORTFOLIO_ENDPOINTS + BACKTEST_ENDPOINTS + SENTIMENT_ENDPOINTS
        + EXPORT_ENDPOINTS + REPORT_ENDPOINTS + HOLDING_ENDPOINTS
        + DASHBOARD_ENDPOINTS + RISK_ENDPOINTS
    )

    @pytest.mark.parametrize(
        "method,path", ALL_ENDPOINTS,
        ids=[f"{m} {p}" for m, p in ALL_ENDPOINTS],
    )
    def test_endpoint_in_spec(self, swagger_spec, method, path):
        """每个API端点应出现在OpenAPI spec的paths中"""
        paths = swagger_spec.get("paths", {})
        assert path in paths, f"Path {path} not found in spec"
        path_methods = paths[path]
        assert method.lower() in path_methods, (
            f"Method {method} not found for path {path}"
        )

    def test_total_endpoint_count(self, swagger_spec):
        """验证spec中包含的总端点数量"""
        total = 0
        for path_obj in swagger_spec.get("paths", {}).values():
            for method in ("get", "post", "put", "delete", "patch"):
                if method in path_obj:
                    total += 1
        assert total >= 54, f"Expected at least 54 endpoints, found {total}"


class TestSpecialEndpoints:
    """验证特殊端点的spec正确性"""

    def test_sse_chat_endpoint_produces_text_event_stream(self, swagger_spec):
        """/api/ai/chat 应声明produces: text/event-stream"""
        path_obj = swagger_spec["paths"]["/api/ai/chat"]["post"]
        assert "produces" in path_obj
        assert "text/event-stream" in path_obj["produces"]

    def test_export_json_produces_json(self, swagger_spec):
        """/api/export/json 应声明produces"""
        path_obj = swagger_spec["paths"]["/api/export/json"]["post"]
        assert "produces" in path_obj

    def test_export_csv_produces_csv(self, swagger_spec):
        """/api/export/csv 应声明produces: text/csv"""
        path_obj = swagger_spec["paths"]["/api/export/csv"]["post"]
        assert "produces" in path_obj
        assert "text/csv" in path_obj["produces"]

    def test_holding_endpoints_have_put_method(self, swagger_spec):
        """/api/holdings 应包含PUT方法"""
        methods = swagger_spec["paths"]["/api/holdings"]
        assert "put" in methods

    def test_alert_delete_has_path_param(self, swagger_spec):
        """/api/alerts/{alert_id} 应有alert_id路径参数"""
        path_obj = swagger_spec["paths"]["/api/alerts/{alert_id}"]["delete"]
        param_names = [p["name"] for p in path_obj.get("parameters", [])]
        assert "alert_id" in param_names

    def test_fund_code_path_param(self, swagger_spec):
        """基金端点的code参数应存在"""
        path_obj = swagger_spec["paths"]["/api/fund/{code}"]["get"]
        code_param = [
            p for p in path_obj.get("parameters", [])
            if p.get("name") == "code"
        ]
        assert len(code_param) == 1

    def test_image_import_accepts_json_body(self, swagger_spec):
        """/api/import/image 应接受JSON body"""
        path_obj = swagger_spec["paths"]["/api/import/image"]["post"]
        body_params = [
            p for p in path_obj.get("parameters", [])
            if p.get("in") == "body"
        ]
        assert len(body_params) >= 1

    def test_risk_endpoints_use_holdings_ref(self, swagger_spec):
        """风险分析端点应引用HoldingsRequest"""
        for path in (
            "/api/risk/allocation",
            "/api/risk/return-trend",
            "/api/risk/forecast",
            "/api/risk/tail-risk",
        ):
            path_obj = swagger_spec["paths"][path]["post"]
            params = path_obj.get("parameters", [])
            has_holdings = any(
                "$ref" in str(p) or "holdings" in str(p.get("schema", {}))
                for p in params
            )
            assert has_holdings, f"{path} should reference holdings schema"

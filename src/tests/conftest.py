"""
共享测试夹具 — Swagger集成测试
"""

import sys
import os
from unittest.mock import patch, MagicMock

# 确保src/在导入路径中
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

# Mock掉threading.Thread，阻止import app时启动后台线程
with patch("threading.Thread") as _mock_thread:
    _mock_thread.return_value = MagicMock()
    from app import app as flask_app


@pytest.fixture
def app():
    flask_app.config["TESTING"] = True
    yield flask_app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def swagger_spec(client):
    """获取解析后的OpenAPI JSON spec"""
    resp = client.get("/apispec.json")
    assert resp.status_code == 200
    return resp.get_json()

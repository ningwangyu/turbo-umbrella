"""
市场情绪监控API — 恐慌/贪婪指数、北向资金、ETF排行
"""

from flask import Blueprint, jsonify

from services.sentiment_service import get_market_sentiment

sentiment_bp = Blueprint("sentiment", __name__)


@sentiment_bp.route("/api/market/sentiment")
def market_sentiment():
    """获取市场情绪指数（恐慌/贪婪指数 + 多维指标）"""
    result = get_market_sentiment()
    return jsonify(result)

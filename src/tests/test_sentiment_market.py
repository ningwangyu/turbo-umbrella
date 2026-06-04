from services.sentiment.market import _fetch_market_counts, _latest_north_flow, _northbound_summary_amount


class TestLatestNorthFlow:
    def test_returns_latest_nonzero_flow(self):
        lines = [
            "9:30,0.00,0.00,5200000.00,0.00",
            "9:31,1234.56,0.00,5198765.44,0.00",
        ]

        assert _latest_north_flow(lines) == 1234.56

    def test_skips_invalid_and_dash_rows(self):
        lines = [
            "9:30,-,-,-,-",
            "9:31,abc,0.00,5200000.00,0.00",
            "9:32,-4321.00,0.00,5204321.00,0.00",
        ]

        assert _latest_north_flow(lines) == -4321.00

    def test_does_not_use_quota_balance_as_flow(self):
        lines = [
            "15:00,0.00,0.00,5200000.00,0.00",
        ]

        assert _latest_north_flow(lines) is None

    def test_returns_none_for_zero_or_missing_flow(self):
        assert _latest_north_flow(["15:00,0.00,0.00,5200000.00,0.00"]) is None
        assert _latest_north_flow(["15:00,-,-,-,-"]) is None
        assert _latest_north_flow([]) is None
        assert _latest_north_flow(None) is None


class TestNorthboundSummaryAmount:
    def test_returns_northbound_net_and_turnover_in_yi(self):
        data = {
            "hk2sh": {"netBuyAmt": 12000, "buySellAmt": 20000},
            "hk2sz": {"netBuyAmt": -3000, "buySellAmt": 10000},
            "sh2hk": {"netBuyAmt": 999999, "buySellAmt": 999999},
        }

        assert _northbound_summary_amount(data) == (0.9, 3.0)

    def test_returns_turnover_when_net_is_zero(self):
        data = {
            "hk2sh": {"netBuyAmt": 0, "buySellAmt": 18803584.33},
            "hk2sz": {"netBuyAmt": 0, "buySellAmt": 22539141.95},
        }

        assert _northbound_summary_amount(data) == (None, 4134.27)


class TestFetchMarketCounts:
    def test_falls_back_when_primary_counts_are_empty(self, monkeypatch):
        responses = [
            {"data": {"diff": [{"f104": "-", "f105": "-", "f106": "-"}]}},
            {"data": {"diff": [{"f104": 10, "f105": 20, "f106": 3}]}},
        ]

        def fake_request(url):
            return responses.pop(0)

        monkeypatch.setattr("services.sentiment.market._request_eastmoney_json", fake_request)

        assert _fetch_market_counts("primary") == (10, 20, 3)

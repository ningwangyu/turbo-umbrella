// 定投回测 API 请求封装。
export async function requestBacktest(payload) {
    const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return response.json();
}

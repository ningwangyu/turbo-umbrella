"""
AI服务封装 — 兼容OpenAI接口的对话/图片识别服务

支持两种调用模式：
1. 流式(stream=True)：返回Response对象，前端通过SSE逐token接收（用于AI对话）
2. 非流式(stream=False)：等待完整响应后返回文本（用于图片识别）

容错策略：5xx错误自动重试3次，每次间隔2秒
"""

import re
import json
import time
import requests

from config import AI_BASE_URL, AI_API_KEY, AI_MODEL, AI_TIMEOUT


def call_ai_api(messages: list, stream: bool = False, retries: int = 3):
    """
    调用OpenAI兼容的Chat Completions API。

    Args:
        messages: 消息列表，支持多模态（文本+图片）
        stream: 是否流式返回，True时返回Response对象供前端SSE消费
        retries: 失败重试次数

    Returns:
        stream=True: requests.Response对象（调用方需自行解析SSE）
        stream=False: AI回复的完整文本字符串

    Raises:
        Exception: 重试耗尽后抛出最后一次错误
    """
    url = f"{AI_BASE_URL}/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {AI_API_KEY}",
    }
    payload = {
        "model": AI_MODEL,
        "messages": messages,
        "stream": stream,
        "max_tokens": 2048,
    }
    last_err = None
    for attempt in range(retries):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=AI_TIMEOUT, stream=stream)
            # 5xx错误可重试，4xx错误直接抛出
            if resp.status_code >= 500:
                last_err = f"API返回 {resp.status_code}"
                time.sleep(2)
                continue
            resp.raise_for_status()
            # 流式模式：返回Response对象，由调用方解析SSE协议
            if stream:
                resp.encoding = "utf-8"
                return resp
            # 非流式模式：解析JSON响应，提取AI回复文本
            data = json.loads(resp.content)
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            last_err = str(e)
            if attempt < retries - 1:
                time.sleep(2)
                continue
    raise Exception(f"AI API调用失败({retries}次重试): {last_err}")

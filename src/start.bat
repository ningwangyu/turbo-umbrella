@echo off
title 基金收益预测助手 V4
cd /d "%~dp0"
echo ===================================================
echo  基金收益预测助手 V4 - 模块化架构
echo  访问 http://localhost:5000
echo ===================================================
echo.
echo  项目结构:
echo    src/                 - 项目源代码
echo      app.py             - Flask 应用入口
echo      config.py          - 配置管理
echo      cache.py           - 缓存系统
echo      ratelimit.py       - 令牌桶限流器
echo      cli.py             - CLI 命令行工具
echo      services/          - 业务服务层 (AI/基金/市场/推荐/情绪/持仓)
echo      routes/            - API 路由层 (按业务域拆分 Blueprint)
echo      quant/             - 量化计算层 (信号引擎)
echo      templates/         - HTML 模板
echo      static/            - 静态资源 (CSS/JS)
echo    docs/                - 项目文档
echo ===================================================
echo.

:: 自动打开浏览器
start "" http://localhost:5000

:: 启动 Flask 应用
python app.py
pause

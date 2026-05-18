@echo off
title 基金收益预测助手
cd /d "%~dp0"
echo ===================================================
echo  基金收益预测助手
echo  访问 http://localhost:5000
echo ===================================================

:: 自动打开浏览器
start "" http://localhost:5000

python app.py
pause

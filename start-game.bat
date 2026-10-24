@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Glyph Rumble 字形乱斗
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  没有找到 Node.js。请先安装 LTS 版本： https://nodejs.org/
  echo  安装完成后，重新双击这个文件。
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo  第一次运行：正在安装依赖，需要一两分钟……
  call npm install
  if errorlevel 1 (
    echo  依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)
echo.
echo  ================================================
echo   字形乱斗 3D 正在启动……
echo   Chrome 会自动打开：  http://localhost:5173
echo   如果没有自动打开，请手动在 Chrome 输入上面的地址。
echo   显示帧率：           http://localhost:5173/?fps
echo   测试结束后，关闭这个黑色窗口即可停止。
echo  ================================================
echo.
set BROWSER=chrome
call npm run dev -w @glyph/arena -- --open
pause

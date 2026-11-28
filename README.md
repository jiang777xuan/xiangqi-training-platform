# xiangqi-training-platform
Open-source Chinese Chess Training Platform

## Xiangqi Master · 中国象棋研习社

专注于中国象棋的学习、训练与实战提升。当前版本提供中文首页、可交互棋盘、残局闯关演示和本地引擎分析。

## 在本机运行

安装 Node.js 24 和 npm，然后在项目根目录打开 PowerShell，依次运行：

```powershell
npm.cmd ci
npm.cmd run dev
```

在浏览器打开终端显示的 `Local` 地址，默认是 `http://localhost:5173/`。保持终端打开，按 `Ctrl+C` 可以停止开发服务器。

## 检查与构建

| 命令 | 用途 |
| --- | --- |
| `npm.cmd run lint` | 运行 ESLint，检查代码问题。 |
| `npm.cmd run typecheck` | 检查 TypeScript 类型。 |
| `npm.cmd run build` | 检查类型并生成 `dist/` 中的生产文件。 |
| `npm.cmd run preview` | 构建后在本机预览 `dist/`。 |

## 验证本地 Pikafish

将官方引擎和同一发布包中的 `pikafish.nnue` 放在 Git 仓库之外的同一个目录。在项目根目录的 PowerShell 中运行以下命令，将示例路径换成实际的可执行文件路径。

```powershell
$env:PIKAFISH_PATH = 'C:\Tools\Pikafish\Pikafish-Windows-x86-64-universal.exe'
npm.cmd run engine:smoke
```

也可以把 `.env.example` 复制为 `.env` 并填写路径。真实引擎验证命令会让 Node.js 读取该文件。PowerShell 已设置的环境变量优先。普通 `npm.cmd test` 使用模拟引擎。

`PikafishEngine.analyze()` 接收初始 FEN 和按顺序排列的历史坐标，支持按毫秒、深度或节点数搜索。默认使用 4 个线程、128 MB 哈希、1 条候选、1000 ms 搜索时间和 10000 ms 搜索超时。可用 `AbortSignal` 取消一次请求，使用完毕后调用 `close()` 释放进程。这个模块供 Node.js 使用，浏览器界面独立运行。

## 使用网页引擎分析

在项目目录打开两个 PowerShell 窗口。第一个窗口在设置 `PIKAFISH_PATH` 后运行 `npm.cmd run dev:server`，第二个窗口运行 `npm.cmd run dev`。浏览器打开 `http://localhost:5173`，在基础棋盘下展开「引擎分析」。后端只监听 `127.0.0.1:3001`，网页通过 Vite 的 `/api` 代理连接。可在本地 `.env` 用 `XIANGQI_WEB_PORT` 和 `XIANGQI_API_PORT` 调整端口。

| 接口 | 用途 |
| --- | --- |
| `GET /api/health` | 查询 HTTP 服务是否运行 |
| `GET /api/engine/status` | 查询引擎配置、可用性、版本和任务状态 |
| `POST /api/engine/analyze` | 发送带唯一 `requestId` 的起始 FEN、历史着法和搜索设置 |
| `POST /api/engine/cancel` | 用 `{ "requestId": "原分析的编号" }` 停止指定任务 |

分析和取消使用 `application/json`。每次分析使用新的请求编号。普通测试使用模拟引擎和本机临时 HTTP 端口，真实引擎由 `npm.cmd run engine:smoke` 单独验证。

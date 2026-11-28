# xiangqi-training-platform
Open-source Chinese Chess Training Platform

## Xiangqi Master · 中国象棋研习社

专注于中国象棋的学习、训练与实战提升。当前版本提供中文首页、静态棋盘和五个待开发的训练入口。

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

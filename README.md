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

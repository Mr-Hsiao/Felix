# PMS 卡顿，到底应该怎么取证？

最近帮客户处理了一起 PMS 卡顿问题——用户反馈"开房那一下要等 5 秒"，但开发复现不出来。本地压测一切正常。

## 1. 现场录像是第一步

让用户录一段完整的操作流程，包括鼠标点击的位置和时间点。

> 不要相信用户的"很慢"，要相信录像。录像比任何语言描述都精确。

## 2. Chrome Performance Trace

打开 DevTools → Performance → Record，让用户再做一遍那个操作，导出 `.trace` 文件。

关键看三个面板：

- **Main**：主线程任务，哪些 JS 在跑
- **Network**：请求耗时
- **Screenshots**：当时的画面

## 3. 这次发现的问题

录像里看到：

```text
用户点"开房" → 0.5s 内立刻响应 → 房间列表弹出 → 5s 后才显示房态
```

不是接口慢，是**前端渲染房态网格时一次性画了 800 个 div**，没做虚拟滚动。

## 4. 修复

```javascript
// 之前：800 个 div 一次画
rooms.forEach(r => $grid.appendChild(buildRoom(r)));

// 现在：只画可视区域
const vlist = new VirtualList({ itemHeight: 80, viewport: 600 });
vlist.setData(rooms);
```

整改后开房时长从 5s 降到 200ms。

## 5. 经验

1. **别在用户机器上调试**：拿 trace 文件回开发环境复现
2. **看渲染时机，不要看 API 时长**：用户感知的是渲染完成，不是接口返回
3. **虚拟滚动不是优化，是必选项**：超过 100 条数据就要考虑
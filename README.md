# Voyager Lite

从 [Voyager](https://github.com/voyager-crew/voyager) 提取的 Chrome / Edge 扩展，专注对话时间线和背景特效。

## 功能

- 自动识别 ChatGPT、Claude、Gemini、Grok。
- 时间线支持节点、刻度（悬浮琴键）、紧凑三种样式、跳转、搜索、预览及星标。
- 支持直接居中跳转、隐藏外框、固定预览。未加载的消息恢复后自动校正位置。
- 按平台配色并分别保存时间线设置，适配明暗主题。
- 背景特效：飘雪、樱花、雨。

## 安装

1. 在 [Releases](https://github.com/Carleo10032/voyager-lite/releases) 下载已发布版本的安装包并解压；仓库当前版本为 1.1.0，也可按下方说明从源码构建。
2. 打开 `chrome://extensions` 或 `edge://extensions`，开启开发者模式。
3. 点击「加载已解压的扩展程序」，选择直接包含 `manifest.json` 的文件夹。
4. 刷新已打开的对话页面。

更新时覆盖原安装文件夹，在扩展管理页重新加载，再刷新网页。若同时安装原版 Voyager，请关闭原版对应功能，避免重复显示时间线。

## 从源码构建

需要 Node.js 22 或更高版本。

```sh
npm ci
npm run build
```

加载生成的 `dist/` 文件夹。`src/` 为独立集成代码，`vendor/` 为上游提取组件及兼容模块，`public/` 为静态资源。

仓库保留基于模拟页面的 Playwright 测试，不能替代真实平台兼容性检查。平台页面结构更新可能影响适配。

## 数据与权限

设置保存在浏览器 `storage.sync`（可能随浏览器账号同步），星标保存在 `storage.local`。仅申请四个平台指定域名的访问权限，用于识别平台和运行功能；不申请 `activeTab` 临时访问权限。内容脚本仅在四个平台的指定域名运行；本扩展不提供独立服务器、分析遥测或云盘同步功能。

## 许可证与致谢

本项目按 GNU GPLv3 分发，保留上游作者 Jonathan Braat、Jesse Zhang 的版权声明。完整许可见 [LICENSE](LICENSE)，来源与修改记录见 [UPSTREAM.md](UPSTREAM.md)，第三方依赖许可见 [public/licenses](public/licenses)。安装包对应的完整源码可在同一 Release 下载，或检出对应版本标签后构建。

基于 Voyager 1.9.0，提交 `e854e349ef8de867e6dc587033e46425320a165f`。Grok 页面选择器参考 [ai-prompts-toc](https://github.com/orezeno22/ai-prompts-toc)。

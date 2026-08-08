# Multi Gmail

[![CI](https://github.com/itsixteen/multi-gmail/actions/workflows/ci.yml/badge.svg)](https://github.com/itsixteen/multi-gmail/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

在一个 Codex 任务里，安全地处理多个 Gmail 账号。

[English](README.md)

Multi Gmail 是一个本地 Codex 插件和 MCP Server。它可以跨多个明确连接的 Gmail 搜索、阅读、整理、加标签、归档、创建草稿和发送邮件；OAuth refresh token 保存在 macOS Keychain，不会把邮箱接口暴露到公网。

## 它解决什么问题

大多数 Gmail 集成默认只连接一个账号。Multi Gmail 把“账号身份”作为每次操作的一部分：

- 读取工具可以查询单个账号，也可以使用 `account="all"`。
- 写入工具必须明确指定一个邮箱地址或别名。
- 跨账号操作会报告每个账号的失败，不会把不完整结果伪装成成功。
- 有意不提供永久删除邮件的能力。

## 安全设计

| 风险 | 处理方式 |
| --- | --- |
| OAuth refresh token | 存储在 macOS Keychain |
| OAuth 客户端配置 | 本地文件，权限为 `0600` |
| MCP 传输 | 只使用本机 stdio |
| 跨账号写入 | 拒绝；写入必须指定一个账号 |
| 删除行为 | 只允许移动到垃圾箱，可恢复 |
| 永久删除 | 不提供 |

连接账号前请阅读[安全模型](docs/security-model.md)和[隐私说明](PRIVACY.md)。

## 环境要求

- macOS
- Node.js 20 或更高版本
- ChatGPT 桌面端中的 Codex，或 Codex CLI

ChatGPT 手机端目前不支持插件；你可以通过 Codex Remote 在手机上控制一台在线的 Mac 执行任务。参见 [OpenAI 官方插件可用性说明](https://learn.chatgpt.com/docs/plugins)。

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/itsixteen/multi-gmail.git
cd multi-gmail
```

### 2. 创建 Google OAuth Desktop client

按照 [Google OAuth 配置指南](docs/google-oauth-setup.md)操作：启用 Gmail API、配置三个所需 scope、在 Testing 模式下加入所有测试 Gmail，并创建 **Desktop app** 类型的 OAuth client。

### 3. 连接 Gmail

仓库已经提交无运行时依赖的 `dist/` 构建产物，不需要先安装 npm 依赖。

```bash
node plugins/multi-gmail/dist/auth.mjs configure ~/Downloads/client_secret_....json
node plugins/multi-gmail/dist/auth.mjs add personal
node plugins/multi-gmail/dist/auth.mjs add work
node plugins/multi-gmail/dist/auth.mjs list
node plugins/multi-gmail/dist/auth.mjs doctor
```

每次执行 `add` 都会打开 Google 授权页面。请为对应别名选择正确的 Gmail。

不要把 OAuth JSON、access token、refresh token 或 Keychain 输出粘贴到聊天或 GitHub Issue。

### 4. 安装插件

```bash
codex plugin marketplace add itsixteen/multi-gmail
codex plugin add multi-gmail@itsixteen
```

安装后新建一个 Codex 任务，让工具和 skill 重新加载。

## 示例

- “整理所有 Gmail 最近 7 天未读的 issue 通知，按账号分组。”
- “跨所有账号查找发票，不要修改邮件。”
- “把 `personal` 里的这些邮件归档，并加上 `Receipts` 标签。”
- “从 `work` 起草一封回复，但不要发送。”

## 本地数据位置

账号信息和 OAuth Desktop client 配置保存在：

```text
~/Library/Application Support/Codex/Multi Gmail
```

refresh token 保存在 macOS Keychain，service 名称为：

```text
com.openai.codex.multi-gmail
```

移除某个账号：

```bash
node plugins/multi-gmail/dist/auth.mjs remove personal
```

## 开发

```bash
cd plugins/multi-gmail
npm ci
npm test
npm run build
```

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。项目架构见 [docs/architecture.md](docs/architecture.md)，计划见 [ROADMAP.md](ROADMAP.md)。

## 项目状态

这是早期开源版本。本地安全边界已经明确，但每位用户仍需创建自己的 Google Cloud 项目。可复现的 Bug 和功能建议请提交到 [GitHub Issues](https://github.com/itsixteen/multi-gmail/issues)；安全问题请使用 GitHub 私密漏洞报告。

## 致谢与许可证

多账号选择模型参考了 [`navbuildz/gmail-mcp-server`](https://github.com/navbuildz/gmail-mcp-server)，本项目是独立实现。详见 [THIRD_PARTY_NOTICES.md](plugins/multi-gmail/THIRD_PARTY_NOTICES.md)。

[MIT](LICENSE) © 2026 我是十六 / itsixteen.

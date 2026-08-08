# Multi Gmail

[![CI](https://github.com/itsixteen/multi-gmail/actions/workflows/ci.yml/badge.svg)](https://github.com/itsixteen/multi-gmail/actions/workflows/ci.yml)
[![CodeQL](https://github.com/itsixteen/multi-gmail/actions/workflows/codeql.yml/badge.svg)](https://github.com/itsixteen/multi-gmail/actions/workflows/codeql.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

让 Codex 在一个任务里安全处理多个 Gmail 账号。

[English](README.md)

支持跨账号搜索、阅读、整理、加标签、归档、创建草稿和发送邮件。所有 OAuth refresh token 都保存在你自己的 macOS Keychain，不经过项目作者的服务器。

## 安装

需要 macOS、Node.js 20+ 和 Codex。你不需要安装 npm 依赖，也不需要自己构建代码。

> 使用 Option 2 时，通常只有 Google 登录与授权必须由你本人确认；其余命令和诊断尽量交给 Codex。OAuth JSON 只需告诉 Codex 本地路径，不要粘贴文件内容。

### Option 1：常规安装

**1. 下载并安装插件**

```bash
git clone https://github.com/itsixteen/multi-gmail.git
cd multi-gmail
codex plugin marketplace add itsixteen/multi-gmail
codex plugin add multi-gmail@itsixteen
```

**2. 创建 Google OAuth client**

打开 [Google OAuth 配置指南](docs/google-oauth-setup.md)，完成以下必要操作：

- 启用 Gmail API；
- 在 Testing 状态下加入你要连接的 Gmail 测试用户；
- 创建 **Desktop app** 类型的 OAuth client；
- 下载 JSON 文件。

**3. 连接 Gmail**

把第一条命令中的路径换成刚下载的 JSON。`personal` 和 `work` 只是别名，可以自行修改。

```bash
node plugins/multi-gmail/dist/auth.mjs configure ~/Downloads/client_secret_....json
node plugins/multi-gmail/dist/auth.mjs add personal
node plugins/multi-gmail/dist/auth.mjs add work
node plugins/multi-gmail/dist/auth.mjs doctor
```

每次执行 `add` 都会打开 Google 授权页面。选择对应账号并同意即可。

最后新建一个 Codex 任务，让新插件加载。

### Option 2：直接贴给 Codex（推荐）

在 Mac 上打开一个 Codex 任务，把下面整段贴进去：

```text
请帮我在这台 Mac 上安装并配置 Multi Gmail：
https://github.com/itsixteen/multi-gmail

目标：连接我指定的多个 Gmail，并用 doctor 验证所有账号可用。

请先阅读仓库里的最新 README 和 docs/google-oauth-setup.md，然后尽量自动完成：
1. 检查 macOS、Git、Node.js 20+ 和 Codex CLI 环境。
2. 把仓库克隆到合适的持久目录；如果已经存在就安全更新，不要覆盖我的改动。
3. 添加 itsixteen/multi-gmail marketplace，并安装 multi-gmail@itsixteen。
4. 引导或协助我完成 Google Cloud 的 Gmail API、Audience/Test users 和 Desktop app OAuth client 配置。
5. 询问 OAuth JSON 的本地路径和每个 Gmail 的别名，然后运行 auth configure 和 auth add。
6. 运行 auth list、auth doctor 和必要的安全检查。
7. 完成后告诉我新建一个 Codex 任务，并给我一条验证多账号连接的测试指令。

你可以直接执行你有权限执行的终端命令，不要让我手动复制这些命令。只有在 Google 要求我本人登录、确认、授权，或者你需要 OAuth JSON 的本地路径和账号别名时再暂停问我。

安全要求：不要在聊天或日志里显示 OAuth JSON 内容、client secret、access token、refresh token 或 Keychain 输出；不要把凭证提交到 Git；只把 OAuth JSON 的本地路径传给项目自带的 auth configure 命令。
```

Codex 可以完成克隆、安装、运行命令和诊断；Google 登录及账号授权仍需要你本人确认。插件安装后要新建任务，当前任务不会自动加载刚安装的工具。

## 可以怎么用

- “整理所有 Gmail 最近 7 天未读的 issue 通知，按账号分组。”
- “跨所有账号查找发票，不要修改邮件。”
- “把 `personal` 里的这些邮件归档，并加上 `Receipts` 标签。”
- “从 `work` 起草一封回复，但不要发送。”

读取工具可以查询一个账号或 `account="all"`；所有写入都必须明确指定一个账号。项目故意不提供永久删除邮件的能力。

## 安全与隐私

- refresh token 保存在 macOS Keychain；
- MCP 只使用本机 stdio，不开放公网邮箱接口；
- 跨账号失败会明确报告，不会把不完整结果伪装成成功；
- 移动到垃圾箱属于可恢复操作，永久删除不可用；
- 每位用户创建自己的 Google OAuth client，项目作者不会收到邮箱数据或凭证。

不要把 OAuth JSON、token 或 Keychain 输出粘贴到聊天或 GitHub Issue。详见[安全模型](docs/security-model.md)、[隐私说明](PRIVACY.md)和 [OAuth 排错指南](docs/google-oauth-setup.md#troubleshooting)。

## 开发与贡献

```bash
cd plugins/multi-gmail
npm ci
npm test
npm run build
```

参见 [CONTRIBUTING.md](CONTRIBUTING.md)、[项目架构](docs/architecture.md)和 [ROADMAP.md](ROADMAP.md)。Bug 和功能建议请提交到 [GitHub Issues](https://github.com/itsixteen/multi-gmail/issues)；安全问题请使用 GitHub 私密漏洞报告。

多账号选择模型参考了 [`navbuildz/gmail-mcp-server`](https://github.com/navbuildz/gmail-mcp-server)，本项目是独立实现。详见 [THIRD_PARTY_NOTICES.md](plugins/multi-gmail/THIRD_PARTY_NOTICES.md)。

[MIT](LICENSE) © 2026 我是十六 / itsixteen.

# New API Desktop Shell

## 中文说明

这是 New API 的 Electron 桌面壳。它不会启动或打包 Go 后端，而是在本地启动一个轻量代理服务，加载已经构建好的 New API 前端资源，并把 API 请求转发到用户配置的远程 New API 后端实例。

### 功能

- 配置任意 New API 后端地址。
- 管理多个后端实例。
- 从托盘菜单为任意实例启动新版前端或经典前端。
- 支持同一实例打开多个窗口，也支持多个实例同时打开。
- 支持交互式登录和 Access token 登录。
- 已保存的 Access token 不会在设置界面明文显示；验证和保存时可继续复用。
- 退出应用时保存仍打开的前端窗口，下次启动自动恢复。
- 前端窗口标题保留实例名称后缀，便于区分窗口。
- 支持常用桌面快捷键：
  - `F5` / `Ctrl+R`：刷新
  - `F12` / `Ctrl+Shift+I`：开发者工具
- 前端窗口右键支持复制、剪切、粘贴、全选等常用操作。

### 目录结构

```text
main.js                   Electron 主进程、本地代理服务、多窗口管理
preload.js                安全 IPC bridge
desktop/                  桌面端设置页面
web/classic/              经典前端源码
web/default/dist/         外部准备的新版前端构建产物
package.json              Electron 脚本与 electron-builder 配置
dist/                     构建输出目录，已被 git 忽略
```

### 准备 New API 前端

经典前端源码已随本仓库维护，可直接构建：

```bash
npm run build:classic
```

新版前端源码继续由 `mumingluan/new-api` 的 `web/` 目录维护。构建新版前端后，将产物复制到：

```text
web/default/dist
```

打包前应同时存在：

```text
web/default/dist
web/classic/dist
```

### 安装依赖

```bash
npm install
```

### 开发运行

```bash
npm run start-app
```

开发运行时，桌面壳会从本地的 `web/default/dist` 和 `web/classic/dist` 加载前端资源。

### 构建

构建 Windows 版本：

```bash
npm run build:win
```

构建当前平台版本：

```bash
npm run build
```

构建产物输出到：

```text
dist
```

Windows 构建产物包括：

```text
dist/New-API-Desktop Setup 1.0.0.exe
dist/New-API-Desktop 1.0.0.exe
dist/win-unpacked/
```

### 配置文件

桌面端配置保存在 Electron 的 `userData` 目录中，文件名为：

```text
desktop-config.json
```

Windows 常见路径：

```text
%APPDATA%/new-api-electron/desktop-config.json
```

主要字段：

- `instances`：后端实例列表。
- `openWindows`：退出前仍打开、下次启动需要恢复的前端窗口。
- `desktopLanguage`：桌面壳语言。
- `updateFeedUrl`：可选的自动更新地址。

### Git 忽略

以下目录属于构建产物，不应提交到 git：

```text
dist*
web/default/dist
web/classic/dist
```

### 说明

- 桌面壳通过 localhost 提供同源前端页面，并代理请求到远程后端。
- Access token 模式下不会把浏览器 Cookie 转发到后端，避免被后端误判为过期会话。
- Access token 模式下会对 `/api/user/passkey` 状态查询做兼容处理，避免 Passkey 探测触发登录跳转。
- OAuth / Passkey 的实际能力仍取决于后端配置和桌面 Chromium 环境支持。

## English

This is the Electron desktop shell for New API. It does not start or bundle a Go backend. Instead, it serves prebuilt New API frontend assets locally and proxies API requests to one or more remote New API backend instances configured by the user.

### Features

- Connect to any New API backend URL.
- Manage multiple backend instances.
- Launch the default frontend or classic frontend for any instance from the tray menu.
- Open multiple windows for the same instance or for different instances.
- Support interactive login and Access token login.
- Reuse saved Access tokens without displaying them in the settings UI.
- Restore open frontend windows after restarting the desktop app.
- Keep the backend instance name in the frontend window title.
- Support common shortcuts:
  - `F5` / `Ctrl+R`: reload
  - `F12` / `Ctrl+Shift+I`: developer tools
- Provide copy, cut, paste, and select-all context menu actions.

### Layout

```text
main.js                   Electron main process, local proxy, window management
preload.js                Safe IPC bridge
desktop/                  Desktop settings UI
web/classic/              Classic frontend source
web/default/dist/         Externally prepared default frontend build
package.json              Electron scripts and electron-builder config
dist/                     Generated build output, ignored by git
```

### Prepare New API Frontends

The Classic frontend source is maintained in this repository and can be built directly:

```bash
npm run build:classic
```

The default frontend source remains in the `web/` directory of `mumingluan/new-api`. Build it there and copy its output to:

```text
web/default/dist
```

Before packaging, both build outputs must exist:

```text
web/default/dist
web/classic/dist
```

### Install Dependencies

```bash
npm install
```

### Development

```bash
npm run start-app
```

### Build

Build for Windows:

```bash
npm run build:win
```

Build for the current platform:

```bash
npm run build
```

Build outputs are written to:

```text
dist
```

Windows outputs include:

```text
dist/New-API-Desktop Setup 1.0.0.exe
dist/New-API-Desktop 1.0.0.exe
dist/win-unpacked/
```

### Configuration

Desktop settings are stored in Electron's `userData` directory:

```text
desktop-config.json
```

Typical Windows path:

```text
%APPDATA%/new-api-electron/desktop-config.json
```

Key fields:

- `instances`: backend instances.
- `openWindows`: frontend windows restored on next launch.
- `desktopLanguage`: desktop shell language.
- `updateFeedUrl`: optional update feed URL.

### Git Ignore

Generated outputs should stay out of git:

```text
dist*
web/default/dist
web/classic/dist
```

### Notes

- The shell serves the frontend through localhost and proxies API requests to the selected remote backend.
- Browser cookies are not forwarded in Access token mode.
- `/api/user/passkey` status checks are handled defensively in Access token mode to avoid session-login redirects.
- OAuth and Passkey behavior still depends on backend configuration and Chromium desktop support.

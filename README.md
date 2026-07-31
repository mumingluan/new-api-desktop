# New API Desktop（Tauri 2）

这是 New API 的跨平台客户端壳。项目不内置 Go 后端，而是加载已经构建好的
Default、Xuancat、Classic 三套前端，并通过仅监听 `127.0.0.1` 的 Rust 代理连接
用户配置的远程 New API 实例。

当前迁移目标：

- Windows、macOS、Linux 桌面端
- Android、iOS 移动端
- 保留 Electron 1.1.3 的实例管理、前端选择、登录、密钥查询、MySQL 批量操作、
  日志统计、CSV 导出、托盘、多窗口和窗口恢复能力

## 当前验证状态

- Windows x64：已构建 release EXE 和 NSIS 安装包，并通过启动与 WebView 内容验收。
- Android arm64：已构建带 debug 签名、可直接安装的 APK；包清单和签名已验证。
- macOS、Linux、iOS：代码和构建入口已准备，但需要在对应宿主系统上完成原生构建验证。

## 主要功能

- 管理多个 New API 后端实例。
- 支持交互式 Cookie 登录和 Access Token 登录。
- 每个实例、每套前端的 Cookie 与 localStorage 相互隔离并持久化。
- Default 启动前探测 `/457`，仅严格返回 `"457": true` 时选择 Xuancat 资源。
- 桌面端托盘、多实例多窗口、窗口位置/大小/最大化状态恢复。
- 桌面端保留 `F5` / `Ctrl+R` 刷新和 `F12` / `Ctrl+Shift+I` 开发者工具快捷键。
- 移动端在同一 WebView 内切换设置页、业务前端、密钥查询和密钥批量工具。
- 密钥查询：额度、有效期、调用日志、CSV 原生保存对话框。
- MySQL 批量操作：按组增减额度和有效期、过滤 Token、汇总日志并导出 CSV。

## 安全设计

- 设置页面只能调用显式定义的 Tauri 命令；远程业务 WebView 不在 Tauri capability
  的窗口白名单内。
- 代理仅监听 `127.0.0.1`，并按实例隔离 Cookie、Access Token 和 User ID。
- 已保存 Access Token 只向前端返回掩码，不返回原值。
- MySQL 密码不会返回给前端 JavaScript；保存或连接时留空可由 Rust 后端复用原值。
- MySQL 新配置默认验证 TLS 证书和主机名，也可显式选择验证 CA、仅要求加密、优先
  加密或禁用 TLS。
- MySQL 批量 SQL 使用固定语句、字段白名单和参数绑定，不接受任意 SQL。
- 数据库连接池限制为 3 个连接，并配置连接获取和空闲超时。
- 外部链接仅允许 `http`、`https`、`mailto`。
- 本地 JSON 采用临时文件替换；Unix 下设置为 `0600`。

按项目要求，本迁移**没有**使用系统凭据库或 Stronghold。Access Token、MySQL 密码
和交互式 Cookie 仍保存在应用自己的 JSON 文件中；它们不会暴露给远程业务页面，
但本地配置目录应视为敏感数据并纳入操作系统账号权限和备份策略。

## 前端体积优化

构建前运行 `scripts/prepare-tauri-assets.js`：

1. 复制设置页和工具页到 `.tauri-dist`。
2. 对三套业务前端逐文件计算 SHA-256。
3. 相同内容仅保留一份物理文件，在 `asset-aliases.json` 中记录逻辑路径映射。

当前资源集包含 283 个唯一文件和 317 个别名，减少约 53 MiB 重复数据。运行时 Rust
代理透明解析别名，三套前端的原始 URL 不需要改变。

## 目录

```text
src-tauri/                 Rust/Tauri 应用、代理、存储、托盘与原生命令
src-ui/                    设置页、密钥查询、密钥批量工具
web/*/dist/                三套已构建业务前端（被 Git 忽略）
scripts/prepare-tauri-assets.js
                           前端去重与打包资源生成
scripts/build-windows.cmd  固定使用 VS 2022 的 Windows 构建
scripts/build-android.cmd  固定 SDK/NDK 27 的 Android arm64 debug 构建
.tauri-dist/               生成的去重资源（被 Git 忽略）
```

仓库根目录仍保留迁移前 Electron 源码与测试，便于行为对照；Tauri 运行时不加载这些
旧主进程文件。

## 安装依赖

```bash
npm ci
```

还需要：

- Rust stable
- Windows：Visual Studio 2022 Build Tools（Desktop development with C++）
- Android：Android SDK、NDK `27.0.12077973`、JDK 17 或 21，以及 Rust Android target
- macOS/iOS：Xcode 和对应 Rust target

## 开发

```bash
npm run dev
```

## 构建

Windows：

```bat
npm run build:win
```

脚本只选择 VS 2022，不会使用或安装 VS 2026。输出：

```text
src-tauri/target/release/new-api-desktop.exe
src-tauri/target/release/bundle/nsis/New API Desktop_1.1.3_x64-setup.exe
```

macOS：

```bash
npm run build:mac
```

Linux：

```bash
npm run build:linux
```

Android 初始化和 arm64 debug APK：

```bat
npm run android:init
npm run android:build
```

输出：

```text
src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

Android release 构建默认不带发行签名；正式发布前必须配置自己的 keystore：

```bash
npm run android:build:release
```

iOS（必须在 macOS/Xcode 环境运行）：

```bash
npm run ios:init
npm run ios:build
```

## 测试

```bash
npm test
npm run check:rust
npm run test:rust
```

Android 设备安装：

```bash
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

## 配置文件

桌面端继续使用原 Electron 目录，以便直接读取现有实例：

```text
Windows: %APPDATA%/new-api-desktop/
```

主要文件：

```text
desktop-config.json        实例、语言、窗口状态、更新地址
frontend-storage.json      每实例/前端 localStorage
backend-cookies.json       每实例交互式登录 Cookie
key-query-profiles.json    密钥查询配置
key-batch-profiles.json    MySQL 配置（含密码）
```

移动端使用系统分配的应用数据目录。

## 更新

更新检查只接受 HTTPS Tauri updater JSON 地址。自动下载和安装必须在发布流程中配置
签名公钥；未配置签名时不会以不安全方式安装更新。

## License

AGPL-3.0-or-later。New API 原项目归属保持不变；桌面/移动打包与维护：MUML。

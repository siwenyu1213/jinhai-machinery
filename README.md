# 金海机械 · 网站学习练习

原生 HTML/CSS/JavaScript、Vite 与 GSAP 构建的静态展示网站。仅供学习，不用于商业接单，不收集真实客户需求。

仓库：[siwenyu1213/jinhai-machinery](https://github.com/siwenyu1213/jinhai-machinery)。Pages 地址：[金海机械学习版](https://siwenyu1213.github.io/jinhai-machinery/)。具体部署状态见 [交接.md](交接.md) 和仓库 Actions。

首版已部署，首次验证的发布代码为 `2d2c530`。[首版工作流](https://github.com/siwenyu1213/jinhai-machinery/actions/runs/39259697587) 已通过。2026-10-20 的视觉更新以真实机械摄影替换简化模型；最新提交和发布结果见交接与仓库 Actions。

机械摄影版 UI 代码为 `dd5467a`，[发布工作流](https://github.com/siwenyu1213/jinhai-machinery/actions/runs/39349567206) 已成功。本地文档与素材检查 15 项、生产构建、24 项桌面/手机浏览器测试通过；公开网站上同一套 24 项测试通过，图片文件与来源记录的 SHA-256 一致。后续文档与测试维护不改变这次已验证的 UI 代码。

## 本地运行

需要 Node.js 22.12 或更新版本；CI 使用 Node 24。首次安装：

```powershell
npm ci
npm run dev
```

打开终端提示的 `http://127.0.0.1:5173/jinhai-machinery/`。开发服务用于本机预览。

## 构建与测试

```powershell
npm run test:docs
npm run build
npm test
```

文档测试需要 Python 3.9 或更新版本和 Git，无第三方 Python 依赖。浏览器测试默认在 Windows 使用已安装的 Microsoft Edge；其他系统使用 Playwright Chromium，首次运行需要：

```text
npx playwright install chromium
```

`npm test` 会在需要时自动启动构建预览服务，测试构建后的仓库子路径。构建产物位于 `dist/`，已忽略。

查看生产构建和截图：

```powershell
npm run preview
```

预览服务运行后，在另一个终端执行 `npm run capture`，生成 360、390、768、1440px 截图，位置为 `artifacts/tmp/screenshots/`。截图与测试临时产物不进入 Git。

## 内容与代码入口

- [site/index.html](site/index.html)：业务、设备、地域、学习说明与页面结构。
- [site/src/styles/main.css](site/src/styles/main.css)：样式入口；主题与布局分别位于同目录内。
- [site/src/main.js](site/src/main.js)：功能初始化、动效设置及动画模块加载。
- [site/src/ui/contact.js](site/src/ui/contact.js)：资料清单复制与手动复制回退。
- [site/src/data/catalog.js](site/src/data/catalog.js)：业务切换内容及资料清单。
- [site/src/motion/index.js](site/src/motion/index.js)：GSAP 首屏和滚动动效。
- [tests/browser/site.spec.js](tests/browser/site.spec.js)：桌面与手机浏览器回归检查。
- [网站架构.md](网站架构.md)、[网页设计.md](网页设计.md)、[设计参考.md](设计参考.md)：设计依据与后续方向。

## 发布方式

与网站有关的源文件推送到 `main` 时，[Pages 工作流](.github/workflows/pages.yml) 先执行文档测试、构建和浏览器测试，全部通过后上传 `dist/` 并部署。文档单独更新不触发部署，可在 Actions 手动运行。发布不会上传本地 `node_modules/`、截图或测试缓存。

当前 `base` 为 `/jinhai-machinery/`，仓库名改变或使用自定义域名时，需同步调整 Vite 配置、404 首页链接及浏览器测试地址，并重跑子路径测试。

## 当前素材与功能边界

- 现有图片为本地 WebP 机械摄影，保留实际金属表面纹理；均为图库参考，非本厂实拍或客户案例。原先的三个 SVG 工件素材已移除，来源见 [素材说明.md](素材说明.md)。
- 业务微信、二维码、电话与详细厂址尚未提供。联系按钮打开学习演示，可复制资料清单，不提供虚假联系方式。
- 已实现业务照片切换、三类工艺影像、设备筛选、机械摄影放大查看、手机菜单、联系弹窗及减少动效设置。照片切换同步更新摄影来源，图片缺失仍可阅读业务与打开联系演示。
- 没有后端、登录、数据库、真实需求表单或文件上传。
- 自动手机测试属于浏览器模拟，真实手机、微信内置浏览器和本地移动网络质量需后续实机验证。

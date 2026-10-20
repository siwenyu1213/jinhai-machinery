# 金海机械 · 网站学习练习

原生 HTML/CSS/JavaScript、Vite、GSAP 与 Three.js 构建的静态展示网站。仅供学习，不用于商业接单，不收集真实客户需求。

2026-10-20 新增三爪卡盘拆装展示：位于主营业务之后，用 Three.js 呈现可独立运动的金属卡爪、导向面盘、平面螺纹盘、壳体、后盖和紧固件。下滑依次展开、展示、组合，反向滚动可连续回看；也可用整体、拆解、组合按钮或键盘进度条查看。

金属表面使用 PBR 材质、程序生成的车削与拉丝微纹理，以及本地生成的摄影棚环境反射。普通加工面、抛光边缘和深色紧固件分别设置粗糙度。模型是通用结构示意，非本厂产品或客户案例，不作为制造图纸。

3D 代码临近该区域才加载，渲染按状态变化触发，区域离开视口时停止绘制。减少动效时取消滚动固定并保留即时操作；脚本、3D 模块或 WebGL 不可用时显示同一模型的 [chuck-assembly.webp](site/public/images/generated/chuck-assembly.webp)，来源与哈希见 [模型素材记录](site/public/images/generated/chuck-assembly.json) 和 [素材说明.md](素材说明.md)。

仓库：[siwenyu1213/jinhai-machinery](https://github.com/siwenyu1213/jinhai-machinery)。Pages 地址：[金海机械学习版](https://siwenyu1213.github.io/jinhai-machinery/)。具体部署状态见 [交接.md](交接.md) 和仓库 Actions。

首版已部署，首次验证的发布代码为 `2d2c530`。[首版工作流](https://github.com/siwenyu1213/jinhai-machinery/actions/runs/39259697587) 已通过。2026-10-20 的视觉更新以真实机械摄影替换简化模型；最新提交和发布结果见交接与仓库 Actions。

当前三爪卡盘版 UI 代码为 `e4bd47d`，[发布工作流](https://github.com/siwenyu1213/jinhai-machinery/actions/runs/39371144888) 的构建与部署已成功。文档与素材检查 17 项、模型与材质检查 4 项、生产构建通过；本地生产预览、远端 CI 和公开网站上的同一套 42 项桌面/手机浏览器测试均通过。线上 HTML、CSS、JavaScript 和卡盘静态图共 7 个文件与本地构建字节一致，模型来源记录及静态图 SHA-256 匹配。最新文档提交见 Git 记录，文档单独更新不触发部署。

## 本地运行

需要 Node.js 22.12 或更新版本；CI 使用 Node 24。首次安装：

```powershell
npm ci
npm run dev
```

打开终端提示的 `http://127.0.0.1:5173/jinhai-machinery/`。开发服务用于本机预览。

## 构建与测试

npm test 会先运行 4 项模型与材质检查，再运行桌面和手机浏览器测试。CI 的图形检查使用 Chromium 软件渲染，不能代替真实手机的 GPU 性能验收。

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

拆装展示的视觉回放可运行 npm run capture:assembly，在 artifacts/tmp/assembly/ 保存 360、390、768、1440px 下 0%、25%、55%、85%、100% 的画面和控制台报告。增加 -- --poster 参数会另外导出透明背景的 poster.png，供重新生成静态 WebP 时使用；更新成品后需同步模型素材记录中的哈希。截图脚本不自动覆盖发布素材。

- [chuck-model.js](site/src/three/chuck-model.js)：带倒角、中心通孔、独立卡爪及微纹理的参数化结构。
- [chuck-scene.js](site/src/three/chuck-scene.js)：环境反射、灯光、镜头适配、按需渲染及上下文恢复。
- [assembly.js](site/src/ui/assembly.js)：滚动进度、手动控制、减少动效及静态回退。
- [模型与材质测试](tests/model/chuck.test.mjs)、[拆装浏览器测试](tests/browser/assembly.spec.js)：结构、滚动、键盘、降级和恢复验证。

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

## 项目内设计技能

已在本项目安装 [refactoring-ui](.agents/skills/refactoring-ui/SKILL.md)，来源为 [edisonmbli/refactoring-ui-skill](https://github.com/edisonmbli/refactoring-ui-skill)，固定至上游提交 `4459662c4fbf36d54342b1546d8851273031442c`。项目 [AGENTS.md](AGENTS.md) 已接入使用入口；后续界面制作、精修和评审按需读取相应设计规则，也可明确提出“用 $refactoring-ui 检查拆装区的视觉层级和间距”。

该技能包含参考文档、示例、模板及调色板生成、对比度检查、设计变量导出 3 个 Python 工具。安装记录见 [upstream.json](.agents/skills/refactoring-ui/upstream.json)，原始许可与署名一并保留。本地仅修复两处格式：将 description 改为 YAML 折叠字符串，修复冒号导致的解析失败；为设计变量参考中的 Radius 表格行补齐空单元格。规则含义与工具保持原样。

## 当前素材与功能边界

- 现有图片为本地 WebP 机械摄影，保留实际金属表面纹理；均为图库参考，非本厂实拍或客户案例。原先的三个 SVG 工件素材已移除，来源见 [素材说明.md](素材说明.md)。
- 业务微信、二维码、电话与详细厂址尚未提供。联系按钮打开学习演示，可复制资料清单，不提供虚假联系方式。
- 已实现业务照片切换、金属三爪卡盘滚动拆装与手动查看、三类工艺影像、设备筛选、机械摄影放大查看、手机菜单、联系弹窗及减少动效设置。照片切换同步更新摄影来源，图片缺失仍可阅读业务与打开联系演示。
- 没有后端、登录、数据库、真实需求表单或文件上传。
- 自动手机测试属于浏览器模拟，真实手机、微信内置浏览器和本地移动网络质量需后续实机验证。

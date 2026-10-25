# 金海机械字体提案：精工向前

状态：2026-10-25 已获用户确认，并以裁剪后的本地字库应用到正式网站。本目录保留确认时的原始独立提案，页面中的“尚未应用”提示属于提案当时的状态；没有把本目录加入网站构建入口。正式实现与来源见 [网站字体说明](../../site/public/fonts/README.md)。

这一套搭配保留现有近黑 `#0b0e0d`、奶油白 `#f2e9d6`、橙色 `#ee5428`。辨识度集中在首页短标题；正文采用正体，设备数字独立组织，避免全页同时争抢注意力。

| 用途 | 推荐字体 | 字重与排版 |
| --- | --- | --- |
| 首页大标题、品牌字、机台名 | 得意黑 Smiley Sans Oblique | 原生 400 字重，使用字体自带的倾斜与窄字形，不额外拉伸；桌面标题约 104px，手机约 60px |
| 区块标题、菜单、按钮、正文 | IBM Plex Sans SC | 正文 400、标题与按钮 600；16px 正文，约 1.9 倍行高；区块标题 36–48px |
| 功率、吨位、数量、机型数字 | IBM Plex Sans Condensed | 大数字 600、小数字 400；使用等宽数字特性；单位与数字按基线对齐 |

只提供一套推荐搭配。“当前字体”按钮将同一构图切换为正式网站的系统字体，方便比较；它不是正式网站的逐像素复刻。预览使用现有车床模型的静态图，原网页中的模型交互不受影响。自定义标题只写入页面的 `textContent`，不保存、不联网发送。

## 本地运行与验证

在项目根目录执行：

```powershell
npx vite --config design-previews/typography/vite.config.js
npx vite build --config design-previews/typography/vite.config.js
npx vite preview --config design-previews/typography/vite.config.js
npx playwright test --config playwright.typography.config.js
```

开发预览为 `http://127.0.0.1:4176/`；生产构建预览为 `http://127.0.0.1:4177/`。两个服务只监听本机。独立输出目录为 `design-previews/typography/dist/`，不会加入正式网站 `dist/`。

字体全部从官方发布取得，保存原文件、许可和 SHA-256；来源见 [sources.json](sources.json)。得意黑为 v2.0.1；IBM Plex 固定至 `71f558992315a12ca1f06a2215d57962a1992162`。两者使用 SIL Open Font License 1.1，完整许可见 [得意黑许可](fonts/SmileySans-LICENSE.txt) 和 [IBM Plex 许可](fonts/IBMPlex-LICENSE.txt)。

本预览暂用完整字体，约 9.1 MB，以核对实际汉字覆盖和效果；正式应用前再根据已确认用途生成字库子集和加载策略，保留协议及来源。未安装到 Windows 字体目录，运行时没有第三方字体请求。

用户确认后再进行：正式网站字体角色映射、实际动效页面的排版适配、字库裁剪、加载回退和完整验收。本次仅交付方案与独立预览。

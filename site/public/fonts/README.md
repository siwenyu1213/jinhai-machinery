# 网站字体与本地子集

用户已确认 [原始字体提案](../../../design-previews/typography/README.md)。首页和网站内三机装配页使用以下字形，运行时没有外部字体请求：

| 角色 | 原始字体 | 子集内部名称 | 字重 |
| --- | --- | --- | --- |
| 品牌、首页短标题、机台名 | 得意黑 Smiley Sans v2.0.1 | Jinhai Display | 400 |
| 正文、界面、区块标题 | IBM Plex Sans SC | Jinhai Text | 400 / 600 |
| 功率、吨位、数量和型号数字 | IBM Plex Sans Condensed | Jinhai Narrow | 400 / 600 |

使用已审阅的原文件，通过 fontTools 4.60.1 生成 WOFF2 子集，保留所需字形轮廓、布局特性、版权和许可名称表。为了遵守原字体保留名称规则，派生文件内部名称改为上表中的 Jinhai 名称；这些名称用于技术标识，不代表重新设计了原字形。

五个文件合计 289092 字节，原始五个字体合计 9114456 字节。首屏只预载 `jinhai-display.woff2` 与 `jinhai-text-regular.woff2`；其他字重正常随样式加载，全部采用 `font-display: swap`。字体请求失败或出现子集未覆盖的新字时，浏览器回退到系统中文字体。

来源、原始文件和输出 SHA-256、覆盖字符见 [sources.json](sources.json)。完整许可见 [得意黑 OFL](SmileySans-LICENSE.txt) 与 [IBM Plex OFL](IBMPlex-LICENSE.txt)。官方来源保存在原始提案的 [来源清单](../../../design-previews/typography/sources.json)。

重建命令在项目根目录执行：

```powershell
uv run --no-project --with 'fonttools[woff]==4.60.1' python scripts/subset-site-fonts.py
```

[构建脚本](../../../scripts/subset-site-fonts.py) 在运行前核对原始文件 SHA-256。正文字符收集范围是网站和模型中的 HTML、JavaScript、CSS、地图及 JSON 文本；数字字库保留可打印 ASCII。添加新文案后应重新生成子集，并运行字体完整性和浏览器验证。构建工具只用于生成静态文件，没有新增网站运行依赖，也不修改 Windows 已安装字体。

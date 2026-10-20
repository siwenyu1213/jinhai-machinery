# 金海机械项目协作规则

## 注意事项

- 每次改动完成后，都必须创建一个对应的 Git commit，以便后续追踪和回滚。
- 每次改动后，都必须编写或更新相关测试，并在交付给用户前，确保所有测试和验证全部通过。

## 项目入口

- 开始工作前阅读 [网页设计.md](网页设计.md)、[网站架构.md](网站架构.md) 和 [交接.md](交接.md)，确认当前阶段、已完成内容和待办。
- 当前阶段为学习版 MVP 实现与发布；开发、验证和部署状态以交接文件、实际仓库和 Actions 为准。
- 前端制作前阅读 [设计参考.md](设计参考.md)，采用与本项目相符的构图、动效与精修原则；第三方参考不替代用户要求，也不代表对应技能已经安装。
- 用户的 GitHub 用户名为 `siwenyu1213`。远程操作前通过 `gh api user` 核验，不以旧的本地认证标签判断账号。
- 只暂存本任务明确涉及的文件；保留用户已有修改。禁止强推、重置或覆盖远程历史。
- 真实设备、加工精度、维修范围、上门及急单能力、价格、联系方式与案例必须由用户确认，不得编造。

## 验证与交付

- 文档或技能变动也要补充相关验证；运行 `python -X utf8 -m unittest discover -s tests -v`。前端变动需执行 `npm run build` 和 `npm test`，检查生产构建而非只检查开发页面。
- 项目内技能还需运行 skill-creator 的 `quick_validate.py`；具体命令见 [交接.md](交接.md)。
- 提交前运行 `git diff --check` 和 `git diff --cached --check`，审查暂存内容后再提交。
- 验证失败应先修复并重跑；环境导致无法验证时明确报告阻碍，不声称全部通过或已完成交付。
- 本地提交、远程推送、网站发布是不同状态，分别核验并报告。

## 项目内技能

- 名称：`project-handoff`
- 入口：[.agents/skills/project-handoff/SKILL.md](.agents/skills/project-handoff/SKILL.md)
- 当用户说“此对话结束”，或明确要求结束当前会话并交接时，必须读取并执行该技能，将本次会话实际操作和主要步骤简洁更新至根目录 `交接.md`，验证后创建对应 commit。
- 新聊天即使未自动发现技能，也通过本文件的入口执行。仅创建技能不代表已经触发结束对话操作。

### refactoring-ui

- 入口：[.agents/skills/refactoring-ui/SKILL.md](.agents/skills/refactoring-ui/SKILL.md)。
- 在本项目构建、调整或评审网页界面时，先阅读该技能并按意图选择工作流；只按需读取相应参考文件，不一次加载整个 references 目录。
- 将视觉层级、间距、排版与配色规则映射到现有原生 CSS 和设计变量，遵循已确认的机械风格与项目约定；参考中的 Tailwind 写法不代表需要安装 Tailwind。
- 来源与固定版本、本地兼容修订及文件哈希见 [upstream.json](.agents/skills/refactoring-ui/upstream.json)，保留上游 MIT 许可与署名。

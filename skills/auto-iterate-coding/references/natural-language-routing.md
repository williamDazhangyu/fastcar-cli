# Natural Language Routing

用于把用户自然语言请求映射为 `fastcar-cli auto-iterate ...` 命令。Agent 只有在用户表达“帮我启动/生成/恢复/切换/检查/规划/诊断/原型/优化”时才执行命令；如果只是询问命令含义，只解释不执行。

## 执行原则

- 优先用用户原话推断 `mode`、`goal`、`from`、`session`、迭代预算和是否允许修改。
- 用户已明确目标、文件路径或 session 名时，不要重复询问。
- 只有缺少会影响安全、兼容性或外部资源的关键信息时，才向用户提问。
- 自动调用命令时追加 `--yes`，避免卡在 CLI 交互提示。
- 每次自然语言路由都必须显式传入 `--session <name>`；用户未指定时，Agent 生成英文小写、数字和连字符组成的默认 session 名。
- 调用命令后，直接把 CLI 输出的启动提示词作为后续执行依据。

## 映射表

| 用户说法 | Agent 应调用 |
| --- | --- |
| “快速开始修这个问题” / “开一个自动迭代任务” | `fastcar-cli auto-iterate --quick --goal "<目标>" --session <session> --yes` |
| “完整实现这个文档” / “把文档里的需求都做完” | 如果能确定文档路径，调用 `fastcar-cli auto-iterate --strict --from <文档路径> --session <session> --yes`；不能确定时先搜索或询问文档路径 |
| “完整实现 docs” / “实现 docs 文档” | 先确认 `docs` 是文件还是目录；如果是目录，先找候选需求文档，不要盲目把目录当文件传给 `--from` |
| “根据 docs/prd.md 全部实现” / “按 docs/prd.md 做完” | `fastcar-cli auto-iterate --strict --from docs/prd.md --session <session> --yes` |
| “严格按这个 PRD 做” / “完整实现这个文档” | `fastcar-cli auto-iterate --strict --from <文档路径> --session <session> --yes` |
| “检查这个 PRD 是否实现了，不要改代码” / “帮我验收” | `fastcar-cli auto-iterate --verify --from <文档路径> --session <session> --yes` |
| “诊断这个 bug” / “debug 这个问题” / “先复现再修” | `fastcar-cli auto-iterate --diagnose --goal "<目标>" --session <session> --yes` |
| “诊断 npm test 失败” / “flaky 测试” | `fastcar-cli auto-iterate --diagnose --goal "<目标>" --session <session> --yes` |
| “只帮我规划一下，不要写代码” | `fastcar-cli auto-iterate --plan-only --goal "<目标>" --session <session> --yes` |
| “先做原型验证状态机” / “做一次性原型” | `fastcar-cli auto-iterate --prototype --goal "<目标>" --session <session> --yes` |
| “试几个 UI 方案” / “做 UI 原型” | `fastcar-cli auto-iterate --prototype --goal "<目标>" --session <session> --yes` |
| “优化这个模块” / “提升性能但别改行为” | `fastcar-cli auto-iterate --optimize --goal "<目标>" --session <session> --yes` |
| “列出自动迭代任务” | `fastcar-cli auto-iterate --list` |
| “切换到登录修复任务” | `fastcar-cli auto-iterate --switch <session>` |
| “恢复登录修复任务” | `fastcar-cli auto-iterate --resume <session>` |
| “session 叫 login-bugfix” | 在命令中追加 `--session login-bugfix` |
| “最多迭代 5 次” / “最多跑 5 轮” | 在命令中追加 `--autopilot-max-iterations 5` |
| “普通预算 50 轮” / “max_iterations 50” | 在命令中追加 `--max-iterations 50` |
| “Autopilot 预算 10 轮” | 在命令中追加 `--autopilot-max-iterations 10` |

## 意图判断顺序

```text
1. session 管理：列出 / 切换 / 恢复
2. 明确禁止修改：verify 或 plan-only
3. 明确要求诊断、debug、复现、flaky、性能回归：diagnose
4. 明确要求原型、试方案、验证状态机、验证数据模型：prototype
5. 明确要求规划：plan-only
6. 明确要求验收/检查完成度：verify
7. 明确要求优化/重构且保持行为：optimize
8. 提供长文档、PRD、issue 路径：优先 --from
9. 默认小中型目标：quick
10. 明确生产、完整、严格、复杂：strict
```

## 预算推断

- 用户说“最多迭代 N 次 / 最多跑 N 轮 / 自动修 N 轮以内”时，优先映射为 `--autopilot-max-iterations N`。
- 用户明确说 `max_iterations`、普通预算、总预算时，映射为 `--max-iterations N`。
- 用户同时给出普通预算和 Autopilot 预算时，同时追加两个参数。
- 用户没有给预算时，不要追问，使用 CLI 默认值。
- 迭代次数是安全预算，不是必须执行次数；不要为了消耗预算而继续修改。

## Session 推断

- 用户明确说“session 叫 X”时使用 `--session X`。
- 用户没给 session 时，Agent 必须生成一个默认 session 名并显式传给 CLI，不要省略 `--session`。
- 默认 session 名使用英文小写、数字和连字符，优先由模式和目标关键词组成，例如 `quick-login-bugfix`、`diagnose-flaky-e2e`、`prototype-order-state-machine`、`verify-prd-check`。
- 如果生成后发现 session 已存在，优先追加短后缀或时间语义后缀生成新 session；不要覆盖历史 session，除非用户明确要求。
- 如果用户说的是“登录修复任务”“PRD 验收任务”等自然名称，Agent 应优先尝试从已有 session 中匹配；不确定时先运行 `fastcar-cli auto-iterate --list`。

## 示例

```text
用户：帮我快速启动自动迭代，修复登录失败，session 叫 login-bugfix
Agent：fastcar-cli auto-iterate --quick --goal "修复登录失败" --session login-bugfix --yes

用户：帮我快速启动自动迭代，修复登录失败，最多跑 5 轮，session 叫 login-bugfix
Agent：fastcar-cli auto-iterate --quick --goal "修复登录失败" --autopilot-max-iterations 5 --session login-bugfix --yes

用户：帮我验收 docs/prd.md，不要改代码，session 叫 prd-check
Agent：fastcar-cli auto-iterate --verify --from docs/prd.md --session prd-check --yes

用户：帮我诊断登录偶发失败，先复现再修，session 叫 login-diagnose
Agent：fastcar-cli auto-iterate --diagnose --goal "诊断登录偶发失败，先复现再修" --session login-diagnose --yes

用户：先做一个逻辑原型验证订单状态机，session 叫 order-prototype
Agent：fastcar-cli auto-iterate --prototype --goal "验证订单状态机" --session order-prototype --yes

用户：恢复登录修复任务
Agent：先运行 fastcar-cli auto-iterate --list 匹配 session；如果唯一匹配 login-bugfix，则运行 fastcar-cli auto-iterate --resume login-bugfix
```

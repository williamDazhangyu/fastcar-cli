# Adapters

这里放不同 Agent、平台或项目脚手架的适配层。

## 作用

- 把同一套协议映射到不同 Agent 平台。
- 把平台差异和环境变量收敛到独立文件。
- 避免主协议里混入大量平台特化细节。

## 建议内容

- Agent 配置样例。
- 平台启动入口。
- 环境变量说明。
- 适配边界和限制。

## 当前约定

- `adapters/index.md` 是平台适配导航入口。
- 平台适配优先放在 `adapters/<platform>/` 子目录。
- 旧镜像文件 `agents/openai.yaml` 和 `adapters/openai.yaml` 保留兼容，不作为新内容首选落点。

# DeepSeek 独立裁判适配

通过 `scripts/start.mjs` 启动，不需要手工设置 `SIEVE_JUDGE_URL` 或临时令牌。

本地鉴权接口将 Sieve 的 System One 问题转为 DeepSeek JSON 请求。主流程走 Messages，裁判走 Chat Completions；两者固定 `deepseek-flash`、关闭思考，所有请求共享持久化预算。只监听 `127.0.0.1` 的随机端口，认证令牌每个进程随机生成。

凭据先读取 `DEEPSEEK_API_KEY` 环境变量，否则从 `SIEVE_CREDENTIALS_FILE` 所指 YAML 的 `refs.DEEPSEEK_API_KEY` 读取。同一密钥在 DSH 启动前放入继承环境，供主模型使用；已有 DSH 凭据记录可能有更高优先级，应确保使用的 profile 对应同一账户。

环境变量：

| 变量 | 含义 |
|---|---|
| `DSH_CLI` | 已有 DSH JavaScript CLI 入口 |
| `DEEPSEEK_API_KEY` | 本地密钥，或改用下项 |
| `SIEVE_CREDENTIALS_FILE` | 已有本地 YAML 凭据文件 |
| `SIEVE_STATE_ROOT` | 本仓库运行状态目录，默认 `state/` |
| `SIEVE_BUDGET_FILE` | 本轮账本路径，默认 `state/deepseek-budget.json` |
| `SIEVE_BUDGET_CNY` | 累计上限，默认 2，必须大于 0 且不超过 2 |

价格估算按实验当时的公开费率；不等同于账户实际账单。未知用量保持按字节预留，不当作免费请求。请求失败不会自动增加预算。裁判失败时 Sieve 保留原文，主流程预算不足会停止。

`core.mjs` 负责判断格式转换、答案验证和预算计算；`register.mjs` 负责凭据读取、本地接口和请求转发。`pnpm test` 中的适配测试全部使用模拟网络和假密钥，不花 API 费用。

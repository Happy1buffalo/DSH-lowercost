# DSH-lowercost

面向 **DeepSeek Harness（DSH）** 的上下文管理插件项目，用于减少工具输出、历史记录和技能目录在模型请求中占用的 token。

项目包含插件核心、Web 面板、DeepSeek 独立裁判接口、启动配置和测试工具。主模型负责完成任务，独立裁判负责判断上下文相关性；被压缩的工具输出保留完整归档，模型需要时可以回读。

## 主要功能

| 功能 | 说明 |
|---|---|
| 工具输出整理 | 压缩测试中的重复通过日志，保留失败信息和汇总；支持原生 PowerShell |
| 搜索与文件状态整理 | 将 `rg --json` 和 Git 文件状态转换为更紧凑的表示 |
| 重复文本压缩 | 提取重复行的公共前缀和后缀，保留原行号及变化部分，应用前验证能够完整还原 |
| 历史上下文管理 | 结合相关性与提示缓存重建成本，决定是否裁剪旧工具结果 |
| 关键内容保留 | 保留明确标记的约束、决策、待办、指定字段及原文归档指针 |
| 技能按需展示 | 根据任务相关性筛选技能目录，减少无关描述 |
| 判断缓存 | 复用完全相同的有效判断，模型或输入变化时重新判断 |
| 费用记录与预算 | 主流程、附带模型请求及独立裁判共用持久化账本，在请求发送前检查预算 |

### 文本压缩与原文回读

对于重复度较高的文本，插件将公共部分保存一次，每行单独记录变化内容。在使用该表示前，会逐字符重建并核对所有源行；完整工具输出同时归档，结果附带回读路径。这一步不需要额外调用模型。

行模板适用于原生 `read` 完整读取的 `.txt` 文件：工具输出为 8,000–45,000 字符，行号连续，至少 8 条长行共享足够长的后缀，并达到压缩收益门槛。范围读取、截断输出、不适用的文件类型和要求逐字核对的请求会跳过这项处理。

可还原的表示仍可能影响模型理解，因此应同时检查任务正确率、回读次数、token 和耗时，不能只看文本缩短比例。

## 环境要求

- Node.js `^22.19.0` 或 `>=24`，pnpm `11.21.0`。
- 已安装并配置兼容的 DeepSeek Harness。插件声明范围为 `>=0.2.1-rc.2 <0.2.2-0`，本地验证使用 `0.2.1-rc.5`。
- 运行任务时需要本地 DeepSeek API 密钥；免费测试不需要真实密钥。

默认配置使用 `deepseek-flash`，关闭思考，主模型输出上限为 768 token。默认文本处理不需要 Python 或本地模型权重。

## 安装与构建

```powershell
git clone https://github.com/Happy1buffalo/DSH-lowercost.git
cd DSH-lowercost
npm install --global pnpm@11.21.0
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
```

仓库包含源代码和锁文件；DSH 本体、依赖目录、模型权重和构建产物需要在本地准备。

## 配置与使用

先确保所用的 DSH profile 已安装 Sieve，提供插件所需的服务。无界面 profile 的安装示例：

```powershell
dsh plugin --profile headless add dsh-sieve@0.4.1
```

如果使用 Web 面板：

```powershell
dsh plugin --profile web add dsh-sieve@0.4.1 dsh-sieve-web@0.4.1
```

在本地指定现有 DSH 的 JavaScript CLI 入口和凭据文件，路径按自己的安装位置修改：

```powershell
$env:DSH_CLI = 'D:\work\deepseek-harness\apps\cli\lib\bin.js'
$env:SIEVE_CREDENTIALS_FILE = 'D:\my-private-config\credentials.yaml'
```

凭据文件需包含 `refs.DEEPSEEK_API_KEY`。也可以改用本地环境变量 `DEEPSEEK_API_KEY`。启动器不会自动读取 `.env` 文件，真实密钥不应写入仓库。

如现有 DSH 使用自定义数据目录，继续设置对应的 `DSH_HOME`，以便找到已安装的 profile。切换到要处理的项目目录后启动：

```powershell
cd D:\work\my-project

# 无界面运行
node D:\work\DSH-lowercost\scripts\start.mjs headless '查看项目测试失败的原因'

# Web 界面
node D:\work\DSH-lowercost\scripts\start.mjs web
```

可以用 `--dsh-cli <绝对路径>` 代替 `DSH_CLI`；运行 `node scripts/start.mjs --help` 查看参数说明。

启动器会加载本仓库的构建产物、保护规则和启动配置，准备独立裁判接口，并生成本地运行配置。配置通过启动覆盖层生效，不写入已有 profile。默认关闭 checkpoint、monitor、hive、resume 和 team 模块，集中运行上下文管理功能。

## 独立裁判与预算

裁判接口只监听本机 `127.0.0.1` 的临时端口，并使用每次启动生成的令牌鉴权。它把插件的结构化判断问题转换为独立 DeepSeek 请求。主模型与裁判是分别计费的调用。

| 环境变量 | 用途 |
|---|---|
| `DSH_CLI` | 已有 DSH JavaScript CLI 入口 |
| `DEEPSEEK_API_KEY` | 本地 DeepSeek 密钥 |
| `SIEVE_CREDENTIALS_FILE` | 本地 YAML 凭据文件，可替代密钥环境变量 |
| `SIEVE_STATE_ROOT` | 运行状态目录，默认本仓库 `state/` |
| `SIEVE_BUDGET_FILE` | 预算账本路径，默认 `state/deepseek-budget.json` |
| `SIEVE_BUDGET_CNY` | 账本累计预算上限，默认 ¥2，支持大于 0 且不超过 2 的值 |

每次模型请求先预留费用，收到实际用量后按缓存命中情况更新。未知用量保持保守预留；同一账本禁止多个进程同时使用。重启不会清零预算。需要开始新一轮运行时，指定新的账本路径并保留旧记录。

账本金额按记录的 API 费率估算，不等同于账户账单；价格变化后应复核费率。凭据、运行状态、会话和日志均排除在 Git 提交之外。

[独立裁判接口说明](deepseek-judge/README.md)

## 测试与验证

在仓库目录运行：

```powershell
pnpm test
pnpm verify:snapshot
```

免费测试覆盖结构化输出、判断缓存、字段保留、文本还原、裁判格式转换、鉴权、取消和共享预算。当前 21 项测试全部通过，使用模拟网络，不会请求付费 API。指纹检查验证源码、规则及评测时构建文件的一致性，允许 CRLF/LF 换行符转换。

已配置兼容的 `DSH_CLI` 与 profile 后，可运行 `node scripts/smoke-dsh.mjs`，通过真实 DSH 原生读取检查插件加载、行模板压缩、完整还原和归档。该检查使用固定驱动并拦截外网，不花 API 费用，也不代表模型答题能力。

仓库另保存了一组 20 题短测记录，包含逐题答案、token、费用、回读、耗时及材料指纹。题目以合成材料为主，用于检查具体处理场景，不能代表完整代码任务或长期会话的表现。

[测试记录与方法](benchmarks/qa20/README.md) · [逐题结果](benchmarks/qa20/results.json) · [还原检查](benchmarks/qa20/reconstruction-verification.json) · [构建验证记录](VALIDATION.md)

## 文件与目录

| 路径 | 内容 |
|---|---|
| `packages/dsh-sieve/` | 插件核心，包括工具输出处理、历史管理、技能筛选及判断接口 |
| `packages/dsh-sieve-web/` | Web 面板的宿主与浏览器端源码 |
| `config/` | 启动配置模板，由启动器填入本地模块路径 |
| `deepseek-judge/` | DeepSeek 裁判接口、预算记录及相关测试 |
| `feedback/` | 保护字段规则和生成规则所用的开发反馈 |
| `scripts/start.mjs` | 启动入口，连接现有 DSH 与本地插件 |
| `scripts/build-client.mjs` | Web 浏览器端构建工具 |
| `scripts/learn-preservation.mjs` | 从开发反馈生成字段保护规则 |
| `scripts/smoke-dsh.mjs` | 免费的 DSH 集成检查 |
| `scripts/verify-snapshot.mjs` | 源码、规则和构建文件指纹检查 |
| `tests/` | 功能测试及集成检查所用的固定驱动 |
| `benchmarks/qa20/` | 20 题测试结果、方法说明和冻结指纹 |
| `docs/upstream/` | 组件参考文档与历史记录 |
| `provenance.json` | 来源信息及用于一致性检查的指纹 |
| `package.json` | 项目依赖、环境要求及构建命令 |
| `pnpm-lock.yaml` | 固定的依赖解析结果 |
| `state/` | 本地运行时生成的配置、预算和日志，不提交到 Git |

## 许可证与相关项目

项目采用 [MIT 许可证](LICENSE)，保留相关组件的版权声明和第三方许可说明。

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：运行环境。
- [Sieve](https://github.com/Sev7eEn7/dsh-sieve)：上下文管理组件。
- 相关设计参考：[RTK](https://github.com/rtk-ai/rtk)、[DCP](https://github.com/Tarquinen/opencode-dynamic-context-pruning)、[Context Fold](https://github.com/GitMacke/opencode-context-fold)、[ACON](https://arxiv.org/abs/2510.00615)、[Observation Masking](https://arxiv.org/abs/2508.21433)。

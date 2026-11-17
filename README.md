# DSH-lowercost · ABCDG

用于 **DeepSeek Harness（DSH）** 的 Sieve 实验改进版，目标是在保留任务质量的同时降低上下文输入成本。

本仓库保存的是 **A + B + C + D + G** 组合：基于 [dsh-sieve 0.4.1](https://github.com/Sev7eEn7/dsh-sieve)，主模型与独立裁判均接入 DeepSeek。它是 DSH 插件，不是独立聊天软件，也不需要为 G 下载本地语言模型。

## A / B / C / D / G 分别做什么

| 功能 | 实现 | 边界 |
|---|---|---|
| A：结构化工具输出 | 支持原生 PowerShell 测试日志；将 `rg --json`、Git 文件状态转为紧凑表示 | 只处理已支持格式，保留完整归档 |
| B：判断复用与缓存成本门槛 | 缓存完全相同的裁判输入；保守复用同类代码任务的技能判断；按重建缓存成本决定是否裁剪旧历史 | 模型、任务或技能目录变化时失效；历史裁剪门槛仍是启发式 |
| C：事实保留 | 历史裁剪时留下明确标记的约束、决策、待办等完整行和归档指针 | 不是任意事实识别，也不是生成式摘要 |
| D：保护字段 | 使用开发反馈学习字段名，压缩时保护这些字段 | 当前冻结规则只有字段名，不包含评测答案 |
| G：可还原的行模板 | 相同长前缀、后缀只保留一份；逐行保留行号和变化内容，应用前重建并逐字符核对 | 仅适用于足够重复的文本；不调用额外模型 |

主模型实际看到的 G 表示类似：

```json
{
  "templates": [
    {"prefix": "tenant=", "suffix": "; shared operational context...", "rows": [[1, "001; latency_ms=82"], [2, "002; latency_ms=141"]]}
  ],
  "plain": [[3, "A complete independent source line"]]
}
```

每行可由 `prefix + row value + suffix` 还原。完整工具输出另存为归档，结果附有回读路径。**可还原不等于模型理解一定无损**，因此费用和答题质量一起评测。

### G 什么时候启用

- 原生 `read` 工具完整读取 `.txt`；参数仅有 `file_path`，不带 `offset` / `limit`。
- 工具输出为 8,000–45,000 字符，带连续行号和完整文件结束标记。
- 至少 8 条长行共享足够长的后缀，压缩净收益达到门槛。
- 明确要求 `exact` / `quote` / `verbatim` / 原文 / 逐字 / 原样时跳过。
- 代码文件、短文本、不重复文本、截断读取、明显的指令或凭据文件保持原样。

以上是保守适用条件，不是通用秘密检测器。F（LLMLingua）相关源码作为历史实验保留，但 **ABCDG 启动器不启用 F**，不需要 Python 或模型权重。

## 最新 20 题短测

2026-11-17，固定比较 ABCD 与 ABCDG，两组各 20 道独立题，主模型和独立裁判均为 `deepseek-flash`。输出上限 768，关闭思考，`temperature=0`。

| 指标 | ABCD | ABCDG |
|---|---:|---:|
| 内容正确 / 严格 JSON 正确 | 20/20 · 20/20 | **20/20 · 20/20** |
| 累计输入 token，含主流程和裁判 | 186,759 | **167,580（−10.3%）** |
| 按实际缓存用量估算费用 | ¥0.194509 | **¥0.129978** |
| 统一按未命中缓存单价重算 | ¥0.400726 | **¥0.362528（−9.5%）** |
| 20 题累计耗时 | 159.1 秒 | 160.9 秒 |
| 额外回读 | 1 | 1 |

G 在 12 道重复文本题中实际生效，模型请求投影中确认收到模板；全部模板逐行还原与归档检查通过。8 道控制题跳过 G。两组全部 API 费用合计估算约 **¥0.3245**，小于本轮 ¥2 上限。费用按 API 返回用量及当时公开价格估算，没有查询账户账单；33.2% 的缓存感知费用降幅包含缓存命中差异，不能全部归因于 G。

**测试范围：**18 道合成材料题与 2 道真实 Django 材料题；12 题特意覆盖 G 可处理的重复文本。真实 Django 部分是日志 / 源码问答，没有重新执行完整 Django 测试。独立裁判本轮实际用于技能筛选；原生 PowerShell 测试日志由规则压缩，未额外触发日志裁判。此结果说明本轮未观察到问答退化，不能证明完整代码任务、长会话或其他模型上没有性能下降，也不能代表实际任务中 G 的触发比例。

[实验摘要与方法](benchmarks/qa20/README.md) · [逐题答案和指标](benchmarks/qa20/results.json) · [还原检查](benchmarks/qa20/reconstruction-verification.json)

## 安装与构建

需要 Node.js `^22.19.0` 或 `>=24`，pnpm `11.21.0`，以及已有的兼容 DSH 安装。本地验证使用 DSH `0.2.1-rc.5`；插件声明兼容范围为 `>=0.2.1-rc.2 <0.2.2-0`，不保证其他版本。

```powershell
git clone https://github.com/Happy1buffalo/DSH-lowercost.git
cd DSH-lowercost
npm install --global pnpm@11.21.0
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm test
pnpm verify:snapshot
```

`pnpm test` 运行 21 项不收费测试，覆盖 A/B/C/D/G、精确还原、裁判转换、鉴权、取消、共享预算与缓存计费。它们使用本地模拟网络，不会请求付费 API。仓库不包含 DSH 本体、`node_modules`、模型权重或预编译产物。

已设置兼容的 `DSH_CLI` 与相应 profile 后，还可运行 `node scripts/smoke-dsh.mjs`：通过真实 DSH 原生读取检查启动配置、G 实际应用、逐字符还原与完整归档；主模型使用固定驱动、外网被拦截，不代表答题能力，不花 API 费用。

## 运行 ABCDG

启动器复用现有 DSH 的 JavaScript CLI 入口。先确保要使用的 DSH profile 已安装 Sieve，使其提供插件所需服务；例如无界面的 `headless` profile：

```powershell
dsh plugin --profile headless add dsh-sieve@0.4.1
```

Web profile 若要使用原版面板：

```powershell
dsh plugin --profile web add dsh-sieve@0.4.1 dsh-sieve-web@0.4.1
```

然后在本地设置密钥或现有凭据文件。以下均为路径示例，不是仓库内的文件：

```powershell
# DSH 从源码构建时的 CLI 路径示例；按自己的安装位置修改。
$env:DSH_CLI = 'D:\work\deepseek-harness\apps\cli\lib\bin.js'

# 方式一：复用自己的 DSH 凭据文件，文件需包含 refs.DEEPSEEK_API_KEY。
$env:SIEVE_CREDENTIALS_FILE = 'D:\my-private-config\credentials.yaml'

# 方式二：在本地环境中设置 DEEPSEEK_API_KEY，替代凭据文件。
# 不要将真实密钥写入仓库或聊天。启动器不会自动读取 .env 文件。
```

如 DSH 使用自定义数据目录，继续设置原来的 `DSH_HOME`，不要随意换到一个没有安装相应 profile 的空目录。

在要处理的项目目录运行，避免把本仓库误当成任务工作区：

```powershell
cd D:\work\my-project
node D:\work\DSH-lowercost\scripts\start-abcdg.mjs headless '查看项目测试失败的原因'

# 或打开 DSH Web
node D:\work\DSH-lowercost\scripts\start-abcdg.mjs web
```

也可用 `--dsh-cli <绝对路径>` 代替 `DSH_CLI`。`--help` 不需要密钥。启动器自动设置 `SIEVE_LAB_FEATURES=A,B,C,D,G`，加载本仓库的构建产物和冻结规则，并通过启动覆盖配置停用原 `sieve`、插入 ABCDG；不会写入原 profile 配置。原版附加的 checkpoint / monitor / hive / resume / team 在此实验配置中关闭。

`config/abcdg.patch.yml` 不能单独绕过启动器运行：其中的路径、独立裁判端点和临时令牌由启动器与 preload 在同一进程准备。DSH 配置中的 `name` 是目标名称检查，不能通过直接改原条目的 `name` 替换模块。

### 独立裁判与预算

`deepseek-judge/register.mjs` 在本机临时端口提供鉴权的 System One 接口，把 Sieve 的结构化判断转换为独立 DeepSeek 请求。主模型与裁判是两次独立调用，均计费，裁判不会直接复用主模型回答。

- 默认共享账本：本仓库 `state/deepseek-budget.json`，主流程、附带请求和裁判共用。
- 默认累计上限 ¥2；重启不会清零。可用 `SIEVE_BUDGET_CNY` 设为不超过 2 的正数。
- 每次请求先预留预算；未知用量保留保守预留；已知缓存命中单独计费。
- 同一账本禁止多进程同时使用，不自动提高上限或覆盖旧记录。
- 开展新一轮实验时，指定一个全新的 `SIEVE_BUDGET_FILE`，保留原账本。
- `state/`、凭据文件、会话、日志和 `.env` 均不纳入 Git。

详细说明见 [DeepSeek 裁判适配](deepseek-judge/README.md)。当前价格表记录的是本次实验所用费率，API 价格变化后应先复核。

## 目录

```text
packages/dsh-sieve/       Sieve 核心及 ABCDG TypeScript 实现
packages/dsh-sieve-web/   保留的上游 Web 面板源码
config/abcdg.patch.yml   ABCDG 启动覆盖配置
deepseek-judge/          独立 DeepSeek 裁判、共享预算与免费测试
feedback/               冻结保护字段及开发反馈
scripts/start-abcdg.mjs  跨路径启动器
tests/                  改进功能免费测试
benchmarks/qa20/         20 题摘要、逐题结果与冻结指纹
docs/upstream/          上游说明与历史实验笔记，仅供溯源
provenance.json         上游提交与本次源码 / 编译产物指纹
```

## 来源与许可

基于 [Sev7eEn7/dsh-sieve](https://github.com/Sev7eEn7/dsh-sieve)，原始基线提交 `147915819213e5f97841db512c07181d3af839e6`，保留上游 MIT 许可证和第三方说明。DSH 来自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。本项目为独立实验改进版，不是上游官方发布。

ABCDG 插件实现和冻结规则与上述 20 题实测版本一致；仅为独立仓库调整了启动路径、凭据读取和测试路径。`pnpm verify:snapshot` 在构建后检查源码与评测时编译产物指纹，允许 Git 跨平台的 CRLF/LF 换行符转换，其余内容必须一致。

设计参考：[RTK](https://github.com/rtk-ai/rtk)、[DCP](https://github.com/Tarquinen/opencode-dynamic-context-pruning)、[Context Fold](https://github.com/GitMacke/opencode-context-fold)、[ACON](https://arxiv.org/abs/2510.00615)、[Observation Masking](https://arxiv.org/abs/2508.21433)。这里实现的是受启发的实验方案，不是完整论文复现；论文中的收益不能替代本项目实测。

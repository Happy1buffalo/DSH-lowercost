# Sieve 独立实验版

目录：`D:\work\DSH-Sieve\sieve-lab`。从原版 Sieve 0.4.1 的提交 `147915819213e5f97841db512c07181d3af839e6` 建立独立副本。B0 原版、旧优化版与它们的网页服务均没有被替换。

## 开关与实现

通过启动进程的 `SIEVE_LAB_FEATURES` 选择 `A`、`B`、`C`、`D`，逗号分隔。实验目录中的配置已分别选择单项和组合。

| 开关 | 实际实现 | 适用范围与限制 |
|---|---|---|
| A | 为原有测试日志压缩增加原生 PowerShell 支持；把 `rg --json` 的搜索结果转成路径、行号、匹配原文；把 Git 文件状态按目录和状态分组 | 保留原文归档；未知格式保持原样。只覆盖这些格式，未完整移植 RTK |
| B | 完全相同的裁判输入复用有效答案；明确属于同一代码任务且技能目录未变时复用技能筛选；根据重建提示缓存的估算成本延迟历史裁剪 | 24 小时、128 条裁判缓存；任务不明确或目录变化会重新判断。成本门槛假设未来 6 次缓存命中请求，不是学习得到的最优策略 |
| C | 裁剪历史时从中间抽取标记过的约束、决策、待办等完整原文行，和归档指针一起留下 | 最多 8 行、1200 字符；只支持明确标签，不保证识别任意事实；不使用生成式摘要 |
| D | 从开发失败记录提取需要保护的字段名；在工具输出筛选和历史裁剪时保护这些字段 | 本轮仅用两条开发反馈，规则只有字段名、不含测试值；是 ACON 思路的最小实验，不包含其完整优化或蒸馏流程 |

涉及代码：`packages/dsh-sieve/src/features/lab.ts`、`admission.ts`、`forgetting.ts`、`skills.ts`、`judge/judge.ts`。离线规则学习器为 `scripts/learn-preservation.mjs`，开发反馈与冻结规则在 `feedback/`。

## 计费与裁判

主模型和独立裁判都使用 DeepSeek Flash，关闭思考。实验复用现有 `deepseek-judge/register.mjs`，未改动适配器。所有付费试跑和正式运行共享 `benchmarks/design-ablation-v1/budget.json` 的 2 元上限。

主模型最多输出 768 tokens；裁判独立调用、单次超时 30 秒。主模型调用还包括 DSH 的少量辅助请求，因此应以共享计费账本计数，不能只数聊天回答。

## 本轮结果与验证

正式结果：`../benchmarks/design-ablation-v1/results.json`、`实验对比报告.md`。

同一套 8 阶段代码任务使用 6 个隔离目录，全部包含相同历史文档、文件状态材料和 90 项断言。每组最后还检查构建编号、约束原文和未见过的交易编号。隐藏答案与测试预检材料位于模型工作区外；模型可以读取工作区的 test.mjs，结束后逐字核对测试、配置和技能均未被修改。

`acceptance/` 是另一个免费的固定驱动检查：使用本地固定裁判和固定工具调用，阻止外网。它验证 A 的结构化 Git 输出、C/D 在真实会话裁剪后保留字段、B 延迟裁剪，以及组合时的相互影响。它不代表真实模型答题能力，不能与正式费用表混算。

`pilots/config-not-applied/` 保留配置排查期间未启用压缩的试跑，费用计入本轮总预算，但不参与方法比较。`pilots/startup-A/` 保留首次启动超时记录。正式运行会在首次主模型请求前检查独立裁判配置，配置不正确就停止。

## 免费复查

在 `D:\work\DSH-Sieve` 中运行：

```powershell
& tools/node-v24.15.0-win-x64/node.exe --test sieve-lab/tests/lab.test.mjs sieve-lab/tests/judge-cache.test.mjs
& tools/node-v24.15.0-win-x64/node.exe benchmarks/design-ablation-v1/summarize.mjs
```

本轮原始证据禁止覆盖。`run.mjs` 只会跳过已完成的回合，并拒绝自动重跑失败回合；再次开展独立付费实验应新建实验目录、隔离会话和账本，保留原结果。

开发后编译：

```powershell
& tools/node-v24.15.0-win-x64/node.exe sieve-src/node_modules/typescript/lib/tsc.js -p sieve-lab/packages/dsh-sieve/tsconfig.json
```

DSH 的配置 `name` 是目标名称检查，不是替换模块。实验配置先停用原 `sieve` 条目，再插入 `sieve-lab` 条目并传入完整裁判配置；不能直接在原条目上换 `name`。

## LLMLingua-2 本地试验

模型固定为 `microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank`，版本 `5f0c82792b7ea14c6484e015b6a072009496b7f2`。权重约 709 MB，SHA256 在下载脚本中验证。隔离环境在 `../tools/llmlingua-env`，模型缓存在 D 盘的 `../tools/hf-cache`。

`llmlingua-pilot.py` 在 CPU 上以 4 线程试验 0.5、0.7 两档目标保留率。`llmlingua-exact-facts.mjs` 用相同 C/D 规则追加完整字段，`measure-local-combination.py` 测量组合。结果在 `llmlingua-pilot.json` 与 `llmlingua-combination.json`。token 数来自 `cl100k_base`，不是 DeepSeek 的实际计费 token。

这一项已进行离线文本压缩与字段保留检查，尚未接入主模型闭环，不能据此声称节省了多少 DeepSeek 费用或答题能力没有下降。

## 设计来源

- RTK：https://github.com/rtk-ai/rtk
- DCP：https://github.com/Tarquinen/opencode-dynamic-context-pruning
- Context Fold：https://github.com/GitMacke/opencode-context-fold
- ACON：https://arxiv.org/abs/2510.00615 及 https://github.com/microsoft/acon
- Observation Masking：https://arxiv.org/abs/2508.21433
- LLMLingua-2：https://aclanthology.org/2024.findings-acl.57/

这些是设计借鉴，不是完整复现，也不将论文中的节省比例当作本项目的实测结果。

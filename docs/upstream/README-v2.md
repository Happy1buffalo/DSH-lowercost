# 第二轮：上轮组合版 + 本地文档压缩

代码位于 `D:\work\DSH-Sieve\sieve-lab-v2`，从上轮 `sieve-lab` 独立复制。原版 B0 和上轮 ABCD 均保留，默认网页服务没有切换。旧的 `README-experiments.md` 记录第一轮设计；本文件说明新增部分。

## 新增 F 开关

`SIEVE_LAB_FEATURES=A,B,C,D,F` 在上轮四项功能上增加本地 LLMLingua-2 压缩。其目标是减少长篇纯文本说明进入主模型的大小，避免只在后期历史裁剪时才压缩。

仅处理原生 `read` 的完整 `.txt` 文件读取，要求原始工具输出 8,000–45,000 字符、行号连续、没有截断或范围参数。代码文件、其他扩展名、明显的指令文件名和含明显密钥字段的文本保持原样。文件筛选是保守的适用范围限制，不代表能检测任意秘密或所有指令文本。

压缩前抽取 C/D 标签字段及明确义务、否定限制、数值比较的整行原文；带原始行号一起追加。最多保护 24 行、6,000 字符，超过就不压缩。它不保证捕捉任意自然语言事实。主模型明确请求原文、精确引用或原样输出时跳过 F。压缩文本标明可能改变措辞，不能将其新行号当成源文件行号。

原始工具输出完整归档，结果附本地回读路径。CPU 压缩进程超时、异常、无法加载模型、压缩后节省不足 20% 或不足 500 字符时保持原结果。单次本地工作限制 22 秒；父会话取消会中断子进程。

Python 子进程强制使用本地固定模型目录，并拒绝网络连接。每次合格读取启动一次进程，当前约增加十几秒延迟；还没有实现常驻服务和共享压缩缓存。没有 GPU 要求，也没有本地压缩 API 费用。

## 运行配置

- `SIEVE_LAB_FEATURES=A,B,C,D,F`
- `SIEVE_LOCAL_PYTHON=D:/work/DSH-Sieve/tools/llmlingua-env/Scripts/python.exe`
- `SIEVE_LAB_RULES=D:/work/DSH-Sieve/sieve-lab-v2/feedback/rules.json`
- 模型位于 D 盘的 `tools/hf-cache`，使用上轮固定的 `5f0c82792b7ea14c6484e015b6a072009496b7f2` 版本。

完整独立实验配置、共享预算和结果在 `D:\work\DSH-Sieve\benchmarks\local-compression-v2`。本轮四组为 B0、上轮 ABCD、新 ABCDF、追加的 ABCDG。相同的 9 阶段轨迹包含 90 项代码检查与 5 项事实回忆，其中重试限制与备份区域是新增测试值，规则未使用其具体答案。

## 新增 G 开关：可还原的原文模板

F 实测后发现启动 CPU 模型的成本较高，因此追加通用的确定性模板方案 G。它使用与 F 相同的完整 `.txt` 读取限制，按共同长后缀识别至少 8 行重复内容，再提取共同前缀和后缀。每行差异内容与原行号全部保留，独立行原样保留。使用 JSON 转义，保留引号、反斜杠和 Unicode。

生成结果后必须把每一行完整重建，与输入逐字符比较；任何不一致都不应用。归档与精确引用回退规则和 F 一致。它不调用任何模型，不概括或删除事实，但仅适用于重复程度足够高的文档。模板改变了模型读取资料的表达方式，逐字可还原不等于模型理解能力必然无损，仍需实测。

使用 `SIEVE_LAB_FEATURES=A,B,C,D,G`。若同时启用 F/G，先尝试 G；G 不适用时再尝试 F。实际对照没有启用两者组合。

`free-integration-templates-result.json` 验证真实 DSH 会话里的模板能逐字重建源文档。G 在观察到 F 的本轮结果后追加，属于探索性改进；同一轨迹用于分析与评估，不能当作独立的泛化证据。

`free-integration-result.json` 验证原生读取确实经本地模型压缩、保护字段原文和完整归档；`free-integration-verbatim-result.json` 验证原文请求不压缩。免费检查使用固定本地主模型与固定本地裁判，不代表真实答题准确率；真实 DeepSeek 结果在 `runs/`。

编译和免费测试（工作目录为 D:\work\DSH-Sieve）：

```powershell
& tools/node-v24.15.0-win-x64/node.exe sieve-src/node_modules/typescript/lib/tsc.js -p sieve-lab-v2/packages/dsh-sieve/tsconfig.json
& tools/node-v24.15.0-win-x64/node.exe --test sieve-lab-v2/tests/lab.test.mjs sieve-lab-v2/tests/judge-cache.test.mjs sieve-lab-v2/tests/local-compression.test.mjs sieve-lab-v2/tests/line-templates.test.mjs
```

已有实验结果禁止覆盖。重复付费对照应建立新目录、干净会话及受限预算。`run.mjs` 会拒绝自动重跑失败记录。

本地压缩可能改变未被保护的语义；允许回读原文只提供恢复路径，不能保证模型一定会正确恢复。应同时看费用、回读次数、答题检查与延迟，不能仅依据文本缩短比例判定优化成功。

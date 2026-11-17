# 本次上传验证

2026-11-17，在独立目录重新安装依赖并构建：

- `pnpm install --no-frozen-lockfile --ignore-scripts`：成功，为独立裁判增加可移植的 `yaml@2.9.0` 根依赖并更新锁文件。
- `pnpm build`：核心、Web 宿主与浏览器包构建成功。
- `pnpm test`：21 项免费测试全部通过，0 失败。
- `node scripts/smoke-dsh.mjs`：在已有 DSH 0.2.1-rc.5 和原生 `read` 工具中成功加载新目录的 ABCDG；G 实际应用、逐字符还原、完整原文归档均通过。使用固定主流程和模拟裁判、拦截外网，不花 API 费用。
- `pnpm verify:snapshot`：156 份源码、规则及评测时编译文件的指纹一致。

用于发布的包装变化仅涉及启动路径、YAML 依赖、凭据 / 账本路径、可移植测试与文档；`packages/*/src` 与冻结保护规则未修改。20 题真实 DeepSeek 结果来自上轮冻结实验，本次没有额外发起付费测试。

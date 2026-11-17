# 构建与运行验证

2026-11-17，在独立目录重新安装依赖并构建：

- `pnpm install --no-frozen-lockfile --ignore-scripts`：成功，为独立裁判增加可移植的 `yaml@2.9.0` 根依赖并更新锁文件。
- `pnpm build`：核心、Web 宿主与浏览器包构建成功。
- `pnpm test`：21 项免费测试全部通过，0 失败。
- `node scripts/smoke-dsh.mjs`：在已有 DSH 0.2.1-rc.5 和原生 `read` 工具中成功加载插件；行模板压缩、逐字符还原、完整原文归档均通过。使用固定主流程和模拟裁判、拦截外网，不花 API 费用。
- `pnpm verify:snapshot`：156 份源码、规则及评测时编译文件的指纹一致。

源码与冻结保护规则通过指纹检查。20 题真实 DeepSeek 测试的结果与方法保存在 `benchmarks/qa20/`；上述构建和集成检查没有额外发起付费请求。

# 开发与发布

## 项目边界

本目录可以直接作为独立 GitHub 仓库的根目录。无需复制外层 Unreal 工程，不需要初始化嵌套 Git 仓库才能使用工具。仓库不包含用户素材、AE 工程或本机诊断报告。

## 环境与测试

AE 内使用只需要根目录的 `SpriteSheetBuilder.jsx`。Node.js 22 或以上仅用于开发测试，无第三方 npm 依赖，不需要先运行 `npm install`。

```sh
npm test
```

也可直接运行 `node scripts/test.cjs`。四个测试套件覆盖：

- `core.test.cjs`：精确抽帧、范围边界、网格位置、共同裁剪范围和元数据。
- `constraints.test.cjs`：精确图集尺寸、无空格、最大帧数和 UE 等分中心坐标。
- `native-analysis.test.cjs`：随机像素边界对照、低透明度边缘、查询上限和阈值遮罩查询量。
- `workflow.test.cjs`：AE/ScriptUI 模拟、检测调度与取消、参数联动、预览反馈、输出模板验证和队列恢复。

模拟测试不会启动 After Effects，也不能替代真实 UI、渲染和 PNG 验收。GitHub Actions 会在 Windows 和 Linux 上运行这些测试，Windows 任务额外打包并保存构建产物。

## 手动 AE 检查

在 AE 中通过「文件 → 脚本 → 运行脚本文件」运行 `tests/manual/ae-alpha-probe.jsx`。它构造小型透明测试合成，检查 1% 阈值后的边界，显示 PASS / FAIL，并清理临时图层源和合成，不保存工程。不需要任何第三方素材。

发布前还应在目标 AE 版本检查：浮动与停靠面板、窗口缩放与滚动、完整/抽样/单帧检测、取消重试、两种排列方式、精确尺寸 PNG、Straight Alpha、队列恢复，以及导入 UE 后的逐格播放。

代码兼容 ES3 / ExtendScript。修改宿主无关算法时保留 `CORE_BEGIN` 和 `CORE_END` 标记，测试从这里提取实际源码。宿主集成必须使用 AE 的对象与属性能力，不能直接引入 Node API。

## 打包

在 Windows 中运行：

```sh
npm run build
```

或直接通过 PowerShell 执行 `./scripts/package.ps1`。脚本检查 `package.json` 与 JSX 的版本一致，然后生成：

```text
dist/
  SpriteSheetBuilder-1.8.0.zip       # 安装包：JSX 与文档
  AE-SpriteSheet-1.8.0-source.zip    # 完整源码：含测试、脚本及 .github
  SHA256SUMS.txt                    # 两个压缩包的 SHA-256
```

只收集明确指定的源码与文档类型，避免把工程、视频和诊断图片打包。`dist/` 和压缩包不进入 Git 提交。同一版本重复打包会覆盖对应产物；改变版本时可清理旧的 dist 产物。

## 提交到 GitHub

1. 把本目录内容放入独立仓库根目录，包括 `.github`、`.gitignore` 等点开头文件。
2. 运行 `npm test` 和打包命令。
3. 提交源码、文档、测试、脚本和 GitHub 配置。
4. 首次推送后检查 Actions。构建产物保存在该次工作流的 Artifacts 中；不会自动发布 GitHub Release。
5. 发布时可创建 `v1.8.0` 标签和对应 Release，把安装 ZIP 与校验文件作为附件，说明参照 `CHANGELOG.md`。

仓库仅维护当前源码快照；历史版本可由 Git 提交、标签和 Releases 管理，不需要在源码目录复制多个版本。

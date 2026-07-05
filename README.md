<div align="center">
  <img src="/preview.png" alt="界面预览" />
</div>

---

# R2 Explorer

模仿 Windows 文件资源管理器界面，**统一管理 Cloudflare 账号下所有 R2 存储桶**。

## 功能

- 🗂️ **Windows 资源管理器风格 UI** — 双栏布局、树形导航、地址栏、工具栏
- 🗄️ **多桶统一管理** — 左侧栏显示所有 R2 存储桶，点击切换，无需单独绑定
- 📁 **目录浏览** — 支持 prefix + delimiter 实现文件夹式浏览
- ⬆️ **文件上传** — 多文件上传、拖拽上传、Ctrl+V 粘贴本地文件上传
- ⬇️ **文件下载** — 直接下载或浏览器内预览
- 🗑️ **删除** — 单个/批量删除，带确认对话框
- ✏️ **重命名 / 复制 / 移动** — 跨目录跨桶操作，多文件批量
- 📋 **键盘快捷键** — Ctrl+C/X/V 复制/剪切/粘贴，Ctrl+A 全选，Delete 删除，Escape 取消选择
- 🖱️ **框选文件** — 鼠标拖拽框选，Ctrl+点击追加选择
- ↔️ **列宽调节** — 详情视图各列宽度可拖拽调整，宽度持久化到 localStorage
- 🔄 **新建文件夹** — 创建 R2 目录标记对象
- ➕ **新建存储桶** — 直接在界面内创建 R2 存储桶
- 🔒 **密码保护** — 可选登录认证
- 📊 **详情/网格视图切换 + 排序**
- 🖼️ **网格视图缩略图** — 图片文件直接显示缩略图
- 🚀 **Cloudflare Pages 托管** — 零服务器成本

## 最近更新

### 2026-07-05
- 📋 **快捷键支持** — Ctrl+C/X/V 复制/剪切/粘贴，Delete 删除，Ctrl+A 全选，Escape 取消选择
- 📎 **Ctrl+V 上传本地文件** — 从本地资源管理器复制文件后，在页面 Ctrl+V 直接上传
- 🖱️ **框选文件** — 鼠标拖拽矩形框选，Ctrl+点击追加选择
- ↔️ **列宽调节** — 详情视图各列可拖拽调整宽度，持久化到 localStorage
- 🖼️ **网格视图缩略图** — 图片文件在网格视图直接显示缩略图
- ✏️ **多文件批量复制/移动** — 弹窗支持多选源文件，带进度条和文件名列表
- 🔧 **操作菜单合并** — 详情视图操作列合并为 ⋯ 弹出菜单，网格视图移除操作按钮组

### 2026-07-02
- 🖱️ **框选功能修复** — document 级事件监听，选框与鼠标位置完全对齐
- 🗑️ **批量删除优化** — 文件夹递归列出内部对象后逐一删除

### 2026-07-01
- 🔧 **S3 签名修复** — header name 小写化，解决 403 SignatureDoesNotMatch
- ⬆️ **上传修复** — UNSIGNED-PAYLOAD 签名，PUT 透传 S3 错误状态码
- 🔒 **favicon + 退出按钮** — 蓝色 R2 logo favicon，清除 token 返回登录页

## 技术架构

- **前端**: Vue 3 + Vite
- **桶管理**: Cloudflare REST API（列出/创建/删除桶）
- **对象操作**: R2 S3 兼容 API（AWS Signature V4 签名，可操作任意桶）
- **认证**: 简单密码 → Base64 Token

## 部署

### 1. Clone 本仓库到 GitHub

### 2. 创建 R2 API Token

在 Cloudflare Dashboard → R2 → 管理 R2 API 令牌 → 创建令牌：
- **权限**: 对象读写（Admin Read & Write）
- **指定存储桶**: 选择"应用到所有存储桶"
- 创建后会给出 **Access Key ID** 和 **Secret Access Key**

### 3. 获取 Account ID

在 Cloudflare Dashboard 任意页面右侧栏可看到你的 Account ID

### 4. 部署到 Cloudflare Pages

1. Workers & Pages → 创建 → Pages → 连接到 Git
2. 构建设置：
   - 构建命令: `npm run build`
   - 输出目录: `dist`
3. 环境变量（设置为加密变量）：

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `AUTH_PASSWORD` | 访问密码，留空则无需登录 | 可选 |
| `CF_ACCOUNT_ID` | Cloudflare 账户 ID | ✅ |
| `CF_API_TOKEN` | Cloudflare API Token（需要 Account R2 读写权限） | ✅ |
| `R2_ACCESS_KEY_ID` | R2 S3 API Access Key ID | ✅ |
| `R2_SECRET_ACCESS_KEY` | R2 S3 API Secret Access Key | ✅ |

### 5. 创建 Cloudflare API Token

在 My Profile → API Tokens → 创建自定义令牌：
- 权限: Account → R2 Storage → Read & Write
- 这样才能通过 REST API 列出/创建/删除存储桶

### 6. 本地开发

```bash
npm install
npm run dev
```

## 配置说明

| 环境变量 | 用途 | 来源 |
|---------|------|------|
| `CF_ACCOUNT_ID` | 标识你的账户 | Dashboard 右侧栏 |
| `CF_API_TOKEN` | REST API 操作桶级别 | My Profile → API Tokens |
| `R2_ACCESS_KEY_ID` | S3 API 操作对象 | R2 → 管理 API 令牌 |
| `R2_SECRET_ACCESS_KEY` | S3 API 操作对象 | R2 → 管理 API 令牌 |
| `AUTH_PASSWORD` | 网页访问密码 | 自定义，可选 |

## 注意事项

- R2 没有真正的"文件夹"，通过 prefix + delimiter 模拟
- 大文件（>300MB）建议使用其他工具
- S3 兼容 API 通过 Workers 代理，签名在服务端完成，Token 不暴露给前端
- 免费额度：10GB存储/月 + 100万次A类操作 + 1000万次B类操作 + 零出口流量费

## License

MIT

<div align="center">

![ZH Api](/web/public/logo.png)

# ZH Api

**自托管的 AI API 网关与运营控制台**

[下载发行版](https://github.com/zhang520zy-prog/ZHapi/releases) · [部署](#部署) · [与上游的区别](#与上游-new-api-的区别) · [许可与署名](#许可与署名)

</div>

---

## 简介

ZH Api 把 OpenAI、Claude、Gemini、Azure、AWS Bedrock 等数十家上游模型服务汇聚到一套统一的 API 后面，并提供用户、令牌、计费、充值、发票、风控和公告的管理控制台。

ZH Api 基于开源项目 [new-api](https://github.com/QuantumNous/new-api)（QuantumNous 及贡献者，AGPLv3）修改而来。网关的转发、渠道和计费核心沿用上游，本仓库的改动集中在控制台界面和运营功能上，详见[与上游的区别](#与上游-new-api-的区别)。

当前版本：`v1.0.0`，基于上游提交 `789c970`。

## 下载

所有版本都发布在 **[Releases 页面](https://github.com/zhang520zy-prog/ZHapi/releases)**。每个版本包含：

- Linux（amd64 / arm64）、macOS、Windows 的单文件可执行程序，前端已内嵌；
- 对应平台的 `checksums-*.txt` 校验文件；
- 版本说明与上线移交文档。

下载后先核对校验值：

```bash
sha256sum -c checksums-linux.txt --ignore-missing
```

## 部署

### 方式一：Docker Compose（推荐）

仓库内的 `docker-compose.release.yml` 会从源码构建镜像，并启动 ZH Api、PostgreSQL 16 和 Redis。

1. 获取源码（克隆仓库，或下载 Release 附带的源码包）：

   ```bash
   git clone https://github.com/zhang520zy-prog/ZHapi.git
   ```

   ```bash
   cd ZHapi
   ```

2. 准备 `.env`，生成三个互不相同的密钥：

   ```bash
   cp .env.example .env
   ```

   ```bash
   for k in SESSION_SECRET CRYPTO_SECRET DISTRIBUTOR_ACCOUNT_SECRET; do echo "$k=$(openssl rand -hex 32)" >> .env; done
   ```

   | 变量 | 是否必填 | 用途 |
   |---|---|---|
   | `SESSION_SECRET` | 必填 | 登录会话签名。留空时每次重启随机生成，所有人会被登出 |
   | `CRYPTO_SECRET` | 必填 | 令牌缓存键、文件缓存键和任务产物下载链接的 HMAC 签名。丢失只会让缓存重建、已签发链接失效 |
   | `DISTRIBUTOR_ACCOUNT_SECRET` | 建议设置 | 加密分销商提现账号快照。本版本分销功能默认关闭，但一旦产生提现数据，丢失该密钥会导致快照无法解密 |

   三个密钥请离线备份。compose 文件在前两个未设置时会拒绝启动。

3. **修改默认密码。** `docker-compose.release.yml` 中 PostgreSQL 和 Redis 的密码是示例值 `123456`，上线前必须改掉，并同步修改 `SQL_DSN` 和 `REDIS_CONN_STRING`。

4. 启动：

   ```bash
   docker compose -f docker-compose.release.yml --env-file .env up -d --build
   ```

5. 打开 `http://服务器地址:3000`，首次访问会进入初始化向导，创建管理员账号。

数据保存在 `./data`、`./logs` 和名为 `pg_data` 的 Docker 卷中。

### 方式二：直接运行可执行文件

从 Releases 下载对应平台的程序，赋予执行权限后运行。通过环境变量连接数据库和 Redis：

```bash
SQL_DSN='postgresql://用户:密码@127.0.0.1:5432/new-api' \
REDIS_CONN_STRING='redis://:密码@127.0.0.1:6379' \
SESSION_SECRET='...' CRYPTO_SECRET='...' DISTRIBUTOR_ACCOUNT_SECRET='...' \
./new-api-v1.0.0 --port 3000 --log-dir ./logs
```

Linux 上可参考仓库内的 `new-api.service` 配置 systemd 开机自启。

### 上线前检查

- 通过 HTTPS 对外提供服务时，设置 `SESSION_COOKIE_SECURE=true`，并在 `SESSION_COOKIE_TRUSTED_URL` 中列出所有可信的 HTTPS 源（逗号分隔，不支持通配符）。
- 前面有反向代理时，用 `TRUSTED_PROXIES` 写明代理地址；不设置时默认信任回环和内网地址，并在启动日志中告警。
- 其余可选配置（超时、缓存、日志库等）见 [`.env.example`](.env.example) 中的注释。

### 数据库支持

本发行版只在 **PostgreSQL 16** 上做过完整验证，生产环境请使用 PostgreSQL 16。上游支持的 SQLite、MySQL 等其他数据库未经本仓库测试。

## 与上游 new-api 的区别

### 新增功能

| 模块 | 内容 |
|---|---|
| 风控 | 敏感词分类词库、请求与输出内容检测、阶梯式限制与账号停用；管理端提供事件、词库、设置三个页签，用户端可查看自己的风控事件 |
| 用户协议 | 协议版本化；版本更新后要求用户重新确认，可在系统设置中开关 |
| 支付与账务 | 支付事件留证、手续费快照、回调金额校验；钱包页签化，充值和订阅购买改为服务端报价 |
| 账单 | 统一的账单明细页（合并接口 `/api/user/billing/self`）；订阅套餐统一按人民币计价 |
| 发票 | 发票申请，按可开票额度限制 |
| 邀请返利 | 邀请与返利后端及控制台页面（分销商前端已移除，分销默认关闭） |
| 通知与公告 | 站内通知；公告支持弹窗、过期时间和按账号记录已读 |
| 登录注册 | Google OAuth 登录；注册时展示风险声明，需阅读并勾选 |

### 界面改动

- 全新控制台外观：胶囊式顶栏、分组侧栏、内置客服入口，深浅两套主题，首屏前确定主题避免白屏闪烁。
- 首页改为滚动驱动的莫比乌斯环设计，并提供 RelayDesk 桌面端介绍和下载引导。
- 仪表盘合并为单页，新增额度可用时长提示；个人资料与安全设置合并为一页。
- 模型广场支持按品牌和类型筛选（筛选状态写入 URL），卡片显示 24 小时可用率。
- 新增公开的 `/docs` 接入指南页面。
- 界面语言维护简体中文、繁体中文和英文。

### 关闭或隐藏的功能

| 功能 | 状态 |
|---|---|
| 试用场（Playground）与聊天 | 前端入口已移除，后端 `/pg` 路由已注销 |
| io.net 部署 | 入口隐藏 |
| 兑换码、签到 | 入口默认隐藏 |
| 订阅购买中的 Stripe 通道 | 已移除 |
| 分销商前端 | 已移除，后端功能默认关闭 |

### 发布配置

- `docker-compose.release.yml`：PostgreSQL 16 + Redis 8，缺少必需密钥时拒绝启动。
- `.dockerignore` 排除 `.env`、数据库文件、`data/` 和 `logs/`，避免密钥和数据进入镜像。

上游的完整功能说明、接口文档和多语言 README 仍保留在仓库中，见 [README.en.md](README.en.md)、[README.zh_CN.md](README.zh_CN.md) 及 [new-api 官方文档](https://docs.newapi.ai/)。上游文档中的部署命令和镜像地址指向上游版本，不适用于 ZH Api。

## 从源码构建

需要 Go 1.25+ 和 Bun。

```bash
cd web && bun install && bun run build && cd ..
```

```bash
go build -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'" -o new-api
```

## 许可与署名

ZH Api 是 [new-api](https://github.com/QuantumNous/new-api) 的修改版本。new-api 版权归 QuantumNous 及贡献者所有。

本项目沿用 [GNU Affero General Public License v3.0](LICENSE)。根据 AGPLv3 第 7 条附加条款（见 [NOTICE](NOTICE)），界面中保留以下署名及原项目链接：

> Frontend design and development by New API contributors.

如果你通过网络向用户提供本程序的服务，AGPLv3 要求你向这些用户提供对应的源代码。第三方依赖的许可见 [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md)。

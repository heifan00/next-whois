# Cloudflare 部署

网站页面和 `/api/*` 一起运行在 Cloudflare Workers，OpenNext 负责适配 Next.js Pages Router。Worker 名称为 `next-whois-ui`。部署时无需启动 PM2，也无需连接旧服务器的 Redis。

## 安装和检查

使用 Node.js 22 或更高版本，以及 package.json 中指定的 pnpm 9.15.9：

```sh
pnpm install --frozen-lockfile
pnpm test:pricing
pnpm test:middleware
node --test scripts/rdap-http-client.test.mjs
pnpm exec tsc --noEmit
pnpm build:cloudflare
```

Next.js 已升级到 15.5.27，以满足 OpenNext Cloudflare 1.20.10 的版本要求。普通 `pnpm build`、`pnpm start` 仍可用于服务器部署。

Windows 构建会使用进程内的符号链接兼容处理：没有符号链接权限时，目录使用 junction，文件复制到构建目录；pnpm 绝对目录链接会指向各阶段复制的依赖，使 OpenNext 的补丁作用于最终副本。该处理仅在构建进程中生效，不需要管理员权限，Linux 构建保持原生行为。可执行 `pnpm test:cloudflare:build` 检查此兼容处理。

## 本地 Workers 预览

```sh
pnpm preview:cloudflare
```

预览默认监听 `http://127.0.0.1:8787`。另一个终端运行：

```sh
pnpm test:cloudflare
```

上线检查会读取真实 RDAP、WHOIS 和价格接口，覆盖中英文页面、静态文件、注册域名、未注册域名、IP、ASN、CIDR 和 ccTLD。上游服务异常可能使检查失败。

## 发布

```sh
pnpm exec wrangler login
pnpm deploy:cloudflare
```

已有 Wrangler 授权时无需重新登录。公开地址为 `https://next-whois-ui.heifan.workers.dev`。发布后可将 `LOOKUP_BASE_URL` 设置为该地址或 `https://94.cx`，再执行 `pnpm test:cloudflare`。

`wrangler.jsonc` 中的兼容日期启用了 Workers 的 Node HTTP/TCP 支持。`RDAP_DNS_FAMILY=auto` 让 Workers 管理出站连接；WHOIS 通过 TCP 43 端口访问公开注册局。某些注册局可能限制 Cloudflare 出站 IP，需要根据具体查询检查日志。

## 94.cx 路由和回退

94.cx 和 www.94.cx 的 DNS 必须保持 Cloudflare 代理（橙云）。Worker 路由会直接处理对应主机的全部网站请求，应用不会请求旧服务器。

保留原 DNS 记录可方便回退：在 Cloudflare 的 Workers & Pages → next-whois-ui → Settings → Domains & Routes 删除本项目添加的两个路由，即可恢复到原服务器。回退前需确保原服务器进程正在运行。

确认 94.cx 上的页面、静态文件、查询 API 正常后，可以停止旧服务器的本项目 PM2 进程，释放资源；不要停止其他项目的进程。

如果旧服务器使用仓库自带的 PM2 配置，进程名默认为 `next-whois`，可先用 `pm2 describe next-whois` 确认应用路径，再执行 `pm2 stop next-whois` 和 `pm2 save`。

2026-10-10 已完成 Workers 发布和上述两个路由的接入。本地 Workers、公网 Workers 和 `94.cx` 的页面/API 检查均通过，`www.94.cx` 的页面版本与 Worker 一致，价格接口返回注册价 3.4 USD / 22.76 CNY（报价会随上游变化）。旧服务器进程未在本次操作中停止。

## 后续更新

目前使用 Wrangler 发布。Git 推送本身不会触发 Cloudflare 部署；代码更新后执行 `pnpm deploy:cloudflare`。若在控制台连接 GitHub 仓库，构建命令设置为 `pnpm build:cloudflare`，部署命令设置为 `pnpm exec opennextjs-cloudflare deploy`，并选择实际使用的生产分支。

Moz 指标如需启用，可使用 `pnpm exec wrangler secret put MOZ_ACCESS_ID` 和 `pnpm exec wrangler secret put MOZ_SECRET_KEY`。默认保持未配置状态。不要提交 `.dev.vars`、Wrangler 授权或任何密钥。

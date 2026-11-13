# 94.cx API 接入

稳定文档入口：`/api-docs`（`/docs` 为别名）。机器可读描述：`/openapi.json`，OpenAPI 3.1。

新调用方使用 `GET /api/v2/lookup?query=example.com`，需要原文时加 `includeRaw=true`。完整参数、字段、错误码及域名/IP/ASN 示例见 OpenAPI 和文档页面。

两个版本的查询响应（包括错误响应）均带 `X-App-Version`，值为构建时 Git 提交号的前 12 位，便于确认命中的部署。无 Git 信息且未指定构建变量 `APP_VERSION` 时显示 `development`。

## 兼容约定

- `/api/lookup` 保留旧字段和默认原文，并新增 `outcome`、`queryType`、归一化查询及缓存元数据。旧版 `time` 单位仍为秒。
- v2 按类型返回 `data`，缺失标量为 `null`，列表为 `[]`，日期为 UTC ISO 8601，默认不返回原文。
- `status: true` 仅用于有结果的 `ok` / `partial`；调用方应使用 `outcome` 区分完整性。错误使用稳定错误码。
- `not_found` 仅说明没有匹配的注册数据。旧版 `available` 是兼容字段，不能作为可注册保证。
- 原文总上限 64 KiB。v2 的完整 RDAP 是 JSON 对象；超限时只给 `rdapPreview` 并设置 `truncated`。旧版设置 `rawTruncated`。

## 已有项目是否迁移

已正常使用 `/api/lookup` 的项目不必立即切换地址。v1 继续提供旧的成功结果字段，本次错误语义、ASN 和 CIDR 修复也会应用于 v1。旧调用方应检查 400 / 429 / 502 / 504 的处理，不要依赖非法输入仍返回成功、把 `available` 当作保证，或假定原文永不截断。URL 输入现在会拒绝，应先提取域名/IP；空值、重复 query 和格式错误也会明确报错。

新项目、AI 工具或需要 IP/ASN 规范数据的项目优先用 v2。迁移需要调整字段读取，不能只替换 URL：

| v1 | v2 |
| --- | --- |
| `status` / `available` | `outcome`，只有 `ok` 表示完整有效结果 |
| `result` | 按 `queryType` 解释的 `data` |
| `error` 字符串 | `error.code` / `error.message` |
| `time`（秒） | `timing.totalMs`（毫秒） |
| `cached` | `cache.hit`，附存储/过期时间 |
| 默认包含原文 | 默认省略，需要 `includeRaw=true` |
| `Unknown` / `N/A` / `-1` 等 | 缺失标量 `null`，空列表 `[]` |

两个版本均不要求 API Key，也没有开放浏览器跨域读取；后端和命令行可以调用。CORS 不是服务端访问权限控制，部署网关的策略另计。

## 运行约定

- Redis 由 `REDIS_HOST` 配置。`REDIS_CACHE_TTL` 为正时启用，默认 3600 秒；写入成功才提供 `storedAt` / `expiresAt`。失败、无记录及部分结果均不缓存。`queriedAt` 是原查询结果时间，`timing.totalMs` 是本次调用耗时。
- 价格随注册结果缓存，价格来源时间单独返回。未注明时区的上游价格时间保留为 `sourceUpdatedAtText`，`updatedAt=null`。
- 当前代码没有 API Key、合作方配额或并发限制；不代表部署网关没有限制。有上游重试时间时返回 `Retry-After`。
- RIR RDAP 从 IANA bootstrap 选择负责注册局；转介最多 3 次，共享 12 秒预算。RIR WHOIS 从 IANA 跟随到允许的 RIR，最多 3 次转介，共享 10 秒预算，单次连接最多 5 秒。循环、超限、非允许主机或端口会中止并保留已有部分记录。
- 上游 RDAP 下载限制为 2 MiB，RIR WHOIS 为 1 MiB。RDAP 读取采用绝对超时，避免持续小流量无限延长请求。

## 数据解释

- 注册国家不等同于实际地理位置；本服务没有地理定位数据源。
- RDAP 描述中提及的 ASN 与 WHOIS origin AS 单独返回；没有接入 BGP，`bgpConfirmedASNs=[]`。
- 注册联系人、技术联系人、滥用联系人按 RDAP roles 区分，包括嵌套实体；过滤全空联系人。ARIN WHOIS 按资源、组织和联系人记录分别解析，并合并同一角色下重复的联系人 handle。
- ASN/IP 的注册日期、更新时间和 handle 取自查询对象本身。组织记录的日期保留在原文中，不会替代 ASN/IP 日期；对象日期未提供时返回 null。
- 价格是后缀通用比价，不能用于判断具体域名是否能购买，也不等于当前注册商续费价。`amountCny` 对应 `*_cny`，`effectiveAmountCny` 对应 `*_eff_cny`；换算汇率及折后公式未提供时为 null。计费年限、优惠码内容和新用户条件未核实时保持未知。
- `premiumChecked=false`，v2 `isPremium=null`；旧 `isPremium` 启发式字段不代表已核实溢价。

## 边界

新增 RIR WHOIS 转介限制协议、43 端口和服务器名单；RIR RDAP 限制 HTTPS 与官方主机。旧域名 WHOIS 库的跟随行为仍沿用原设置，本次不宣称完成全面 SSRF 审计。离线测试验证 IPv6、CIDR、IDN 规则，不保证每个上游均支持这些查询。

依据：[RFC 9082](https://www.rfc-editor.org/rfc/rfc9082.html)、[RFC 9083](https://www.rfc-editor.org/rfc/rfc9083.html)、[IANA RDAP bootstrap](https://data.iana.org/rdap/)。

import Head from "next/head";
import Link from "next/link";

const outcomes = [
  ["ok", "200", "获得有效注册对象。"],
  [
    "partial",
    "200",
    "只获得部分记录，检查 warnings；不应据此推断运营组织或可注册状态。",
  ],
  ["invalid_input", "400 / 405", "输入或参数不合法；方法不支持时为 405。"],
  ["not_found", "200", "上游明确无匹配记录，不代表域名一定可注册。"],
  ["rate_limited", "429", "上游限流；有明确等待时间时返回 Retry-After。"],
  [
    "upstream_error",
    "502 / 504",
    "上游错误、无效响应或超时；504 专门表示超时。",
  ],
];

export default function ApiDocs() {
  return (
    <main className="w-full h-full overflow-auto px-6 py-10">
      <Head>
        <title>94.cx API 文档</title>
        <meta
          name="description"
          content="94.cx 域名、IP、ASN 与 CIDR 查询 API：响应结构、错误码、缓存和价格说明。"
        />
      </Head>
      <article className="max-w-4xl mx-auto space-y-8 leading-7">
        <header>
          <Link className="underline" href="/">
            返回查询
          </Link>
          <h1 className="text-3xl font-bold mt-4">94.cx API 文档</h1>
          <p className="mt-3">
            新接入使用 <code>/api/v2/lookup</code>。
            <a className="underline" href="/openapi.json">
              下载 OpenAPI 3.1 描述
            </a>
            ，可导入 API 客户端或 AI 工具。
          </p>
        </header>
        <section>
          <h2 className="text-xl font-semibold">请求</h2>
          <pre className="overflow-x-auto rounded border p-4 mt-3 text-sm">{`GET /api/v2/lookup?query=example.com
GET /api/v2/lookup?query=1.1.1.1
GET /api/v2/lookup?query=AS13335
GET /api/v2/lookup?query=2001%3Adb8%3A%3A1
GET /api/v2/lookup?query=1.1.1.0%2F24&includeRaw=true`}</pre>
          <p className="mt-3">
            <code>query</code> 必填且只能出现一次，最长 512
            字符。支持域名、中文域名/Punycode、IPv4、IPv6、ASN（1–4294967295，可省略
            AS）和 CIDR。去除首尾空白，域名转小写及
            ASCII，子域名按可注册域名查询，CIDR 清除主机位。不接收
            URL、端口、IPv6 zone ID 和带空白的查询。
          </p>
          <p>
            <code>includeRaw</code> 仅接受 true / false，v2 默认
            false。原文总上限 64 KiB；截断时 <code>raw.truncated=true</code>
            ，完整 RDAP 是 JSON 对象，截断内容在 <code>raw.rdapPreview</code>。
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">结果状态</h2>
          <div className="overflow-x-auto">
            <table className="w-full mt-3 text-left">
              <thead>
                <tr>
                  <th className="p-2">outcome</th>
                  <th className="p-2">HTTP</th>
                  <th className="p-2">含义</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map(([outcome, http, text]) => (
                  <tr className="border-t" key={outcome}>
                    <td className="p-2 font-mono">{outcome}</td>
                    <td className="p-2 whitespace-nowrap">{http}</td>
                    <td className="p-2">{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            错误提供 <code>error.code</code> 和 <code>error.message</code>
            。稳定错误码：INVALID_QUERY、INVALID_PARAMETER、METHOD_NOT_ALLOWED、NO_MATCH、UPSTREAM_RATE_LIMITED、UPSTREAM_TIMEOUT、UPSTREAM_ERROR、INCOMPLETE_RDAP_OBJECT。不要根据原文或
            HTTP 200 单独判断查询成功。
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">结构与字段含义</h2>
          <p>
            公共字段：query、normalizedQuery、queryType、outcome、source、data、error、warnings、queriedAt、cache、timing、pricing。缺失标量为
            null，空列表为 []，日期为 ISO 8601 UTC；无法确定时区的时间保持
            null。
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>
              domain：注册商、创建/到期时间、名称服务器、DNSSEC、域名年龄（整年）、剩余天数及
              Moz 指标。
            </li>
            <li>
              ipv4 / ipv6 /
              cidr：cidrs、startAddress、endAddress、netRange、netName、注册组织及联系人。
            </li>
            <li>
              asn：asNumber、asName、registeredOrganization、allocationRegistry。分配机构与注册组织分别表示。
            </li>
            <li>
              contacts.registrant / technical / abuse 按 RDAP
              角色区分。registeredCountry
              是注册记录的国家，不是服务器所在地；geolocation 当前为 null。
            </li>
            <li>
              routing.mentionedASNs 来自 RDAP remarks，whoisOriginAS 来自
              WHOIS；当前没有 BGP 数据源，bgpConfirmedASNs 为 []。
            </li>
          </ul>
        </section>
        <section>
          <h2 className="text-xl font-semibold">价格</h2>
          <p>
            pricing.scope=tld 表示{" "}
            <a className="underline" href="https://www.nazhumi.com">
              哪煮米
            </a>{" "}
            提供的后缀通用比价，并非具体域名的可购买报价，也不代表当前注册商的续费价格。offers
            保留注册、续费、转入的原币种价格和跳转来源。
          </p>
          <p>
            amountCny 对应上游的 *_cny；effectiveAmountCny 对应
            *_eff_cny，未提供则为
            null。上游未给出汇率或折后计算公式时不自行推算。billingPeriodYears、优惠码内容、新用户限制及未明确的条件保持未知。codeRequired
            仅反映上游标记，restrictions=[] 不代表没有限制。
          </p>
          <p>
            premiumChecked=false、isPremium=null，不据通用价格判断域名溢价属性。updatedAt
            仅在来源时间包含时区时返回；sourceUpdatedAtText
            保留上游原始时间，不能当作 UTC。
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">缓存、耗时和调用限制</h2>
          <p>
            queriedAt
            是取得本次注册结果的时间；缓存命中时保留原查询时间。cache.enabled
            表示已配置 Redis 且 TTL 为正，hit 表示本次是否命中，storedAt /
            expiresAt 表示实际成功写入的时间和过期时间。未配置 Redis
            时缓存关闭；默认 REDIS_CACHE_TTL=3600 秒。仅缓存
            ok，键使用类型和归一化查询；价格目前随结果一起缓存。
          </p>
          <p>
            timing.totalMs 为本次调用耗时（毫秒）；旧版 time 为秒。网络 RDAP
            查询与转介共用 12 秒预算，WHOIS 转介共用 10
            秒预算，最多三次转介，并检测循环。原文上限与上游下载上限分开控制。
          </p>
          <p>
            本应用目前没有内置 API
            Key、合作方配额或并发限制。部署层或上游可能限流；本接口转发可确定的
            Retry-After。公开接口不承诺固定调用配额，批量接入应自行控制并发、缓存成功结果，并对临时失败做退避。
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">旧版兼容与边界</h2>
          <p>
            <code>/api/lookup</code> 保留 status、result、available、time
            和原文默认行为，并增加 outcome 等字段。status 在 ok / partial 时为
            true；无效输入不再成功。旧版 available
            仅是无匹配记录的兼容标记，不保证可注册；新调用方使用
            outcome。旧版支持 includeRaw=false。
          </p>
          <p>
            RIR 转介限制为支持的官方服务器：RDAP 仅 HTTPS，WHOIS 仅端口
            43；拒绝任意转介主机。旧域名 WHOIS
            库的可配置跟随逻辑仍沿用原有设置，尚未作为全面 SSRF
            审计完成项。中文域名、IPv6、CIDR
            有离线回归覆盖，不代表所有注册局都支持所有查询。
          </p>
          <p>
            字段依据：
            <a
              className="underline"
              href="https://www.rfc-editor.org/rfc/rfc9083.html"
            >
              RDAP 响应标准 RFC 9083
            </a>
            、
            <a
              className="underline"
              href="https://www.rfc-editor.org/rfc/rfc9082.html"
            >
              查询格式 RFC 9082
            </a>
            。权威注册信息仍以上游原始记录为准。
          </p>
        </section>
      </article>
    </main>
  );
}

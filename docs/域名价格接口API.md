> 2026-10-10 更新：注册排序参数及价格字段已从 `new` 改为 `register`。以下结构以[官方 API 文档](https://www.nazhumi.com/api/docs)为准。
>
> 比价请求示例：`https://www.nazhumi.com/api/v1?domain=cc&order=register&limit=5&page=1`。成功响应为 `{"code":100,"data":{...}}`，HTTP 200 仍需检查业务码。
>
> 标准价同时返回 `register_cny`、`renew_cny`、`transfer_cny`，表示对应价格的人民币参考值（number 或 `"n/a"`）。币种切换直接使用这些字段，无需再查询独立汇率接口。
>
> 列表按包含优惠的有效人民币价排序，但价格字段返回标准价；优惠详情需要单独查询。比价页面路径为 `/domain/cc/register`，使用后缀而非完整域名。

#### **1. 指定域名后缀，获取最便宜的注册商列表**


| 基本   |                                |
| ---- | ------------------------------ |
| 接口地址 | https://www.nazhumi.com/api/v1 |
| 请求方式 | GET                            |
| 返回格式 | JSON                           |



| 输入     |        |     |                                                                                  |
| ------ | ------ | --- | -------------------------------------------------------------------------------- |
| 名称     | 类型     | 必填  | 描述                                                                               |
| domain | string | 是   | 域名后缀（`com`或`.com`）                                                               |
| order  | string | 否   | 排序类型（`register`或`renew`或`transfer`） `register`：注册价格排序（默认） `renew`：续费价格排序 `transfer`：转入价格排序 |



| 输出            |         |                                                    |
| ------------- | ------- | -------------------------------------------------- |
| 名称            | 类型      | 描述                                                 |
| domain        | string  | 域名后缀                                               |
| order         | string  | 排序类型 `register`：注册价格排序 `renew`：续费价格排序 `transfer`：转入价格排序 |
| count         | number  | 当前页输出数量；用 `limit` 限制条数                                    |
| registrar     | string  | 注册商代码                                              |
| registrarname | string  | 注册商名称                                              |
| registrarweb  | string  | 注册商网址                                              |
| register      | number  | 注册价格（`n/a`为不适用）                                    |
| renew         | number  | 续费价格（`n/a`为不适用）                                    |
| transfer      | number  | 转入价格（`n/a`为不适用）                                    |
| currency      | string  | 货币代码                                               |
| currencyname  | string  | 货币单位名称                                             |
| currencytype  | string  | 货币种类                                               |
| promocode     | object  | 各类型优惠标记：`register` / `renew` / `transfer` |
| updatedtime   | string  | 数据更新时间                                             |


#### **2. 指定注册商，获取最便宜的域名后缀列表**


| 基本   |                                |
| ---- | ------------------------------ |
| 接口地址 | https://www.nazhumi.com/api/v1 |
| 请求方式 | GET                            |
| 返回格式 | JSON                           |



| 输入        |        |     |                                                                                  |
| --------- | ------ | --- | -------------------------------------------------------------------------------- |
| 名称        | 类型     | 必填  | 描述                                                                               |
| registrar | string | 是   | 注册商代码（参考本页`注册商代码表`）                                                              |
| order     | string | 否   | 排序类型（`register`或`renew`或`transfer`） `register`：注册价格排序（默认） `renew`：续费价格排序 `transfer`：转入价格排序 |



| 输出            |         |                                                    |
| ------------- | ------- | -------------------------------------------------- |
| 名称            | 类型      | 描述                                                 |
| registrar     | string  | 注册商代码                                              |
| registrarname | string  | 注册商名称                                              |
| registrarweb  | string  | 注册商网址                                              |
| order         | string  | 排序类型 `register`：注册价格排序 `renew`：续费价格排序 `transfer`：转入价格排序 |
| count         | number  | 当前页输出数量；用 `limit` 限制条数                                    |
| domain        | string  | 域名后缀                                               |
| register      | number  | 注册价格（`n/a`为不适用）                                    |
| renew         | number  | 续费价格（`n/a`为不适用）                                    |
| transfer      | number  | 转入价格（`n/a`为不适用）                                    |
| currency      | string  | 货币代码                                               |
| currencyname  | string  | 货币单位名称                                             |
| currencytype  | string  | 货币种类                                               |
| promocode     | object  | 各类型优惠标记：`register` / `renew` / `transfer` |
| updatedtime   | string  | 数据更新时间                                             |


#### **3. 指定注册商和域名后缀，获取价格信息**


| 基本   |                                |
| ---- | ------------------------------ |
| 接口地址 | https://www.nazhumi.com/api/v1 |
| 请求方式 | GET                            |
| 返回格式 | JSON                           |



| 输入        |        |     |                     |
| --------- | ------ | --- | ------------------- |
| 名称        | 类型     | 必填  | 描述                  |
| registrar | string | 是   | 注册商代码（参考本页`注册商代码表`） |
| domain    | string | 是   | 域名后缀（`com`或`.com`）  |



| 输出            |         |                 |
| ------------- | ------- | --------------- |
| 名称            | 类型      | 描述              |
| registrar     | string  | 注册商代码           |
| registrarname | string  | 注册商名称           |
| registrarweb  | string  | 注册商网址           |
| domain        | string  | 域名后缀            |
| register      | number  | 注册价格（`n/a`为不适用） |
| renew         | number  | 续费价格（`n/a`为不适用） |
| transfer      | number  | 转入价格（`n/a`为不适用） |
| currency      | string  | 货币代码            |
| currencyname  | string  | 货币单位名称          |
| currencytype  | string  | 货币种类            |
| promocode     | object  | 各类型优惠标记：`register` / `renew` / `transfer` |
| updatedtime   | string  | 数据更新时间          |


#### **4. 指定注册商、域名后缀和优惠类型，获取优惠信息**


| 基本   |                                |
| ---- | ------------------------------ |
| 接口地址 | https://www.nazhumi.com/api/v1 |
| 请求方式 | GET                            |
| 返回格式 | JSON                           |



| 输入        |        |     |                                                                            |
| --------- | ------ | --- | -------------------------------------------------------------------------- |
| 名称        | 类型     | 必填  | 描述                                                                         |
| registrar | string | 是   | 注册商代码（参考本页`注册商代码表`）                                                        |
| domain    | string | 是   | 域名后缀（`com`或`.com`）                                                         |
| order     | string | 是   | 优惠类型（`register`或`renew`或`transfer`） `register`：注册优惠（默认） `renew`：续费优惠 `transfer`：转入优惠 |



| 输出            |         |                                              |
| ------------- | ------- | -------------------------------------------- |
| 名称            | 类型      | 描述                                           |
| registrar     | string  | 注册商代码                                        |
| registrarname | string  | 注册商名称                                        |
| registrarweb  | string  | 注册商网址                                        |
| domain        | string  | 域名后缀                                         |
| order         | string  | 优惠类型 `register`：注册优惠 `renew`：续费优惠 `transfer`：转入优惠 |
| promocode     | boolean | 是否有优惠信息                                      |
| code          | string  | 优惠代码                                         |
| price         | number  | 优惠后价格                                        |
| currency      | string  | 货币代码                                         |
| currencyname  | string  | 货币单位名称                                       |
| currencytype  | string  | 货币种类                                         |
| instruction   | string  | 优惠说明                                         |
| endtime       | string  | 优惠截止时间                                       |
| creationtime  | string  | 数据创建时间                                       |


#### **附：注册商代码表**


| 注册商                  | 代码           | 注册商官网                              |
| -------------------- | ------------ | ---------------------------------- |
| 阿里云                  | aliyun       | https://wanwang.aliyun.com/        |
| 爱名网                  | 22cn         | https://www.22.cn/                 |
| 百度智能云                | baidu        | https://cloud.baidu.com/           |
| 华为云                  | huawei       | https://www.huaweicloud.com/       |
| 火山引擎                 | volcengine   | https://www.volcengine.com/        |
| 聚名网                  | juming       | https://www.juming.com/            |
| 趣域网                  | quyu         | https://www.quyu.net/              |
| 腾讯云                  | tencent      | https://cloud.tencent.com/         |
| 西部数码                 | west         | https://www.west.cn/               |
| 西部数码国际               | 363hk        | https://www.363.hk/                |
| 新网                   | xinnet       | https://www.xinnet.com/            |
| 易名                   | ename        | https://www.ename.com/             |
| 中资源                  | zzy          | https://www.zzy.cn/                |
| 101domain            | 101domain    | https://www.101domain.com/         |
| 123 Reg不活跃           | 123reg       | https://www.123-reg.co.uk/         |
| Afriregister         | afriregister | https://www.afriregister.com/      |
| Alibaba Cloud        | alibaba      | https://alibabacloud.com/          |
| ALLDomains           | alldomains   | https://alldomains.hosting/        |
| CanSpace             | canspace     | https://www.canspace.ca/           |
| Cloudflare           | cloudflare   | https://www.cloudflare.com/        |
| Cosmotown            | cosmotown    | https://www.cosmotown.com/         |
| Crazy Domains不活跃     | crazydomains | https://www.crazydomains.com.au/   |
| DDD.COM              | ddd          | https://www.ddd.com/               |
| Directnic            | directnic    | https://directnic.com/             |
| Domain.com           | domaincom    | https://www.domain.com/            |
| domgate              | domgate      | https://domgate.com/               |
| dotology             | dotology     | https://dotology.com/              |
| DreamHost            | dreamhost    | https://www.dreamhost.com/         |
| Dynadot              | dynadot      | https://www.dynadot.com/           |
| EnCirca              | encirca      | https://www.encirca.com/           |
| Enom                 | enom         | https://www.enom.com/              |
| Epik                 | epik         | https://www.epik.com/              |
| gandi.net            | gandi        | https://www.gandi.net/             |
| Globalhost           | globalhost   | https://www.global.ba/             |
| GNAME                | gname        | https://www.gname.com/             |
| GoDaddy              | godaddy      | https://www.godaddy.com/           |
| Google Domains不活跃    | google       | https://domains.google/            |
| Google Domains TR不活跃 | googletr     | https://domains.google/intl/tr_tr/ |
| HEXONET              | hexonet      | https://hexonet.net/               |
| hover                | hover        | https://www.hover.com/             |
| InnovaHost           | innovahost   | https://innovahost.net/            |
| internet.bs          | internetbs   | https://internetbs.net/            |
| INWX                 | inwx         | https://www.inwx.com/              |
| Marcaria             | marcaria     | https://www.marcaria.com/          |
| MrDomain             | mrdomain     | https://www.mrdomain.com/          |
| Name.com             | namecom      | https://www.name.com/              |
| namecheap            | namecheap    | https://www.namecheap.com/         |
| NameSilo             | namesilo     | https://www.namesilo.com/          |
| netim                | netim        | https://www.netim.com/             |
| one.com              | onecom       | https://www.one.com/               |
| OnlyDomains          | onlydomains  | https://www.onlydomains.com/       |
| OpenSRS              | opensrs      | https://opensrs.com/               |
| OVHcloud             | ovh          | https://www.ovhcloud.com/          |
| Pananames            | pananames    | https://pananames.com/             |
| porkbun              | porkbun      | https://porkbun.com/               |
| Rebel                | rebel        | https://www.rebel.com/             |
| REG.COM不活跃           | regcom       | https://www.reg.com/               |
| REG.RU不活跃            | regru        | https://www.reg.ru/                |
| Regery               | regery       | https://regery.com/                |
| regtons              | regtons      | https://regtons.com/               |
| Sav                  | sav          | https://www.sav.com/               |
| Spaceship            | spaceship    | https://www.spaceship.com/         |
| TFhost               | tfhost       | https://tfhost.ng/                 |
| Truehost             | truehost     | https://truehost.com/              |
| Uniregistry不活跃       | uniregistry  | https://uniregistry.com/           |
| west.xyz             | westxyz      | https://www.west.xyz/              |
| WordPress.com        | wordpress    | https://wordpress.com/             |
| Zone                 | zone         | https://www.zone.ee/               |


注：标记为 不活跃 的注册商，其价格数据及优惠信息将不再更新，搜索结果也会被屏蔽。
// node scripts/gen-corpus.ts [--check]: writes the synthetic corpus, 100 blocks like the diagrams an assistant draws in
// its replies, to fixtures/corpus/corpus-001.mmd … corpus-100.mmd under the working directory. 92 are flowcharts from
// five templates (a process flow, a decision with yes and no branches, a retry loop, a pipeline, and a service
// architecture with nested subgraphs) and 8 are sequence diagrams. A mulberry32 PRNG with a fixed seed picks each
// variation, and quotas hold the feature mix at or above the owner's shares, so the output is byte-stable. --check
// writes nothing: it names each file that regenerating would change, and exits 1 when there is any.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isMain } from './lib/is-main.ts'

const DIR = 'fixtures/corpus'
const SEED = 20261028
const USAGE = 'usage: node scripts/gen-corpus.ts [--check]'

// mulberry32: a float in [0, 1) per call, the same sequence for the same seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let rand = mulberry32(SEED)

// An integer in [lo, hi]; an element of xs; true with probability p.
const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1))
function pick<T>(xs: readonly T[]): T { return xs[int(0, xs.length - 1)]! }
const chance = (p: number): boolean => rand() < p
// xs, shuffled in place.
function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) { const j = int(0, i); [xs[i], xs[j]] = [xs[j]!, xs[i]!] }
  return xs
}
// n flags in a random order, k of them true: a quota.
const quota = (n: number, k: number): boolean[] => shuffle(Array.from({ length: n }, (_, i) => i < k))
// k of xs in their order, always with the first and the last (k ≥ 2).
function keep<T>(xs: readonly T[], k: number): T[] {
  const mid = shuffle(xs.slice(1, -1).map((_, i) => i + 1)).slice(0, k - 2).sort((a, b) => a - b)
  return [xs[0]!, ...mid.map(i => xs[i]!), xs[xs.length - 1]!]
}

// One block's style: its language, whether its labels are quoted, whether a label shows its detail after <br/>, whether
// a plain arrow's label goes between dashes, its indent, and the ids drawn so far: a node's shape and label go on its
// first mention only.
type Block = { zh: boolean; quoted: boolean; br: boolean; dash: boolean; pad: string; drawn: Set<string> }

// A label is 'English|中文|detail|细节': 中文 defaults to the English, 细节 to the detail. Its text in b's language, with
// the detail after <br/> when b shows details.
function text(b: Block, label: string): string {
  const [en = '', zh = en, detail = '', detailZh = detail] = label.split('|')
  const more = b.zh ? detailZh : detail
  return (b.zh ? zh : en) + (b.br && more ? `<br/>${more}` : '')
}

// Each shape's brackets.
const SHAPES = {
  rect: ['[', ']'], round: ['(', ')'], stadium: ['([', '])'], sub: ['[[', ']]'], db: ['[(', ')]'],
  circle: ['((', '))'], diamond: ['{', '}'], hexagon: ['{{', '}}'], io: ['[/', '/]'],
} as const
type Shape = keyof typeof SHAPES
type Node = { id: string; shape: Shape; label: string }
type Arrow = 'plain' | 'thick' | 'dotted'

// A namer: each call makes the next node, A, B, C …
function namer(): (shape: Shape, label: string) => Node {
  let i = 0
  return (shape, label) => ({ id: String.fromCharCode(65 + i++), shape, label })
}

// n's id, with its shape and label on its first mention. The label is quoted in a quoted block, and wherever it holds a
// character that an unquoted label cannot.
function ref(b: Block, n: Node): string {
  if (b.drawn.has(n.id)) return n.id
  b.drawn.add(n.id)
  const t = text(b, n.label), [open, close] = SHAPES[n.shape]
  return `${n.id}${open}${b.quoted || /[()[\]{}:/;#|&<>"]/.test(t.replaceAll('<br/>', '')) ? `"${t}"` : t}${close}`
}

// The edge from a to z, an arrow of kind, with its label after the arrow as |label|; or, for a plain arrow in a dash
// block, between the dashes: a -- label --> z.
function edge(b: Block, a: Node, z: Node, kind: Arrow = 'plain', label?: string): string {
  const from = ref(b, a), arrow = { plain: '-->', thick: '==>', dotted: '-.->' }[kind], to = ref(b, z)
  if (!label) return `${from} ${arrow} ${to}`
  return kind === 'plain' && b.dash ? `${from} -- ${text(b, label)} --> ${to}` : `${from} ${arrow}|${text(b, label)}| ${to}`
}

// The edges along nodes, one per line.
const chain = (b: Block, nodes: Node[], kind: Arrow = 'plain'): string[] =>
  nodes.slice(1).map((z, i) => edge(b, nodes[i]!, z, kind))

// A subgraph's first line: an id and its title in brackets, quoted in a quoted block; now and then, in English, the
// bare title as its id.
function subgraph(b: Block, id: string, title: string): string {
  const t = text(b, title)
  if (!b.zh && chance(0.3)) return `subgraph ${t}`
  return `subgraph ${id} [${b.quoted ? `"${t}"` : t}]`
}

// Process flows: the steps in order. The first step, which every flow keeps, has a detail.
const PROCESS: { title: string; steps: string[] }[] = [
  { title: 'Release flow|发布流程', steps: ['Pull code|拉取代码|git pull', 'Install deps|安装依赖|npm ci', 'Run tests|运行测试|unit + e2e|单元和端到端',
    'Build image|构建镜像|docker build', 'Push to registry|推送镜像', 'Deploy|部署上线|kubectl apply'] },
  { title: 'Onboarding|新用户引导', steps: ['Sign up|注册账号|email or phone|邮箱或手机号', 'Verify email|验证邮箱', 'Fill in profile|完善资料',
    'Pick a plan|选择套餐', 'Start trial|开始试用|14 days|14 天'] },
  { title: 'CSV import|CSV 导入', steps: ['Read CSV|读取 CSV|UTF-8', 'Check each row|校验每一行', 'Normalize fields|规范化字段',
    'Write to database|写入数据库|batches of 500|每批 500 条', 'Email a summary|发送汇总邮件'] },
  { title: 'Bug fix|修复缺陷', steps: ['Reproduce the bug|复现问题|issue 1423', 'Write a failing test|先写失败的测试', 'Fix the code|修改代码',
    'Run all tests|运行全部测试', 'Open a PR|提交 PR', 'Merge|合并'] },
  { title: 'Request lifecycle|请求处理流程', steps: ['Receive request|接收请求|Nginx', 'Check the token|校验令牌|JWT', 'Parse params|解析参数',
    'Call the service|调用服务|gRPC', 'Return JSON|返回 JSON'] },
  { title: 'Model training|模型训练', steps: ['Collect data|收集数据|logs from S3|从 S3 拉取日志', 'Clean data|清洗数据|pandas',
    'Split train and test|划分训练集和测试集', 'Train model|训练模型|GPU', 'Evaluate|评估效果|AUC', 'Ship model|发布模型'] },
]

// Decisions: a step, a question with yes and no branches, and where the no branch goes: to the end, back to the step,
// back to the question, or into the yes branch's last node. The step or the question has a detail.
type Decision = { title: string; step: string; ask: string; yes: string[]; no: string[]; then: 'end' | 'step' | 'ask' | 'join' }
const DECISION: Decision[] = [
  { title: 'Cache lookup|缓存查询', step: 'Receive request|收到请求', ask: 'Cache hit?|命中缓存?|Redis', yes: ['Return data|返回数据'],
    no: ['Query MySQL|查询 MySQL', 'Write back to cache|回写缓存|TTL 10 min|过期 10 分钟'], then: 'join' },
  { title: 'Login|登录', step: 'Enter password|输入密码', ask: 'Password correct?|密码正确?|bcrypt',
    yes: ['Issue token|签发令牌|JWT', 'Go to home page|进入首页'], no: ['Show error|提示错误|max 5 tries|最多 5 次'], then: 'step' },
  { title: 'Code review|代码评审', step: 'Open PR|提交 PR', ask: 'CI green?|CI 通过?|lint and tests|检查和测试',
    yes: ['Review|代码评审|2 approvals|两人批准', 'Merge|合并到主干'], no: ['Fix and push|修复后推送'], then: 'ask' },
  { title: 'Refund|退款', step: 'Refund request|退款申请', ask: 'Within 7 days?|7 天内?|since delivery|自签收起', yes: ['Full refund|全额退款'],
    no: ['Manual review|人工审核'], then: 'end' },
  { title: 'Disk alert|磁盘告警', step: 'Check disk usage|检查磁盘|every 5 min|每 5 分钟', ask: 'Over 90%?|超过 90%?',
    yes: ['Clean old logs|清理旧日志', 'Page on-call|通知值班'], no: ['Do nothing|无需处理'], then: 'end' },
  { title: 'Feature flag|功能开关', step: 'Load user|加载用户', ask: 'Flag on?|开关打开?|10% rollout|灰度 10%', yes: ['New checkout|新版结账'],
    no: ['Old checkout|旧版结账'], then: 'end' },
]

// Retry loops: a call, its check, the step after success, the wait before the next try, and the step once the tries run
// out. The call has a detail.
type Retry = { title: string; call: string; ok: string; done: string; wait: string; fail: string }
const RETRY: Retry[] = [
  { title: 'Payment retry|支付重试', call: 'Call payment API|调用支付接口|timeout 5s|超时 5 秒', ok: 'Paid?|支付成功?',
    done: 'Mark order paid|更新订单状态', wait: 'Back off|退避等待|1s, 2s, 4s', fail: 'Alert finance|通知财务' },
  { title: 'Download|下载文件', call: 'Download file|下载文件|HTTPS', ok: 'Checksum OK?|校验和正确?', done: 'Save to disk|保存到磁盘',
    wait: 'Wait 10s|等待 10 秒', fail: 'Report error|上报错误' },
  { title: 'Message consumer|消息消费', call: 'Pull message|拉取消息|Kafka', ok: 'Handled?|处理成功?', done: 'Commit offset|提交位点',
    wait: 'Requeue with delay|延迟重投', fail: 'Send to DLQ|进入死信队列' },
  { title: 'Deploy check|发布检查', call: 'Switch traffic|切换流量|10% canary|灰度 10%', ok: 'Healthy?|健康检查通过?',
    done: 'Full rollout|全量发布', wait: 'Wait 1 min|等待 1 分钟', fail: 'Roll back|回滚版本' },
  { title: 'Webhook delivery|Webhook 投递', call: 'Send webhook|发送 Webhook|POST', ok: 'Got 2xx?|返回 2xx?', done: 'Mark delivered|标记已送达',
    wait: 'Exponential backoff|指数退避', fail: 'Disable endpoint|停用该地址' },
  { title: 'Agent fix loop|自动修复循环', call: 'Generate patch|生成补丁|LLM', ok: 'Tests pass?|测试通过?', done: 'Open PR|提交 PR',
    wait: 'Feed back errors|回传错误信息', fail: 'Ask a human|转人工处理' },
]

// Pipelines: the stages in order, the gate before the last stage, and a side task off the last stage. The first stage
// has a detail.
type Pipeline = { title: string; stages: string[]; gate: string; side: string }
const PIPELINE: Pipeline[] = [
  { title: 'CI/CD|CI/CD 流水线', stages: ['Commit|提交代码|git push', 'Lint|代码检查|eslint', 'Unit tests|单元测试', 'Build image|构建镜像',
    'Deploy staging|部署预发', 'Deploy prod|部署生产'], gate: 'manual approval|人工审批', side: 'Notify Slack|通知 Slack' },
  { title: 'ETL|ETL 任务', stages: ['Extract|抽取数据|MySQL binlog', 'Clean|清洗', 'Transform|转换|dbt', 'Load|加载|BigQuery',
    'Refresh dashboard|刷新看板'], gate: 'checks pass|校验通过', side: 'Data quality report|数据质量报告' },
  { title: 'Docs publishing|文档发布', stages: ['Draft|撰写初稿|Markdown', 'Review|审阅', 'Translate|翻译', 'Build site|构建站点|Hugo',
    'Publish|发布'], gate: 'approved|审批通过', side: 'Archive old version|归档旧版本' },
  { title: 'Video processing|视频处理', stages: ['Upload|上传视频|up to 2 GB|最大 2 GB', 'Transcode|转码|H.264', 'Thumbnails|生成封面',
    'Content review|内容审核', 'Publish to CDN|发布到 CDN'], gate: 'passed review|审核通过', side: 'Notify uploader|通知作者' },
  { title: 'RAG indexing|RAG 索引', stages: ['Load documents|加载文档|PDF and HTML|PDF 和 HTML', 'Split into chunks|切分文本|512 tokens',
    'Embed|生成向量', 'Write index|写入索引|pgvector', 'Serve queries|提供检索'], gate: 'eval passes|评测通过', side: 'Log metrics|记录指标' },
  { title: 'App release|App 发版', stages: ['Bump version|升级版本号|1.4.0', 'Build|构建|Xcode', 'UI tests|UI 测试', 'TestFlight',
    'App Store review|商店审核', 'Release|正式发布'], gate: 'QA sign-off|测试签字', side: 'Changelog|更新日志' },
]

// Service architectures: the client, the entry it calls, three services with the index of the store each uses, the
// stores, and the external system the last service calls, with that edge's label. The entry has a detail.
type Arch = { title: string; client: string; entry: string; services: [string, number][]; stores: string[]; ext: string; via: string }
const ARCH: Arch[] = [
  { title: 'Web shop|电商系统', client: 'Browser|浏览器', entry: 'API gateway|API 网关|Kong', services: [['User service|用户服务', 1],
    ['Order service|订单服务', 0], ['Payment service|支付服务', 0]], stores: ['MySQL', 'Redis'], ext: 'Kafka', via: 'payment events|支付事件' },
  { title: 'Mobile backend|移动端后台', client: 'Mobile app|移动 App', entry: 'Nginx|Nginx|load balancer|负载均衡', services: [['Auth service|认证服务', 0],
    ['Feed service|动态服务', 1], ['Push service|推送服务', 0]], stores: ['PostgreSQL', 'S3|S3 对象存储'], ext: 'APNs and FCM|APNs 和 FCM', via: 'push|推送' },
  { title: 'SaaS dashboard|SaaS 控制台', client: 'Admin dashboard|管理后台', entry: 'BFF|BFF 层|GraphQL', services: [['Account service|账号服务', 0],
    ['Report service|报表服务', 0], ['Export worker|导出任务', 1]], stores: ['PostgreSQL', 'S3|S3 对象存储'], ext: 'Email service|邮件服务', via: 'send report|发送报表' },
  { title: 'LLM app|大模型应用', client: 'Web chat|网页聊天', entry: 'API server|API 服务|FastAPI', services: [['Session service|会话服务', 1],
    ['Retriever|检索服务', 0], ['LLM gateway|模型网关', 1]], stores: ['pgvector|向量库 pgvector', 'Redis'], ext: 'OpenAI API', via: 'HTTPS' },
]

// Sequence diagrams: the participants, each 'id:English|中文', where a leading * may draw as an actor; and the lines,
// each {English|中文} in the block's language. Each has 3 to 8 messages, a note and one frame.
type Seq = { title: string; people: string[]; lines: string[] }
const SEQ: Seq[] = [
  { title: 'Login|登录', people: ['*U:User|用户', 'W:Web app|网页端', 'A:Auth service|认证服务'], lines: ['U->>W: {Submit email and password|提交邮箱和密码}',
    'W->>A: POST /login', 'alt {valid|验证通过}', '    A-->>W: 200 + token', '    W-->>U: {Go to dashboard|跳转到控制台}', 'else {wrong password|密码错误}',
    '    A-->>W: 401', '    W-->>U: {Show error|提示错误}', 'end', 'Note over W,A: {Token expires in 1 hour|令牌 1 小时后过期}'] },
  { title: 'Checkout|下单流程', people: ['*C:Customer|顾客', 'O:Order service|订单服务', 'I:Inventory|库存服务', 'P:Payment|支付服务'], lines: [
    'C->>O: {Place order|提交订单}', 'O->>I: {Reserve stock|锁定库存}', 'alt {in stock|库存充足}', '    I-->>O: {Reserved|锁定成功}',
    '    O->>P: {Charge card|发起扣款}', '    P-->>O: {Paid|扣款成功}', '    O-->>C: {Order confirmed|下单成功}', 'else {out of stock|库存不足}',
    '    I-->>O: {Not enough stock|库存不足}', '    O-->>C: {Sold out|商品已售罄}', 'end', 'Note right of I: {Reservation lasts 15 min|锁定 15 分钟}'] },
  { title: 'Cache-aside read|缓存读取', people: ['C:Client|客户端', 'S:API|API 服务', 'R:Redis|Redis 缓存', 'D:MySQL'], lines: [
    'C->>S: GET /items/42', 'S->>R: GET item:42', 'opt {cache miss|缓存未命中}', '    R-->>S: nil', '    S->>D: SELECT * FROM items WHERE id = 42',
    '    D-->>S: {row|一行数据}', '    S->>R: SET item:42 EX 600', 'end', 'S-->>C: 200 OK', 'Note over S,R: {Cache-aside read|旁路缓存读取}'] },
  { title: 'Webhook retry|Webhook 重试', people: ['S:Our server|我方服务', 'E:Customer endpoint|客户回调地址'], lines: ['S->>E: POST /webhook',
    'loop {up to 5 tries|最多重试 5 次}', '    E-->>S: 503', '    S->>S: {Back off 2^n seconds|退避 2^n 秒}', '    S->>E: POST /webhook', 'end',
    'E-->>S: 200', 'Note left of S: {Give up after 5 tries|5 次后放弃}'] },
  { title: 'Google sign-in|Google 登录', people: ['*U:User|用户', 'A:App|应用', 'G:Google', 'B:Backend|后端'], lines: [
    'U->>A: {Click Sign in with Google|点击 Google 登录}', 'A->>G: {Redirect to consent page|跳转到授权页}', 'opt {first sign-in|首次登录}',
    '    G->>U: {Ask for consent|请求授权}', '    U->>G: {Allow|同意}', 'end', 'G-->>A: {Auth code|授权码}',
    'A->>B: {Exchange code for token|用授权码换令牌}', 'B-->>A: {Session cookie|会话 Cookie}', 'Note over A,G: OAuth 2.0 + PKCE'] },
  { title: 'File upload|文件上传', people: ['C:Client|客户端', 'U:Upload service|上传服务', 'S:Object storage|对象存储', 'Q:Queue|消息队列'], lines: [
    'C->>U: {Upload file|上传文件}', 'par {store|存储}', '    U->>S: PUT object', 'and {notify|通知}', '    U->>Q: {Publish uploaded event|发布上传事件}',
    'end', 'S-->>U: ETag', 'U-->>C: 201 Created', 'Note right of C: {Multipart over 100 MB|超过 100 MB 分片上传}'] },
  { title: 'CI run|CI 运行', people: ['*D:Developer|开发者', 'G:GitHub', 'R:CI runner|CI 执行器'], lines: ['D->>G: git push',
    'G->>R: {Trigger workflow|触发工作流}', 'R->>R: {Install and build|安装依赖并构建}', 'break {tests fail|测试失败}', '    R-->>G: {Status: failed|状态: 失败}',
    '    G-->>D: {Email|邮件通知}', 'end', 'R-->>G: {Status: passed|状态: 通过}', 'Note over R: {Runs on ubuntu-latest|运行在 ubuntu-latest}'] },
  { title: 'Streaming chat|流式对话', people: ['*U:User|用户', 'F:Frontend|前端', 'B:Backend|后端', 'M:Model|模型'], lines: [
    'U->>F: {Ask a question|提问}', 'F->>B: POST /chat', 'B->>M: {Prompt with context|带上下文的提示词}', 'loop {each token|每个 token}',
    '    M-->>B: token', '    B-->>F: {SSE event|SSE 事件}', 'end', 'F-->>U: {Show the answer|展示回答}', 'Note over B,M: {Streams until done|流式输出直到结束}'] },
]

// A start or end node's shapes; a decision's answer labels.
const ENDS: Shape[] = ['stadium', 'stadium', 'round', 'circle']
const ANSWERS = [['Yes|是', 'No|否'], ['yes|是', 'no|否'], ['Y|是', 'N|否']] as const

// A process flow: maybe a start, k of the steps in order, maybe an end. Now and then the first step is an input.
function flow(b: Block, p: { steps: string[] }): string[] {
  const n = namer(), ends = chance(0.6)
  const start = ends ? [n(pick(ENDS), 'Start|开始')] : []
  const steps = keep(p.steps, int(3, p.steps.length)).map((l, i) => n(i === 0 && chance(0.2) ? 'io' : 'rect', l))
  return chain(b, [...start, ...steps, ...(ends ? [n(pick(ENDS), 'Done|完成')] : [])])
}

// A decision: maybe a start, the step, the question, its yes and no branches, and maybe an end. The no branch goes to
// the end, back to the step or the question, or joins the yes branch's last node.
function decision(b: Block, d: Decision): string[] {
  const n = namer(), [yes, no] = pick(ANSWERS), start = chance(0.5) ? n(pick(ENDS), 'Start|开始') : null
  const step = n('rect', d.step), ask = n(chance(0.1) ? 'hexagon' : 'diamond', d.ask)
  const ys = d.yes.map(l => n('rect', l)), ns = d.no.map(l => n('rect', l))
  const end = d.then === 'end' || chance(0.6) ? n(pick(ENDS), 'End|结束') : null
  const back = { end, step, ask, join: ys[ys.length - 1]! }[d.then]
  return [
    ...(start ? [edge(b, start, step)] : []), edge(b, step, ask), edge(b, ask, ys[0]!, 'plain', yes), ...chain(b, ys),
    edge(b, ask, ns[0]!, 'plain', no), ...chain(b, ns), ...(back ? [edge(b, ns[ns.length - 1]!, back)] : []),
    ...(end ? [edge(b, ys[ys.length - 1]!, end)] : []),
  ]
}

// A retry loop: maybe a start; the call and its check; on success the next step and maybe an end; on failure, while
// tries are left, a wait and back to the call, often dotted; once they run out, the last step.
function retryLoop(b: Block, r: Retry): string[] {
  const n = namer(), [yes, no] = pick(ANSWERS), start = chance(0.5) ? n(pick(ENDS), 'Start|开始') : null
  const call = n(chance(0.2) ? 'sub' : 'rect', r.call), ok = n('diamond', r.ok), done = n('rect', r.done)
  const left = n('diamond', 'Retries left?|还能重试?|max 3|最多 3 次'), wait = n('rect', r.wait), failed = n('rect', r.fail)
  const end = chance(0.5) ? n(pick(ENDS), 'End|结束') : null
  return [
    ...(start ? [edge(b, start, call)] : []), edge(b, call, ok), edge(b, ok, done, 'plain', yes), edge(b, ok, left, 'plain', no),
    edge(b, left, wait, 'plain', yes), edge(b, wait, call, chance(0.6) ? 'dotted' : 'plain', chance(0.3) ? 'retry|重试' : undefined),
    edge(b, left, failed, 'plain', no), ...(end ? [edge(b, done, end)] : []),
  ]
}

// A pipeline: k of the stages, all thick or all plain arrows, now and then the gate's label on the last arrow, and now
// and then a dotted side task off the last stage.
function pipeline(b: Block, p: Pipeline): string[] {
  const n = namer(), kind: Arrow = chance(0.5) ? 'thick' : 'plain'
  const stages = keep(p.stages, int(4, p.stages.length)).map((l, i) => n(i === 0 && chance(0.3) ? 'stadium' : 'rect', l))
  const last = stages[stages.length - 1]!
  const lines = [...chain(b, stages.slice(0, -1), kind), edge(b, stages[stages.length - 2]!, last, kind, chance(0.4) ? p.gate : undefined)]
  return chance(0.5) ? [...lines, edge(b, last, n('rect', p.side), 'dotted')] : lines
}

// A service architecture: the client outside; the entry and a nested subgraph of services inside the backend subgraph;
// the stores in their own subgraph; edges across the subgraphs' borders, and a dotted one out to an external system.
// A node's id is its English label's first word.
function architecture(b: Block, a: Arch): string[] {
  const node = (shape: Shape, label: string): Node => ({ id: label.split(/[ |]/)[0]!.toLowerCase().replace(/[^a-z0-9]/g, ''), shape, label })
  const client = node(pick(['stadium', 'round', 'rect'] as const), a.client), entry = node(chance(0.3) ? 'hexagon' : 'rect', a.entry)
  const services = a.services.map(([l]) => node(chance(0.2) ? 'sub' : 'rect', l))
  const stores = a.stores.slice(0, int(1, a.stores.length)).map(l => node('db', l)), ext = node('rect', a.ext)
  const p = b.pad
  return [
    subgraph(b, 'backend', 'Backend|后端'), p + ref(b, entry), p + subgraph(b, 'svc', 'Services|服务层'),
    ...services.map(s => p + p + ref(b, s)), `${p}end`, 'end',
    subgraph(b, 'data', 'Storage|存储层'), ...stores.map(s => p + ref(b, s)), 'end',
    edge(b, client, entry, 'plain', 'HTTPS'), ...services.map(s => edge(b, entry, s)),
    ...services.map((s, i) => edge(b, s, stores[Math.min(a.services[i]![1], stores.length - 1)]!)),
    edge(b, services[services.length - 1]!, ext, 'dotted', a.via),
  ]
}

// A sequence diagram, indented by pad: maybe a title, the participants, then the lines, in Chinese or English.
function sequence(zh: boolean, titled: boolean, pad: string, s: Seq): string[] {
  const say = (t: string) => t.replace(/\{([^|}]*)\|([^}]*)\}/g, (_, en: string, cn: string) => (zh ? cn : en))
  const people = s.people.map(p => {
    const [, star, id, label = ''] = /^(\*?)(\w+):(.*)$/.exec(p)!
    const [en = '', cn = en] = label.split('|')
    return `${star && chance(0.5) ? 'actor' : 'participant'} ${id} as ${zh ? cn : en}`
  })
  const [title = '', titleZh = title] = s.title.split('|')
  return ['sequenceDiagram', ...[...(titled ? [`title ${zh ? titleZh : title}`] : []), ...people, ...s.lines.map(say)].map(l => pad + l)]
}

// A flowchart template: how many blocks it draws, how often it lays out left to right rather than top down, and its nth
// block's title and lines.
type Template = { count: number; lr: number; make: (b: Block, nth: number) => { title: string; lines: string[] } }
// A template that draws its scenarios in turn.
function cycle<S extends { title: string }>(count: number, lr: number, scenarios: S[], draw: (b: Block, s: S) => string[]): Template {
  return { count, lr, make: (b, nth) => { const s = scenarios[nth % scenarios.length]!; return { title: s.title, lines: draw(b, s) } } }
}
const FLOWS: Template[] = [
  cycle(22, 0.4, PROCESS, flow), cycle(22, 0.2, DECISION, decision), cycle(18, 0.2, RETRY, retryLoop),
  cycle(18, 0.8, PIPELINE, pipeline), cycle(12, 0.3, ARCH, architecture),
]
// A block's indent: mostly four spaces.
const PADS = ['    ', '    ', '    ', '  ', '']

// The 100 blocks, the kinds in a shuffled order. Quotas over the 92 flowcharts hold the mix: 51 in Chinese, 80 quoted, 37
// with <br/> details, 8 with a frontmatter title, 28 that put a plain arrow's label between dashes, 24 headed graph, 4
// with no direction. Decisions, retry loops and architectures always label an edge; architectures always have
// subgraphs. Of the 8 sequence diagrams, 4 are in Chinese and 3 have a title.
function generate(): string[] {
  rand = mulberry32(SEED)
  const kinds = shuffle([...FLOWS.flatMap((t, k) => Array.from({ length: t.count }, () => k)), ...SEQ.map(() => -1)])
  const flows = kinds.length - SEQ.length
  const zh = quota(flows, 51), quoted = quota(flows, 80), br = quota(flows, 37), front = quota(flows, 8)
  const dash = quota(flows, 28), graph = quota(flows, 24), bare = quota(flows, 4)
  const seqZh = quota(SEQ.length, 4), titled = quota(SEQ.length, 3)
  return kinds.map((k, i) => {
    const before = kinds.slice(0, i), pad = pick(PADS)
    if (k < 0) {
      const s = before.filter(x => x < 0).length
      return sequence(seqZh[s]!, titled[s]!, pad, SEQ[s]!).join('\n') + '\n'
    }
    const f = before.filter(x => x >= 0).length
    const b: Block = { zh: zh[f]!, quoted: quoted[f]!, br: br[f]!, dash: dash[f]!, pad, drawn: new Set<string>() }
    const { title, lines } = FLOWS[k]!.make(b, before.filter(x => x === k).length)
    const dir = bare[f] ? '' : chance(FLOWS[k]!.lr) ? ' LR' : ' TD'
    const head = [...(front[f] ? ['---', `title: ${text(b, title)}`, '---'] : []), `${graph[f] ? 'graph' : 'flowchart'}${dir}`]
    return [...head, ...lines.map(l => pad + l)].join('\n') + '\n'
  })
}

function main(argv: readonly string[] = process.argv.slice(2)): number {
  const check = argv[0] === '--check'
  if (argv.length > (check ? 1 : 0)) {
    console.error(USAGE)
    return 2
  }
  const files = generate().map((body, i) => ({ path: join(DIR, `corpus-${String(i + 1).padStart(3, '0')}.mmd`), body }))
  if (check) {
    const stale = files.filter(f => !existsSync(f.path) || readFileSync(f.path, 'utf8') !== f.body)
    for (const f of stale) console.error(`gen-corpus: ${f.path} is out of date; run node scripts/gen-corpus.ts`)
    return stale.length > 0 ? 1 : 0
  }
  mkdirSync(DIR, { recursive: true })
  for (const f of files) writeFileSync(f.path, f.body)
  return 0
}

// main() runs only when node runs this file, not when a test imports it.
if (isMain(import.meta)) process.exitCode = main()

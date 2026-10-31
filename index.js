/**
 * Host half of the Jenkins plugin.
 *
 * Owns the Jenkins connection (settings, HTTP calls, crumb handling) and exposes it twice:
 *  - an HTTP prefix route under `/dsh-jenkins` that the sidebar panel calls, and
 *  - agent tools that call the same functions.
 *
 * No runtime dependency: Node built-ins only.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROUTE_PREFIX = '/dsh-jenkins'
const DEFAULT_TIMEOUT_MS = 20000
const MAX_REQUEST_BYTES = 64 * 1024
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const MAX_JOBS = 800

function warn(message) {
  console.warn(`[jenkins] ${message}`)
}

function errorMessage(error) {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : '未知错误'
}

/* ------------------------------------------------------------------ settings */

function settingsFile() {
  const override = process.env.DSH_JENKINS_SETTINGS
  if (typeof override === 'string' && override.trim()) return path.resolve(override.trim())
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim()
    ? process.env.DSH_HOME.trim()
    : path.join(homedir(), '.dsh')
  return path.join(home, 'jenkins', 'settings.json')
}

const CONNECTION_ID = /^[a-z0-9-]{6,64}$/i

function newConnectionId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** One Jenkins server. The token is stored on disk but never returned by a read. */
function coerceConnection(input, fallbackName) {
  const raw = input && typeof input === 'object' ? input : {}
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : ''
  return {
    id: typeof raw.id === 'string' && CONNECTION_ID.test(raw.id) ? raw.id : newConnectionId(),
    name: name || fallbackName || 'Jenkins',
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '',
    username: typeof raw.username === 'string' ? raw.username.trim() : '',
    token: typeof raw.token === 'string' ? raw.token.trim() : '',
    insecureTls: raw.insecureTls !== false,
    jobFilter: typeof raw.jobFilter === 'string' ? raw.jobFilter.trim() : '',
  }
}

function readStoredSettings() {
  const file = settingsFile()
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    if (error && error.code !== 'ENOENT') warn(`读取设置文件失败（${file}）：${errorMessage(error)}`)
    return null
  }
}

/** Patch config may hold one connection (legacy shape) or a `connections` list. */
function connectionsFromConfig(config) {
  const source = config && typeof config === 'object' ? config : {}
  if (Array.isArray(source.connections)) {
    return source.connections.map((entry, index) => coerceConnection(entry, `连接 ${index + 1}`))
  }
  if (typeof source.baseUrl === 'string' && source.baseUrl.trim()) return [coerceConnection(source, 'Jenkins')]
  return []
}

function loadState(config) {
  const stored = readStoredSettings()
  let connections
  let activeId = ''
  if (stored && Array.isArray(stored.connections)) {
    connections = stored.connections.map((entry, index) => coerceConnection(entry, `连接 ${index + 1}`))
    activeId = typeof stored.activeId === 'string' ? stored.activeId : ''
  } else if (stored && typeof stored.baseUrl === 'string' && stored.baseUrl.trim()) {
    // v1 file: one flat connection, migrated in place.
    const migrated = coerceConnection(stored, '默认连接')
    connections = [migrated]
    activeId = migrated.id
  } else {
    connections = connectionsFromConfig(config)
    activeId = connections[0] ? connections[0].id : ''
  }
  if (!connections.some((entry) => entry.id === activeId)) activeId = connections[0] ? connections[0].id : ''
  return { connections, activeId }
}

function persistState(state) {
  const file = settingsFile()
  mkdirSync(path.dirname(file), { recursive: true })
  const payload = { version: 2, activeId: state.activeId, connections: state.connections }
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    /* an inherited ACL may refuse chmod; the content is already written */
  }
  return file
}

function publicConnection(connection) {
  return {
    id: connection.id,
    name: connection.name,
    baseUrl: connection.baseUrl,
    username: connection.username,
    hasToken: connection.token.length > 0,
    insecureTls: connection.insecureTls,
    jobFilter: connection.jobFilter,
    configured: normalizeBaseUrlOrEmpty(connection.baseUrl) !== '',
  }
}

function publicState(state) {
  return {
    activeId: state.activeId,
    connections: state.connections.map(publicConnection),
    settingsFile: settingsFile(),
  }
}

/** Resolve a connection by id, then by name; an empty reference means the active one. */
function resolveConnection(state, reference) {
  const ref = typeof reference === 'string' ? reference.trim() : ''
  if (!ref) {
    const active = state.connections.find((entry) => entry.id === state.activeId)
    if (!active) throw new Error('还没有配置任何 Jenkins 连接，请先在面板里添加一个')
    return active
  }
  const byId = state.connections.find((entry) => entry.id === ref)
  if (byId) return byId
  const lowered = ref.toLowerCase()
  const byName = state.connections.find((entry) => entry.name.toLowerCase() === lowered)
  if (byName) return byName
  const names = state.connections.map((entry) => entry.name).join('、')
  throw new Error(`找不到 Jenkins 连接「${ref}」${names ? `，现有连接：${names}` : ''}`)
}

/* ---------------------------------------------------------------------- urls */

function normalizeBaseUrlOrEmpty(value) {
  try {
    return normalizeBaseUrl(value)
  } catch {
    return ''
  }
}

function normalizeBaseUrl(value) {
  const text = String(value === undefined || value === null ? '' : value).trim()
  if (!text) return ''
  let url
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`)
  } catch {
    throw new Error(`Jenkins 地址无法解析：${text}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Jenkins 地址必须以 http:// 或 https:// 开头')
  }
  const pathname = url.pathname.replace(/\/+$/, '')
  return `${url.protocol}//${url.host}${pathname}`
}

function joinUrl(base, relative) {
  if (!relative) return base
  if (/^https?:\/\//i.test(relative)) return relative
  return `${base.replace(/\/+$/, '')}/${relative.replace(/^\/+/, '')}`
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`
}

/* ------------------------------------------------------------------- transport */

function describeTransportError(error, target) {
  const code = error && error.code ? String(error.code) : ''
  const message = String((error && error.message) || '')
  if (code === 'ECONNREFUSED') return new Error(`无法连接 Jenkins（${target}）：连接被拒绝，请检查地址、端口，以及服务是否已启动`)
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new Error(`无法解析 Jenkins 主机名（${target}）`)
  if (code === 'ECONNRESET') return new Error(`连接被 Jenkins 重置（${target}）`)
  if (code === 'ETIMEDOUT' || code === 'EAI_AGAIN') return new Error(`连接 Jenkins 超时（${target}）`)
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|EPROTO|TLS/i.test(code) || /certificate|self[ -]signed|altname/i.test(message)) {
    return new Error(`TLS 证书校验失败（${target}）：如果 Jenkins 使用自签名证书，请在面板勾选「信任自签名证书」后重试`)
  }
  return error
}

function httpCall(target, options) {
  const opts = options || {}
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    let parsed
    try {
      parsed = new URL(target)
    } catch {
      reject(new Error(`无效地址：${target}`))
      return
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new Error(`不支持的协议：${parsed.protocol}`))
      return
    }
    const secure = parsed.protocol === 'https:'
    const transport = secure ? httpsRequest : httpRequest
    const requestOptions = {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      timeout: timeoutMs,
    }
    if (secure) requestOptions.rejectUnauthorized = opts.insecureTls !== true

    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      fn(value)
    }

    let request
    try {
      request = transport(parsed, requestOptions, (response) => {
        const status = response.statusCode || 0
        const location = response.headers.location
        if (status >= 300 && status < 400 && location) {
          response.resume()
          if (opts.redirects === 0) {
            finish(resolve, { status, headers: response.headers, text: '', location })
            return
          }
          let next
          try {
            next = new URL(location, parsed).toString()
          } catch {
            finish(reject, new Error(`Jenkins 返回了无法解析的跳转地址：${location}`))
            return
          }
          finish(resolve, httpCall(next, { ...opts, method: opts.method === 'POST' ? 'GET' : opts.method, redirects: (opts.redirects || 0) - 1 }))
          return
        }
        const chunks = []
        let size = 0
        response.on('data', (chunk) => {
          size += chunk.length
          if (size > MAX_RESPONSE_BYTES) {
            request.destroy(new Error('Jenkins 响应体过大'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => {
          finish(resolve, {
            status,
            headers: response.headers,
            text: Buffer.concat(chunks).toString('utf8'),
            location: typeof location === 'string' ? location : '',
          })
        })
        response.on('error', (error) => finish(reject, error))
      })
    } catch (error) {
      reject(error)
      return
    }

    request.on('timeout', () => {
      request.destroy(new Error(`请求 Jenkins 超时（${timeoutMs}ms）`))
    })
    request.on('error', (error) => finish(reject, describeTransportError(error, target)))
    if (opts.body !== undefined && opts.body !== null) request.write(opts.body)
    request.end()
  })
}

function snippet(value, limit) {
  const max = limit || 240
  const text = String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function parseJson(response, action) {
  const text = response.text || ''
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${action}失败：Jenkins 返回了非 JSON 内容（HTTP ${response.status}）${snippet(text) ? `：${snippet(text)}` : ''}`)
  }
}

function describeChallenge(response) {
  const parts = []
  const www = response.headers ? response.headers['www-authenticate'] : undefined
  if (typeof www === 'string' && www) parts.push(`WWW-Authenticate: ${www}`)
  const server = response.headers ? response.headers.server : undefined
  if (typeof server === 'string' && server) parts.push(`Server: ${server}`)
  if (response.sentAuthorization === false) parts.push('未发送认证头（用户名与 Token 都是空的）')
  if (response.url) parts.push(`URL: ${response.url}`)
  const body = snippet(response.text, 160)
  if (body) parts.push(`响应: ${body}`)
  return parts.join('｜')
}

function ensureOk(response, action) {
  const status = response.status
  if (status === 401 || status === 403) {
    const detail = describeChallenge(response)
    throw new Error(`${action}失败：HTTP ${status}${detail ? `｜${detail}` : ''}｜请检查用户名与 API Token`)
  }
  if (status === 404) {
    throw new Error(`${action}失败：接口不存在（HTTP 404），请确认填写的 Jenkins 根地址是否正确`)
  }
  if (status >= 400) {
    throw new Error(`${action}失败：HTTP ${status}${snippet(response.text) ? `，${snippet(response.text)}` : ''}`)
  }
}

/* ------------------------------------------------------------------- jenkins */

function createJenkins(settings) {
  const baseUrl = normalizeBaseUrl(settings.baseUrl)
  if (!baseUrl) throw new Error('尚未配置 Jenkins 地址，请先在 Jenkins 面板里填写地址并保存')

  const authHeader = settings.username || settings.token
    ? `Basic ${Buffer.from(`${settings.username}:${settings.token}`).toString('base64')}`
    : ''

  async function call(target, options) {
    const opts = options || {}
    const absolute = /^https?:\/\//i.test(target) ? target : joinUrl(baseUrl, target)
    const headers = {
      accept: opts.accept || 'application/json',
      'user-agent': 'dsh-jenkins/1.0',
    }
    if (authHeader) headers.authorization = authHeader
    if (opts.crumb) headers[opts.crumb.field] = opts.crumb.value
    if (opts.body !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded'
    const response = await httpCall(absolute, {
      method: opts.method || 'GET',
      headers,
      body: opts.body,
      insecureTls: settings.insecureTls,
      timeoutMs: opts.timeoutMs || DEFAULT_TIMEOUT_MS,
    })
    response.url = absolute
    response.sentAuthorization = Boolean(authHeader)
    return response
  }

  async function readCrumb() {
    try {
      const response = await call('crumbIssuer/api/json')
      if (response.status !== 200) return null
      const data = parseJson(response, '读取 CSRF 令牌')
      if (!data || typeof data.crumbRequestField !== 'string' || typeof data.crumb !== 'string') return null
      return { field: data.crumbRequestField, value: data.crumb }
    } catch {
      return null
    }
  }

  function isFolder(job) {
    const klass = typeof job._class === 'string' ? job._class : ''
    return /folder/i.test(klass)
  }

  function mapJob(job, name) {
    const last = job.lastBuild && typeof job.lastBuild === 'object' ? job.lastBuild : null
    return {
      name,
      url: typeof job.url === 'string' ? job.url : '',
      color: typeof job.color === 'string' && job.color ? job.color : 'grey',
      lastBuild: last
        ? {
            number: typeof last.number === 'number' ? last.number : null,
            result: typeof last.result === 'string' ? last.result : null,
            building: last.building === true,
            timestamp: typeof last.timestamp === 'number' ? last.timestamp : 0,
            duration: typeof last.duration === 'number' ? last.duration : 0,
            url: typeof last.url === 'string' ? last.url : '',
          }
        : null,
    }
  }

  async function listJobs() {
    const tree = 'jobs[name,fullName,color,url,_class,lastBuild[number,result,building,timestamp,duration,url]]'
    const collected = []
    const visited = new Set()

    async function walk(folderUrl, prefix, depth) {
      if (depth > 4 || collected.length >= MAX_JOBS) return
      const response = await call(`${ensureTrailingSlash(folderUrl)}api/json?tree=${encodeURIComponent(tree)}`)
      ensureOk(response, '读取任务列表')
      const data = parseJson(response, '读取任务列表')
      const jobs = Array.isArray(data.jobs) ? data.jobs : []
      for (const job of jobs) {
        if (!job || typeof job.name !== 'string') continue
        const name = prefix ? `${prefix}/${job.name}` : job.name
        if (isFolder(job)) {
          const url = typeof job.url === 'string' ? job.url : ''
          if (url && !visited.has(url)) {
            visited.add(url)
            await walk(url, name, depth + 1)
          }
          continue
        }
        collected.push(mapJob(job, name))
        if (collected.length >= MAX_JOBS) return
      }
    }

    await walk(baseUrl, '', 0)
    const filter = settings.jobFilter.toLowerCase()
    const jobs = filter ? collected.filter((job) => job.name.toLowerCase().includes(filter)) : collected
    jobs.sort((a, b) => a.name.localeCompare(b.name))
    return jobs
  }

  async function listBuilds(jobUrl, limit) {
    const count = Math.min(Math.max(Number(limit) || 8, 1), 25)
    const tree = `builds[number,result,building,timestamp,duration,url,displayName]{0,${count}}`
    const response = await call(`${ensureTrailingSlash(jobUrl)}api/json?tree=${encodeURIComponent(tree)}`)
    ensureOk(response, '读取构建历史')
    const data = parseJson(response, '读取构建历史')
    const builds = Array.isArray(data.builds) ? data.builds : []
    return builds.map((build) => ({
      number: typeof build.number === 'number' ? build.number : null,
      result: typeof build.result === 'string' ? build.result : null,
      building: build.building === true,
      timestamp: typeof build.timestamp === 'number' ? build.timestamp : 0,
      duration: typeof build.duration === 'number' ? build.duration : 0,
      url: typeof build.url === 'string' ? build.url : '',
    }))
  }

  async function listQueue() {
    const tree = 'items[id,why,blocked,buildableInQueue,stuck,inQueueSince,task[name,url,color]]'
    const response = await call(`queue/api/json?tree=${encodeURIComponent(tree)}`)
    ensureOk(response, '读取构建队列')
    const data = parseJson(response, '读取构建队列')
    const items = Array.isArray(data.items) ? data.items : []
    return items.map((item) => {
      const task = item && item.task && typeof item.task === 'object' ? item.task : {}
      return {
        id: typeof item.id === 'number' ? item.id : null,
        name: typeof task.name === 'string' ? task.name : '',
        url: typeof task.url === 'string' ? task.url : '',
        why: typeof item.why === 'string' ? item.why : '',
        blocked: item.blocked === true,
        stuck: item.stuck === true,
      }
    })
  }

  async function readParameterDefinitions(jobUrl) {
    const tree = 'property[parameterDefinitions[name,type,description,defaultParameterValue[value],choices]]'
    const response = await call(`${ensureTrailingSlash(jobUrl)}api/json?tree=${encodeURIComponent(tree)}`)
    if (response.status >= 400) return []
    let data
    try {
      data = parseJson(response, '读取参数定义')
    } catch {
      return []
    }
    const properties = Array.isArray(data.property) ? data.property : []
    const definitions = []
    for (const property of properties) {
      if (!property || !Array.isArray(property.parameterDefinitions)) continue
      for (const definition of property.parameterDefinitions) {
        if (!definition || typeof definition.name !== 'string') continue
        const carrier = definition.defaultParameterValue
        const value = carrier && typeof carrier === 'object' ? carrier.value : undefined
        definitions.push({
          name: definition.name,
          type: typeof definition.type === 'string' ? definition.type : '',
          hasDefault: value !== undefined && value !== null,
          defaultValue: value,
          choices: Array.isArray(definition.choices) ? definition.choices : undefined,
        })
      }
    }
    return definitions
  }

  /** Build the form payload that reproduces each parameter's declared default. */
  function defaultsFromDefinitions(definitions) {
    const payload = {}
    for (const definition of definitions) {
      // File parameters are multipart-only and cannot be expressed as a form field.
      if (/FileParameter/i.test(definition.type)) continue
      // A parameter without a declared default is left out so Jenkins applies its own.
      if (!definition.hasDefault) continue
      const value = definition.defaultValue
      payload[definition.name] = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)
    }
    return payload
  }

  async function triggerBuild(jobUrl, params) {
    const explicit = params && typeof params === 'object' ? params : {}
    let payload = explicit
    let usedDefaults = false
    if (Object.keys(payload).length === 0) {
      const definitions = await readParameterDefinitions(jobUrl)
      if (definitions.length > 0) {
        payload = defaultsFromDefinitions(definitions)
        usedDefaults = true
      }
    }
    const keys = Object.keys(payload)
    const crumb = keys.length > 0 ? await readCrumb() : null
    const target = `${ensureTrailingSlash(jobUrl)}${keys.length > 0 ? 'buildWithParameters' : 'build'}`
    const body = keys.length > 0 ? new URLSearchParams(Object.entries(payload).map(([key, value]) => [key, String(value)])).toString() : undefined
    const response = await call(target, { method: 'POST', body, crumb, accept: 'text/plain, */*' })
    if (response.status === 401 || response.status === 403) {
      throw new Error('触发构建失败：认证未通过或当前账号没有构建权限')
    }
    if (response.status >= 400) {
      const hint = keys.length === 0 ? '（该任务可能需要参数，但没有读到可用默认值）' : ''
      throw new Error(`触发构建失败：HTTP ${response.status}${hint}${snippet(response.text) ? `，${snippet(response.text)}` : ''}`)
    }
    let queueUrl = ''
    if (response.location) {
      try {
        queueUrl = new URL(response.location, target).toString()
      } catch {
        queueUrl = ''
      }
    }
    return {
      queued: true,
      queueUrl,
      withParameters: keys.length > 0,
      usedDefaults,
      parameters: keys.length > 0 ? payload : undefined,
    }
  }

  async function testConnection() {
    const started = Date.now()
    const response = await call('api/json?tree=mode,nodeDescription,useSecurity')
    if (response.status === 401 || response.status === 403) {
      const detail = describeChallenge(response)
      throw new Error(`认证未通过（HTTP ${response.status}）${detail ? `｜${detail}` : ''}｜请检查用户名与 API Token`)
    }
    if (response.status === 404) {
      throw new Error('地址可以访问，但 /api/json 不存在，可能不是 Jenkins 根地址')
    }
    ensureOk(response, '连接测试')
    const data = parseJson(response, '连接测试')
    let authenticatedAs = ''
    try {
      const who = await call('whoAmI/api/json')
      if (who.status === 200) {
        const info = parseJson(who, '读取当前用户')
        if (info && typeof info.name === 'string') authenticatedAs = info.name
      }
    } catch {
      /* optional: older Jenkins or a restricted realm may not answer whoAmI */
    }
    return {
      ok: true,
      latencyMs: Date.now() - started,
      version: typeof response.headers['x-jenkins'] === 'string' ? response.headers['x-jenkins'] : '',
      mode: typeof data.mode === 'string' ? data.mode : '',
      authenticatedAs,
    }
  }

  return { baseUrl, listJobs, listBuilds, listQueue, triggerBuild, testConnection }
}

function resolveJob(jobs, wanted) {
  const needle = String(wanted || '').trim()
  if (!needle) throw new Error('缺少任务名称')
  const lowered = needle.toLowerCase()
  const exact = jobs.find((job) => job.name.toLowerCase() === lowered)
  if (exact) return exact
  const tail = jobs.find((job) => job.name.toLowerCase().endsWith(`/${lowered}`))
  if (tail) return tail
  const fuzzy = jobs.filter((job) => job.name.toLowerCase().includes(lowered))
  if (fuzzy.length === 1) return fuzzy[0]
  if (fuzzy.length === 0) throw new Error(`没有找到匹配的任务：${needle}`)
  throw new Error(`「${needle}」匹配到多个任务：${fuzzy.slice(0, 6).map((job) => job.name).join('、')}`)
}

/* -------------------------------------------------------------------- update */

const SELF = (() => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf8'))
    return {
      name: typeof pkg.name === 'string' ? pkg.name : '',
      version: typeof pkg.version === 'string' ? pkg.version : '',
    }
  } catch {
    return { name: '', version: '' }
  }
})()

/** Compare two version strings; returns -1, 0 or 1. Pre-release suffixes sort before the release. */
function compareVersions(left, right) {
  const parse = (value) =>
    String(value === undefined || value === null ? '' : value)
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .filter((part) => part !== '')
      .map((part) => {
        const numeric = Number(part)
        return Number.isFinite(numeric) && /^\d+$/.test(part) ? numeric : part
      })
  const a = parse(left)
  const b = parse(right)
  const length = Math.max(a.length, 3)
  for (let index = 0; index < length; index += 1) {
    const l = a[index]
    const r = b[index]
    if (l === undefined) return r === undefined ? 0 : -1
    if (r === undefined) return 1
    if (typeof l === 'number' && typeof r === 'number') {
      if (l !== r) return l < r ? -1 : 1
      continue
    }
    if (typeof l === 'number') return 1
    if (typeof r === 'number') return -1
    if (String(l) !== String(r)) return String(l) < String(r) ? -1 : 1
  }
  return 0
}

function isLocalSpec(target) {
  return (
    /^file:/i.test(target) ||
    /^[a-zA-Z]:[\\/]/.test(target) ||
    target.startsWith('/') ||
    target.startsWith('.\\') ||
    target.startsWith('./') ||
    target.startsWith('..')
  )
}

/** Strip a `git+` prefix and any `#ref` suffix. */
function gitSpecBase(value) {
  const text = String(value === undefined || value === null ? '' : value).trim()
  if (!text) return ''
  const withoutPrefix = text.replace(/^git\+/, '')
  const hashIndex = withoutPrefix.indexOf('#')
  return hashIndex >= 0 ? withoutPrefix.slice(0, hashIndex) : withoutPrefix
}

const GIT_SHORTHAND_HOSTS = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
  gitee: 'gitee.com',
  gitea: 'gitea.com',
}

/** Extract a fetchable git remote from a spec or a bundle `source` string. */
function gitRemoteOf(value) {
  const base = gitSpecBase(value)
  if (!base) return ''
  const shorthand = /^(github|gitlab|bitbucket|gitee|gitea):([^/\s]+)\/([^/\s#]+)$/i.exec(base)
  if (shorthand) {
    const host = GIT_SHORTHAND_HOSTS[shorthand[1].toLowerCase()]
    return `https://${host}/${shorthand[2]}/${shorthand[3].replace(/\.git$/i, '')}.git`
  }
  const looksRemote =
    /^https?:\/\//i.test(base) ||
    /^(ssh|git):\/\//i.test(base) ||
    /^[\w.-]+@[\w.-]+:/.test(base)
  if (!looksRemote) return ''
  const looksRepo =
    /\.git$/i.test(base) ||
    /\.git\//i.test(base) ||
    /^https?:\/\/(github|gitlab|bitbucket|gitee|gitea)\.com?\/[^/]+\/[^/?#]+\/?$/i.test(base)
  if (!looksRepo) return ''
  return base.replace(/\/+$/, '')
}

/** Whether a bundle `source` looks like it came from git at all. */
function looksLikeGitSource(value) {
  const text = String(value === undefined || value === null ? '' : value).trim()
  if (!text) return false
  const base = gitSpecBase(text)
  return (
    /^git\+/i.test(text) ||
    /\.git$/i.test(base) ||
    /^(github|gitlab|bitbucket|gitee|gitea):/i.test(base) ||
    /^https?:\/\/(github|gitlab|bitbucket|gitee|gitea)\./i.test(base) ||
    /^[\w.-]+@[\w.-]+:/.test(base)
  )
}

/**
 * A git install has no registry version, so update means "the tip of the default branch".
 * The usual default branch names are tried in order; the first that resolves wins.
 */
async function checkGitUpdate(manager, remote, base) {
  if (typeof manager.inspect !== 'function') {
    return { ...base, supported: false, source: remote, reason: '插件管理器不支持版本查询' }
  }
  let lastReason = ''
  const needsPrefix = /^https?:\/\//i.test(remote) || /^(ssh|git):\/\//i.test(remote)
  for (const ref of ['main', 'master']) {
    const spec = `${needsPrefix ? 'git+' : ''}${remote}#${ref}`
    let inspection
    try {
      inspection = await manager.inspect(spec)
    } catch (error) {
      lastReason = errorMessage(error)
      continue
    }
    if (!inspection || inspection.status !== 'accepted') {
      lastReason = (inspection && inspection.reason) || lastReason
      continue
    }
    const latestVersion = typeof inspection.version === 'string' ? inspection.version : ''
    return {
      ...base,
      supported: true,
      kind: 'git',
      target: spec,
      source: remote,
      ref,
      latestVersion,
      updateAvailable: latestVersion ? compareVersions(latestVersion, SELF.version) > 0 : false,
    }
  }
  return {
    ...base,
    supported: false,
    source: remote,
    reason: `git 安装：无法解析远端分支${lastReason ? `（${lastReason}）` : ''}`,
  }
}

/**
 * Resolve whether a newer release exists for this plugin's own install target:
 * a registry version for npm installs, the default-branch tip for git installs,
 * and an explanation for local-directory installs.
 */
async function checkForUpdate(manager) {
  const base = { name: SELF.name, currentVersion: SELF.version }
  if (!manager || typeof manager.listBundles !== 'function') {
    return { ...base, supported: false, reason: '当前环境没有插件管理器，无法自更新' }
  }
  let entry = null
  try {
    const bundles = await manager.listBundles()
    if (Array.isArray(bundles)) entry = bundles.find((bundle) => bundle && bundle.name === SELF.name) || null
  } catch (error) {
    return { ...base, supported: false, reason: `读取已安装信息失败：${errorMessage(error)}` }
  }
  if (!entry) return { ...base, supported: false, reason: '插件管理器没有列出本插件（可能是本地目录安装）' }

  const target = entry.installTarget && typeof entry.installTarget.spec === 'string' ? entry.installTarget.spec : ''
  const source = typeof entry.source === 'string' ? entry.source : ''

  const localSource = /^(link|file|path):/i.test(source) || isLocalSpec(source.replace(/^(link|file|path):/i, ''))
  if (isLocalSpec(target) || (!target && localSource)) {
    return { ...base, supported: false, target, source, reason: '当前是本地目录安装：改源码后重新安装即可，不通过市场更新' }
  }

  // A git install may not report an installTarget at all; its `source` carries the remote.
  const gitRemote = gitRemoteOf(target) || gitRemoteOf(source)
  if (gitRemote) return checkGitUpdate(manager, gitRemote, base)
  // Unrecognised git shorthand: hand the manager's own source string back to it.
  if (looksLikeGitSource(source)) return checkGitUpdate(manager, gitSpecBase(source), base)

  if (!target) return { ...base, supported: false, source, reason: `没有可用的安装来源，无法自更新（来源：${source || '未知'}）` }
  if (typeof manager.inspect !== 'function') {
    return { ...base, supported: false, target, source, reason: '插件管理器不支持版本查询' }
  }

  // The recorded install target is usually pinned (name@1.4.3); inspecting it
  // only ever resolves that exact version. Ask the registry for the latest
  // version of this package instead.
  const latestSpec = `${SELF.name}@latest`
  let inspection
  try {
    inspection = await manager.inspect(latestSpec)
  } catch (error) {
    return { ...base, supported: true, target, source, reason: `检查更新失败：${errorMessage(error)}` }
  }
  if (!inspection || inspection.status !== 'accepted') {
    return { ...base, supported: true, target, source, reason: (inspection && inspection.reason) || '无法解析更新源' }
  }
  const latestVersion = typeof inspection.version === 'string' ? inspection.version : ''
  return {
    ...base,
    supported: true,
    target: latestVersion ? `${SELF.name}@${latestVersion}` : latestSpec,
    source,
    latestVersion,
    updateAvailable: latestVersion ? compareVersions(latestVersion, SELF.version) > 0 : false,
  }
}

async function applyUpdate(manager, approvedBuilds) {
  if (!manager || typeof manager.installBundle !== 'function') throw new Error('当前环境没有插件管理器，无法更新')
  const info = await checkForUpdate(manager)
  if (!info.supported) throw new Error(info.reason || '当前安装方式不支持自动更新')
  if (!info.updateAvailable) throw new Error(`已经是最新版本 ${info.currentVersion || ''}`.trim())
  const result = await manager.installBundle(info.target, {
    enabled: true,
    saveExact: true,
    ...(Array.isArray(approvedBuilds) && approvedBuilds.length > 0 ? { approvedBuilds } : {}),
  })
  return { ...info, result }
}

/* --------------------------------------------------------------------- routes */

function isLoopback(req) {
  const address = req.socket && req.socket.remoteAddress
  if (!address) return true
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address.startsWith('::ffff:127.')
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (!text) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(text)
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function createRouteHandler(store) {
  return async function handle(req, res) {
    if (!isLoopback(req)) {
      sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      return
    }
    let route = '/'
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      route = url.pathname.slice(ROUTE_PREFIX.length).replace(/\/+$/, '') || '/'
    } catch {
      sendJson(res, 400, { ok: false, error: '无效的请求路径' })
      return
    }

    try {
      const state = store.state
      const body = req.method === 'POST' ? await readJsonBody(req) : {}
      const reference = typeof body.connection === 'string' ? body.connection : ''

      if (route === '/state') {
        sendJson(res, 200, { ok: true, ...publicState(state) })
        return
      }

      if (route === '/update') {
        const info = await checkForUpdate(store.manager ? store.manager() : null)
        sendJson(res, 200, { ok: true, ...info })
        return
      }

      if (route === '/update/apply' && req.method === 'POST') {
        const approved = Array.isArray(body.approvedBuilds)
          ? body.approvedBuilds.filter((entry) => typeof entry === 'string')
          : []
        const result = await applyUpdate(store.manager ? store.manager() : null, approved)
        sendJson(res, 200, { ok: true, ...result })
        return
      }

      // Upsert one connection. `/settings` is kept as an alias for older clients.
      if ((route === '/connection/save' || route === '/settings') && req.method === 'POST') {
        let target = null
        const wantedId = typeof body.id === 'string' && body.id ? body.id : ''
        if (wantedId) {
          target = state.connections.find((entry) => entry.id === wantedId) || null
          if (!target) throw new Error(`找不到连接：${wantedId}`)
        }
        const merged = coerceConnection(
          {
            id: target ? target.id : undefined,
            name: typeof body.name === 'string' && body.name.trim() ? body.name : target ? target.name : '',
            baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : target ? target.baseUrl : '',
            username: typeof body.username === 'string' ? body.username : target ? target.username : '',
            token: typeof body.token === 'string' && body.token.length > 0 ? body.token : target ? target.token : '',
            insecureTls: typeof body.insecureTls === 'boolean' ? body.insecureTls : target ? target.insecureTls : true,
            jobFilter: typeof body.jobFilter === 'string' ? body.jobFilter : target ? target.jobFilter : '',
          },
          target ? target.name : `连接 ${state.connections.length + 1}`,
        )
        if (body.clearToken === true) merged.token = ''
        merged.baseUrl = normalizeBaseUrl(merged.baseUrl)
        if (target) {
          state.connections = state.connections.map((entry) => (entry.id === target.id ? merged : entry))
        } else {
          state.connections = [...state.connections, merged]
        }
        // A newly created connection becomes active; an edited one only when asked.
        if (!target || body.makeActive === true) state.activeId = merged.id
        const file = persistState(state)
        sendJson(res, 200, { ok: true, ...publicState(state), savedTo: file, id: merged.id })
        return
      }

      if (route === '/connection/remove' && req.method === 'POST') {
        const target = resolveConnection(state, typeof body.id === 'string' ? body.id : '')
        state.connections = state.connections.filter((entry) => entry.id !== target.id)
        if (!state.connections.some((entry) => entry.id === state.activeId)) {
          state.activeId = state.connections[0] ? state.connections[0].id : ''
        }
        const file = persistState(state)
        sendJson(res, 200, { ok: true, ...publicState(state), savedTo: file })
        return
      }

      if (route === '/connection/active' && req.method === 'POST') {
        const target = resolveConnection(state, typeof body.id === 'string' ? body.id : '')
        state.activeId = target.id
        const file = persistState(state)
        sendJson(res, 200, { ok: true, ...publicState(state), savedTo: file })
        return
      }

      // Everything below works on one connection: the named one, else the active one.
      const connection = resolveConnection(state, reference)

      if (route === '/test' && req.method === 'POST') {
        const result = await createJenkins(connection).testConnection()
        sendJson(res, 200, { ok: true, ...result, connection: publicConnection(connection) })
        return
      }

      if (route === '/jobs' && req.method === 'POST') {
        const jenkins = createJenkins(connection)
        const jobs = await jenkins.listJobs()
        sendJson(res, 200, {
          ok: true,
          jobs,
          baseUrl: jenkins.baseUrl,
          connection: publicConnection(connection),
          fetchedAt: Date.now(),
        })
        return
      }

      if (route === '/builds' && req.method === 'POST') {
        const jenkins = createJenkins(connection)
        let jobUrl = typeof body.url === 'string' ? body.url.trim() : ''
        if (!jobUrl) {
          const jobs = await jenkins.listJobs()
          jobUrl = resolveJob(jobs, body.job).url
        }
        const builds = await jenkins.listBuilds(jobUrl, body.limit)
        sendJson(res, 200, { ok: true, builds })
        return
      }

      if (route === '/queue' && req.method === 'POST') {
        const items = await createJenkins(connection).listQueue()
        sendJson(res, 200, { ok: true, items })
        return
      }

      if (route === '/build' && req.method === 'POST') {
        const jenkins = createJenkins(connection)
        let jobUrl = typeof body.url === 'string' ? body.url.trim() : ''
        let name = typeof body.job === 'string' ? body.job : ''
        if (!jobUrl) {
          const job = resolveJob(await jenkins.listJobs(), name)
          jobUrl = job.url
          name = job.name
        }
        const result = await jenkins.triggerBuild(jobUrl, body.params)
        sendJson(res, 200, { ok: true, job: name, connection: publicConnection(connection), ...result })
        return
      }

      sendJson(res, 404, { ok: false, error: `未知接口：${route}` })
    } catch (error) {
      sendJson(res, 200, { ok: false, error: errorMessage(error) })
    }
  }
}

/* ---------------------------------------------------------------------- tools */

const textOutput = {
  schema: { type: 'object', additionalProperties: true },
  render(_args, value) {
    return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
  },
}

function describeJob(job) {
  return {
    name: job.name,
    url: job.url,
    color: job.color,
    lastBuild: job.lastBuild,
  }
}

export function apply(ctx, config) {
  const store = {
    state: loadState(config),
    manager: () => (typeof ctx.get === 'function' ? ctx.get('pluginManager') : null),
  }
  const handle = createRouteHandler(store)

  const connectionParam = {
    type: 'string',
    description: 'Connection id or name. Omit it to use the active connection.',
  }

  ctx.inject(['webServer'], (scoped) => {
    scoped.effect(
      () =>
        scoped.webServer.register({
          kind: 'prefix',
          path: ROUTE_PREFIX,
          handler: (req, res) => {
            void handle(req, res)
          },
        }),
      'jenkins-routes',
    )
  })

  ctx.inject(['tools'], (scoped) => {
    const definitions = [
      {
        name: 'jenkins_connections',
        description:
          'List the configured Jenkins connections: id, name, base URL, user name, whether a token is stored, and which connection is active. Tokens themselves are never returned.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        output: textOutput,
        async execute() {
          return { ok: true, ...publicState(store.state) }
        },
      },
      {
        name: 'jenkins_configure',
        description:
          'Create or update one Jenkins connection among several. Pass `connection` (id or name) to update an existing one, or just `name` plus the details to add a new one; a new or `setActive: true` connection becomes the active one. The token is stored in the plugin settings file and never returned by reads.',
        parameters: {
          type: 'object',
          properties: {
            connection: connectionParam,
            name: { type: 'string', description: 'Display name, e.g. 公司机房 or 测试环境. Used to address the connection later.' },
            baseUrl: { type: 'string', description: 'Jenkins root URL, for example http://ci.example.com:8080 or http://host/jenkins.' },
            username: { type: 'string', description: 'Jenkins user name.' },
            token: { type: 'string', description: 'Jenkins API token (or password for older servers).' },
            insecureTls: { type: 'boolean', description: 'Accept self-signed HTTPS certificates. Defaults to the current value.' },
            jobFilter: { type: 'string', description: 'Only list job names containing this text. Empty lists everything.' },
            setActive: { type: 'boolean', description: 'Make this connection the active one.' },
          },
          additionalProperties: false,
        },
        output: textOutput,
        async execute(args) {
          const input = args && typeof args === 'object' ? args : {}
          const state = store.state
          const reference = typeof input.connection === 'string' ? input.connection.trim() : ''
          let target = null
          if (reference) {
            target = resolveConnection(state, reference)
          } else if (typeof input.name === 'string' && input.name.trim()) {
            const wanted = input.name.trim().toLowerCase()
            target = state.connections.find((entry) => entry.name.toLowerCase() === wanted) || null
          }
          const merged = coerceConnection(
            {
              id: target ? target.id : undefined,
              name: typeof input.name === 'string' && input.name.trim() ? input.name : target ? target.name : '',
              baseUrl: typeof input.baseUrl === 'string' ? input.baseUrl : target ? target.baseUrl : '',
              username: typeof input.username === 'string' ? input.username : target ? target.username : '',
              token: typeof input.token === 'string' && input.token.length > 0 ? input.token : target ? target.token : '',
              insecureTls: typeof input.insecureTls === 'boolean' ? input.insecureTls : target ? target.insecureTls : true,
              jobFilter: typeof input.jobFilter === 'string' ? input.jobFilter : target ? target.jobFilter : '',
            },
            target ? target.name : `连接 ${state.connections.length + 1}`,
          )
          merged.baseUrl = normalizeBaseUrl(merged.baseUrl)
          if (target) {
            state.connections = state.connections.map((entry) => (entry.id === target.id ? merged : entry))
          } else {
            state.connections = [...state.connections, merged]
          }
          if (!target || input.setActive === true) state.activeId = merged.id
          const file = persistState(state)
          let probe
          try {
            probe = await createJenkins(merged).testConnection()
          } catch (error) {
            return {
              ok: false,
              saved: true,
              savedTo: file,
              connection: publicConnection(merged),
              error: errorMessage(error),
              ...publicState(state),
            }
          }
          return { ok: true, savedTo: file, connection: publicConnection(merged), probe, ...publicState(state) }
        },
      },
      {
        name: 'jenkins_list_jobs',
        description:
          'List Jenkins jobs (including jobs inside folders) with their last build number, result, and timestamp. Requires a configured connection.',
        parameters: {
          type: 'object',
          properties: { connection: connectionParam },
          additionalProperties: false,
        },
        output: textOutput,
        async execute(args) {
          const connection = resolveConnection(store.state, args && args.connection)
          const jobs = await createJenkins(connection).listJobs()
          return { ok: true, connection: publicConnection(connection), count: jobs.length, jobs: jobs.map(describeJob) }
        },
      },
      {
        name: 'jenkins_queue',
        description: 'List the items currently waiting in the Jenkins build queue, with the reason each one is waiting.',
        parameters: {
          type: 'object',
          properties: { connection: connectionParam },
          additionalProperties: false,
        },
        output: textOutput,
        async execute(args) {
          const connection = resolveConnection(store.state, args && args.connection)
          const items = await createJenkins(connection).listQueue()
          return { ok: true, connection: publicConnection(connection), count: items.length, items }
        },
      },
      {
        name: 'jenkins_builds',
        description: 'List recent builds of one Jenkins job, newest first, with result, duration, and timestamp.',
        parameters: {
          type: 'object',
          properties: {
            job: { type: 'string', description: 'Job name, folder path such as folder/job, or a trailing part of the name.' },
            limit: { type: 'integer', minimum: 1, maximum: 25, description: 'How many builds to return. Defaults to 8.' },
            connection: connectionParam,
          },
          required: ['job'],
          additionalProperties: false,
        },
        output: textOutput,
        async execute(args) {
          const connection = resolveConnection(store.state, args && args.connection)
          const jenkins = createJenkins(connection)
          const job = resolveJob(await jenkins.listJobs(), args && args.job)
          const builds = await jenkins.listBuilds(job.url, args && args.limit)
          return { ok: true, connection: publicConnection(connection), job: { name: job.name, url: job.url }, builds }
        },
      },
      {
        name: 'jenkins_build',
        description:
          'Trigger a build of one Jenkins job and return the queue URL. For a parameterized job, omitting params builds with each parameter’s declared default value; pass params only when a non-default value is really required.',
        parameters: {
          type: 'object',
          properties: {
            job: { type: 'string', description: 'Job name, folder path such as folder/job, or a trailing part of the name.' },
            params: {
              type: 'object',
              description:
                'Optional parameter overrides. Omit it to build with the job’s declared defaults (read from parameterDefinitions).',
              additionalProperties: true,
            },
            connection: connectionParam,
          },
          required: ['job'],
          additionalProperties: false,
        },
        output: textOutput,
        async execute(args) {
          const connection = resolveConnection(store.state, args && args.connection)
          const jenkins = createJenkins(connection)
          const job = resolveJob(await jenkins.listJobs(), args && args.job)
          const result = await jenkins.triggerBuild(job.url, args && args.params)
          return { ok: true, connection: publicConnection(connection), job: { name: job.name, url: job.url }, ...result }
        },
      },
    ]

    scoped.effect(() => {
      const disposers = definitions.map((definition) => scoped.tools.register(definition))
      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch (error) {
            warn(`注销工具失败：${errorMessage(error)}`)
          }
        }
      }
    }, 'jenkins-tools')
  })
}

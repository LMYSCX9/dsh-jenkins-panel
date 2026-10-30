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

function coerceSettings(input) {
  const raw = input && typeof input === 'object' ? input : {}
  return {
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '',
    username: typeof raw.username === 'string' ? raw.username.trim() : '',
    token: typeof raw.token === 'string' ? raw.token.trim() : '',
    insecureTls: raw.insecureTls !== false,
    jobFilter: typeof raw.jobFilter === 'string' ? raw.jobFilter.trim() : '',
  }
}

function loadSettings(config) {
  let stored = null
  const file = settingsFile()
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed && typeof parsed === 'object') stored = parsed
  } catch (error) {
    if (error && error.code !== 'ENOENT') warn(`读取设置文件失败（${file}）：${errorMessage(error)}`)
  }
  const merged = { ...coerceSettings(config), ...(stored || {}) }
  return coerceSettings(merged)
}

function persistSettings(settings) {
  const file = settingsFile()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    /* an inherited ACL may refuse chmod; the content is already written */
  }
  return file
}

function publicSettings(settings) {
  return {
    baseUrl: settings.baseUrl,
    username: settings.username,
    hasToken: settings.token.length > 0,
    insecureTls: settings.insecureTls,
    jobFilter: settings.jobFilter,
    settingsFile: settingsFile(),
    configured: normalizeBaseUrlOrEmpty(settings.baseUrl) !== '',
  }
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

  async function triggerBuild(jobUrl, params) {
    const payload = params && typeof params === 'object' ? params : {}
    const keys = Object.keys(payload)
    const crumb = keys.length > 0 ? await readCrumb() : null
    const target = `${ensureTrailingSlash(jobUrl)}${keys.length > 0 ? 'buildWithParameters' : 'build'}`
    const body = keys.length > 0 ? new URLSearchParams(Object.entries(payload).map(([key, value]) => [key, String(value)])).toString() : undefined
    const response = await call(target, { method: 'POST', body, crumb, accept: 'text/plain, */*' })
    if (response.status === 401 || response.status === 403) {
      throw new Error('触发构建失败：认证未通过或当前账号没有构建权限')
    }
    if (response.status >= 400) {
      throw new Error(`触发构建失败：HTTP ${response.status}${snippet(response.text) ? `，${snippet(response.text)}` : ''}`)
    }
    let queueUrl = ''
    if (response.location) {
      try {
        queueUrl = new URL(response.location, target).toString()
      } catch {
        queueUrl = ''
      }
    }
    return { queued: true, queueUrl }
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

function createRouteHandler(state) {
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
      if (route === '/state' && req.method === 'GET') {
        sendJson(res, 200, { ok: true, settings: publicSettings(state.settings) })
        return
      }

      const body = req.method === 'POST' ? await readJsonBody(req) : {}
      const settings = state.settings

      if (route === '/settings' && req.method === 'POST') {
        const next = coerceSettings({
          baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : settings.baseUrl,
          username: typeof body.username === 'string' ? body.username : settings.username,
          token: typeof body.token === 'string' && body.token.length > 0 ? body.token : settings.token,
          insecureTls: typeof body.insecureTls === 'boolean' ? body.insecureTls : settings.insecureTls,
          jobFilter: typeof body.jobFilter === 'string' ? body.jobFilter : settings.jobFilter,
        })
        if (body.clearToken === true) next.token = ''
        next.baseUrl = normalizeBaseUrl(next.baseUrl)
        state.settings = next
        const file = persistSettings(next)
        sendJson(res, 200, { ok: true, settings: publicSettings(next), savedTo: file })
        return
      }

      if (route === '/test' && req.method === 'POST') {
        const result = await createJenkins(settings).testConnection()
        sendJson(res, 200, { ok: true, ...result, settings: publicSettings(settings) })
        return
      }

      if (route === '/jobs' && req.method === 'POST') {
        const jenkins = createJenkins(settings)
        const jobs = await jenkins.listJobs()
        sendJson(res, 200, { ok: true, jobs, baseUrl: jenkins.baseUrl, fetchedAt: Date.now() })
        return
      }

      if (route === '/builds' && req.method === 'POST') {
        const jenkins = createJenkins(settings)
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
        const items = await createJenkins(settings).listQueue()
        sendJson(res, 200, { ok: true, items })
        return
      }

      if (route === '/build' && req.method === 'POST') {
        const jenkins = createJenkins(settings)
        let jobUrl = typeof body.url === 'string' ? body.url.trim() : ''
        let name = typeof body.job === 'string' ? body.job : ''
        if (!jobUrl) {
          const job = resolveJob(await jenkins.listJobs(), name)
          jobUrl = job.url
          name = job.name
        }
        const result = await jenkins.triggerBuild(jobUrl, body.params)
        sendJson(res, 200, { ok: true, job: name, ...result })
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
  const state = { settings: loadSettings(config) }
  const handle = createRouteHandler(state)

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
        name: 'jenkins_configure',
        description:
          'Save the Jenkins connection used by the Jenkins sidebar panel and by the other jenkins_* tools: base URL, user name, API token, self-signed-certificate tolerance, and an optional job filter. The token is stored in the plugin settings file and never returned by reads.',
        parameters: {
          type: 'object',
          properties: {
            baseUrl: { type: 'string', description: 'Jenkins root URL, for example http://ci.example.com:8080 or http://host/jenkins.' },
            username: { type: 'string', description: 'Jenkins user name.' },
            token: { type: 'string', description: 'Jenkins API token (or password for older servers).' },
            insecureTls: { type: 'boolean', description: 'Accept self-signed HTTPS certificates. Defaults to the current value.' },
            jobFilter: { type: 'string', description: 'Only list job names containing this text. Empty lists everything.' },
          },
          required: ['baseUrl'],
          additionalProperties: false,
        },
        output: textOutput,
        async execute(args) {
          const next = coerceSettings({
            ...state.settings,
            ...(args && typeof args === 'object' ? args : {}),
          })
          next.baseUrl = normalizeBaseUrl(next.baseUrl)
          state.settings = next
          const file = persistSettings(next)
          let connection
          try {
            connection = await createJenkins(next).testConnection()
          } catch (error) {
            return { ok: false, saved: true, savedTo: file, error: errorMessage(error), settings: publicSettings(next) }
          }
          return { ok: true, savedTo: file, connection, settings: publicSettings(next) }
        },
      },
      {
        name: 'jenkins_list_jobs',
        description: 'List Jenkins jobs (including jobs inside folders) with their last build number, result, and timestamp. Requires a configured connection.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        output: textOutput,
        async execute() {
          const jobs = await createJenkins(state.settings).listJobs()
          return { ok: true, count: jobs.length, jobs: jobs.map(describeJob) }
        },
      },
      {
        name: 'jenkins_queue',
        description: 'List the items currently waiting in the Jenkins build queue, with the reason each one is waiting.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        output: textOutput,
        async execute() {
          const items = await createJenkins(state.settings).listQueue()
          return { ok: true, count: items.length, items }
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
          },
          required: ['job'],
          additionalProperties: false,
        },
        output: textOutput,
        async execute(args) {
          const jenkins = createJenkins(state.settings)
          const job = resolveJob(await jenkins.listJobs(), args && args.job)
          const builds = await jenkins.listBuilds(job.url, args && args.limit)
          return { ok: true, job: { name: job.name, url: job.url }, builds }
        },
      },
      {
        name: 'jenkins_build',
        description: 'Trigger a build of one Jenkins job. Returns the queue URL Jenkins created so the build can be followed with jenkins_builds.',
        parameters: {
          type: 'object',
          properties: {
            job: { type: 'string', description: 'Job name, folder path such as folder/job, or a trailing part of the name.' },
            params: {
              type: 'object',
              description: 'Optional build parameters. When present the job is started with buildWithParameters.',
              additionalProperties: true,
            },
          },
          required: ['job'],
          additionalProperties: false,
        },
        output: textOutput,
        async execute(args) {
          const jenkins = createJenkins(state.settings)
          const job = resolveJob(await jenkins.listJobs(), args && args.job)
          const result = await jenkins.triggerBuild(job.url, args && args.params)
          return { ok: true, job: { name: job.name, url: job.url }, ...result }
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

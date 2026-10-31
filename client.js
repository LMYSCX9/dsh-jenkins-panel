/**
 * Client half of the Jenkins plugin.
 *
 * Registers the sidebar icon under `sidebar.panellist` (whose list id addresses the
 * `main` panel slot), and renders the Jenkins page. Host work happens behind the
 * `/dsh-jenkins` HTTP route registered by index.js.
 */
window.__ModuleLoader__.load({
  id: 'dsh-jenkins-panel',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const ROUTE = '/dsh-jenkins'

    /* ------------------------------------------------------------------ i18n */

    const STRINGS = {
      zh: {
        nav: 'Jenkins',
        title: 'Jenkins',
        subtitle: '连接 Jenkins，查询任务并触发构建',
        connected: '已连接',
        notConnected: '未连接',
        connectHint: '尚未配置 Jenkins 地址',
        pickJob: 'Jenkins 任务',
        pickJobEmpty: '没有任务',
        pickJobHint: '去面板配置',
        buildSubmitted: '已提交构建',
        defaultParams: '默认参数',
        connection: '连接设置',
        connName: '连接名称',
        connNamePlaceholder: '如 公司机房 / 测试环境',
        addConn: '新增连接',
        removeConn: '删除',
        removeConfirm: '确定删除这个 Jenkins 连接？',
        checkUpdate: '检查更新',
        checkingUpdate: '检查中…',
        updating: '更新中…',
        applyUpdate: '更新到',
        updateAvailable: '发现新版本',
        upToDate: '已是最新版本',
        updateDone: '更新完成',
        updateRestart: '更新已安装，重启 DSH 后生效',
        collapse: '收起',
        expand: '展开',
        baseUrl: 'Jenkins 地址',
        baseUrlPlaceholder: 'http://ci.example.com:8080 或 http://host/jenkins',
        username: '用户名',
        usernamePlaceholder: 'Jenkins 账号',
        token: 'API Token',
        tokenPlaceholder: '粘贴令牌',
        tokenSaved: '已保存，留空表示不修改',
        insecureTls: '信任自签名证书（HTTPS）',
        jobFilter: '任务过滤（可选）',
        jobFilterPlaceholder: '只显示名称包含此文本的任务',
        saveAndConnect: '保存并连接',
        saving: '保存中…',
        testing: '测试中…',
        test: '测试连接',
        clearToken: '清除 Token',
        settingsPath: '凭据保存在',
        jobs: '任务',
        queue: '构建队列',
        search: '搜索任务…',
        refresh: '刷新',
        refreshing: '刷新中…',
        empty: '暂无任务',
        emptyHint: '填写连接信息后点击「保存并连接」。',
        noMatch: '没有匹配的任务',
        build: '构建',
        building: '构建中…',
        history: '历史',
        hideHistory: '收起',
        noBuilds: '没有构建记录',
        noBuild: '暂无构建',
        queueEmpty: '队列为空',
        waiting: '排队中',
        blocked: '被阻塞',
        buildStarted: '已提交构建',
        buildQueuedAt: '构建已进入队列',
        testOk: '连接成功',
        saved: '设置已保存',
        loading: '加载中…',
        success: '成功',
        failure: '失败',
        unstable: '不稳定',
        aborted: '已中断',
        buildingNow: '构建中',
        notBuilt: '未构建',
        disabled: '已禁用',
        unknown: '未知',
        idle: '空闲',
        justNow: '刚刚',
        minutesAgo: '{n} 分钟前',
        hoursAgo: '{n} 小时前',
        daysAgo: '{n} 天前',
        seconds: '{n} 秒',
      },
      en: {
        nav: 'Jenkins',
        title: 'Jenkins',
        subtitle: 'Connect a Jenkins server, browse jobs, and trigger builds',
        connected: 'Connected',
        notConnected: 'Not connected',
        connectHint: 'No Jenkins URL configured yet',
        pickJob: 'Jenkins job',
        pickJobEmpty: 'No jobs',
        pickJobHint: 'Configure in the panel',
        buildSubmitted: 'Build submitted',
        defaultParams: 'default parameters',
        connection: 'Connection',
        connName: 'Name',
        connNamePlaceholder: 'e.g. office / staging',
        addConn: 'Add connection',
        removeConn: 'Remove',
        removeConfirm: 'Remove this Jenkins connection?',
        checkUpdate: 'Check for updates',
        checkingUpdate: 'Checking…',
        updating: 'Updating…',
        applyUpdate: 'Update to',
        updateAvailable: 'New version',
        upToDate: 'Up to date',
        updateDone: 'Update installed',
        updateRestart: 'Installed — restart DSH to finish',
        collapse: 'Collapse',
        expand: 'Edit',
        baseUrl: 'Jenkins URL',
        baseUrlPlaceholder: 'http://ci.example.com:8080 or http://host/jenkins',
        username: 'User name',
        usernamePlaceholder: 'Jenkins account',
        token: 'API token',
        tokenPlaceholder: 'Paste token',
        tokenSaved: 'Saved — leave empty to keep it',
        insecureTls: 'Trust self-signed certificates (HTTPS)',
        jobFilter: 'Job filter (optional)',
        jobFilterPlaceholder: 'Only list jobs whose name contains this',
        saveAndConnect: 'Save and connect',
        saving: 'Saving…',
        testing: 'Testing…',
        test: 'Test connection',
        clearToken: 'Clear token',
        settingsPath: 'Credentials are stored in',
        jobs: 'Jobs',
        queue: 'Build queue',
        search: 'Search jobs…',
        refresh: 'Refresh',
        refreshing: 'Refreshing…',
        empty: 'No jobs',
        emptyHint: 'Fill in the connection details and choose “Save and connect”.',
        noMatch: 'No matching job',
        build: 'Build',
        building: 'Starting…',
        history: 'History',
        hideHistory: 'Hide',
        noBuilds: 'No build records',
        noBuild: 'No build yet',
        queueEmpty: 'The queue is empty',
        waiting: 'Waiting',
        blocked: 'Blocked',
        buildStarted: 'Build submitted',
        buildQueuedAt: 'Build queued',
        testOk: 'Connection succeeded',
        saved: 'Settings saved',
        loading: 'Loading…',
        success: 'Success',
        failure: 'Failure',
        unstable: 'Unstable',
        aborted: 'Aborted',
        buildingNow: 'Building',
        notBuilt: 'Not built',
        disabled: 'Disabled',
        unknown: 'Unknown',
        idle: 'Idle',
        justNow: 'just now',
        minutesAgo: '{n} min ago',
        hoursAgo: '{n} h ago',
        daysAgo: '{n} d ago',
        seconds: '{n}s',
      },
    }

    let localeService = null
    let layoutService = null
    let activeLocale = 'en'

    function syncLocale() {
      try {
        const snapshot = localeService && typeof localeService.getLocale === 'function' ? localeService.getLocale() : null
        const id = snapshot && typeof snapshot.active === 'string' ? snapshot.active.toLowerCase() : ''
        activeLocale = id.startsWith('zh') ? 'zh' : 'en'
      } catch {
        activeLocale = 'en'
      }
    }

    function t(key, vars) {
      const dict = STRINGS[activeLocale] || STRINGS.en
      let text = dict[key]
      if (text === undefined) text = STRINGS.en[key]
      if (text === undefined) text = key
      if (vars) {
        for (const name of Object.keys(vars)) text = text.split(`{${name}}`).join(String(vars[name]))
      }
      return text
    }

    function useLocale() {
      const [, bump] = useState(0)
      useEffect(() => {
        syncLocale()
        bump((n) => n + 1)
        if (!localeService || typeof localeService.subscribe !== 'function') return undefined
        let dispose = null
        try {
          dispose = localeService.subscribe(() => {
            syncLocale()
            bump((n) => n + 1)
          })
        } catch {
          dispose = null
        }
        return () => {
          if (typeof dispose === 'function') {
            try {
              dispose()
            } catch {
              /* already gone */
            }
          }
        }
      }, [])
      syncLocale()
    }

    /* ------------------------------------------------------------------- api */

    async function callApi(path, body) {
      const init = body === undefined
        ? { method: 'GET', headers: { accept: 'application/json' } }
        : {
            method: 'POST',
            headers: { accept: 'application/json', 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
      let response
      try {
        response = await fetch(`${ROUTE}${path}`, init)
      } catch (error) {
        throw new Error(`无法访问插件接口：${error && error.message ? error.message : error}`)
      }
      const text = await response.text()
      let data = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        throw new Error(`插件接口返回了非 JSON 内容（HTTP ${response.status}）`)
      }
      if (!response.ok && (!data || typeof data !== 'object')) {
        throw new Error(`插件接口请求失败（HTTP ${response.status}）`)
      }
      return data || {}
    }

    /* --------------------------------------------------------------- helpers */

    function stateOf(color) {
      const value = String(color || 'grey')
      const building = value.endsWith('_anime')
      const base = building ? value.slice(0, -'_anime'.length) : value
      let state = 'idle'
      if (base.startsWith('disabled')) state = 'disabled'
      else if (base.startsWith('blue')) state = 'success'
      else if (base.startsWith('red')) state = 'failure'
      else if (base.startsWith('yellow')) state = 'unstable'
      else if (base.startsWith('aborted')) state = 'aborted'
      else if (base === 'notbuilt') state = 'idle'
      if (building) return 'running'
      return state
    }

    function resultLabel(result, building) {
      if (building) return t('buildingNow')
      if (!result) return t('notBuilt')
      switch (result) {
        case 'SUCCESS':
          return t('success')
        case 'FAILURE':
          return t('failure')
        case 'UNSTABLE':
          return t('unstable')
        case 'ABORTED':
          return t('aborted')
        default:
          return result
      }
    }

    function formatRelative(timestamp) {
      if (!timestamp) return ''
      const delta = Date.now() - timestamp
      if (delta < 45 * 1000) return t('justNow')
      const minutes = Math.round(delta / 60000)
      if (minutes < 60) return t('minutesAgo', { n: minutes })
      const hours = Math.round(minutes / 60)
      if (hours < 24) return t('hoursAgo', { n: hours })
      return t('daysAgo', { n: Math.round(hours / 24) })
    }

    function formatDuration(ms) {
      if (!ms || ms < 0) return ''
      const seconds = Math.round(ms / 1000)
      if (seconds < 60) return t('seconds', { n: seconds })
      const minutes = Math.floor(seconds / 60)
      const rest = seconds % 60
      return `${minutes}m ${rest}s`
    }

    /* --------------------------------------------------------------- styling */

    const CSS = `
.djl-root { height: 100%; overflow: auto; box-sizing: border-box; padding: 28px 24px 56px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-family: inherit; font-size: 13px; line-height: 1.5; }
.djl-inner { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.djl-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.djl-title { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
.djl-sub { margin: 4px 0 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.djl-head-right { display: flex; align-items: center; gap: 8px; }
.djl-chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px;
  border-radius: 999px; font-size: 12px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.djl-chip-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
.djl-chip[data-on="true"] .djl-chip-dot { background: var(--dsw-alias-state-success-primary); }
.djl-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px; overflow: hidden; }
.djl-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 16px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.djl-card-head h2 { margin: 0; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.djl-connbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.djl-select { width: auto; min-width: 160px; max-width: 240px; height: 30px; }
.djl-update { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: -6px;
  font-size: 12px; color: var(--dsw-alias-label-secondary); }
.djl-update .djl-btn { height: 26px; padding: 0 10px; font-size: 11px; }
.djl-version { font-variant-numeric: tabular-nums; }
.djl-update-text { font-size: 11px; color: var(--dsw-alias-label-secondary);
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.djl-count { font-weight: 400; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.djl-card-body { padding: 16px; }
.djl-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
.djl-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.djl-field > span { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.djl-span2 { grid-column: 1 / -1; }
.djl-input { height: 32px; padding: 0 10px; font-size: 13px; font-family: inherit;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; outline: none; min-width: 0; }
.djl-input:focus { border-color: var(--dsw-alias-brand-primary); }
.djl-input::placeholder { color: var(--dsw-alias-label-secondary); opacity: 0.8; }
.djl-check { display: flex; align-items: center; gap: 8px; font-size: 12px;
  color: var(--dsw-alias-label-secondary); grid-column: 1 / -1; }
.djl-check input { accent-color: var(--dsw-alias-brand-primary); }
.djl-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; grid-column: 1 / -1; }
.djl-btn { height: 30px; padding: 0 14px; border-radius: 8px; font-size: 12px; font-family: inherit;
  cursor: pointer; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
  transition: border-color 120ms ease, opacity 120ms ease; }
.djl-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
.djl-btn:disabled { opacity: 0.55; cursor: default; }
.djl-btn-primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: #fff; }
.djl-btn-quiet { background: transparent; color: var(--dsw-alias-label-secondary); }
.djl-hint { margin: 0; grid-column: 1 / -1; font-size: 11px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.djl-banner { border-radius: 10px; padding: 10px 14px; font-size: 12px; border: 1px solid; }
.djl-banner[data-kind="error"] { color: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary); background: transparent; }
.djl-banner[data-kind="ok"] { color: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-primary); background: transparent; }
.djl-search { height: 28px; width: 200px; max-width: 40vw; padding: 0 10px; font-size: 12px;
  font-family: inherit; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; outline: none; }
.djl-search:focus { border-color: var(--dsw-alias-brand-primary); }
.djl-list { list-style: none; margin: 0; padding: 0; }
.djl-job { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center;
  gap: 10px; padding: 9px 16px; border-top: 1px solid var(--dsw-alias-border-l1); }
.djl-job:first-child { border-top: none; }
.djl-job:hover { background: var(--dsw-alias-bg-layer-2); }
.djl-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
.djl-dot[data-state="success"] { background: var(--dsw-alias-state-success-primary); }
.djl-dot[data-state="failure"] { background: var(--dsw-alias-state-error-primary); }
.djl-dot[data-state="unstable"] { background: var(--dsw-alias-state-warn-primary); }
.djl-dot[data-state="running"] { background: var(--dsw-alias-brand-primary); }
.djl-dot[data-state="disabled"] { background: var(--dsw-alias-border-l2); }
.djl-job-main { min-width: 0; }
.djl-job-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.djl-job-meta { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 1px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.djl-job-actions { display: flex; align-items: center; gap: 6px; }
.djl-job-actions .djl-btn { height: 26px; padding: 0 10px; font-size: 12px; }
.djl-builds { grid-column: 1 / -1; padding: 4px 0 6px 20px; }
.djl-build-row { display: flex; align-items: center; gap: 10px; font-size: 11px;
  color: var(--dsw-alias-label-secondary); padding: 3px 0; }
.djl-build-num { color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; min-width: 44px; }
.djl-empty { padding: 22px 16px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.djl-queue-row { display: flex; align-items: baseline; gap: 10px; padding: 7px 16px;
  border-top: 1px solid var(--dsw-alias-border-l1); font-size: 12px; }
.djl-queue-row:first-child { border-top: none; }
.djl-queue-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.djl-queue-why { color: var(--dsw-alias-label-secondary); font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.djl-busy { display: inline-block; width: 10px; height: 10px; margin-right: 6px; vertical-align: -1px;
  border: 1.5px solid var(--dsw-alias-border-l2); border-top-color: var(--dsw-alias-brand-primary);
  border-radius: 50%; animation: djl-spin 700ms linear infinite; }
@keyframes djl-spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) { .djl-form { grid-template-columns: 1fr; } .djl-root { padding: 18px 14px 40px; } }
`

    /* --------------------------------------------------------------- sidebar */

    function JenkinsIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 20
      const active = !!(props && props.active)
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block', color: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor' },
        },
        h('path', {
          d: 'M12 2.75v3M12 18.25v3M2.75 12h3M18.25 12h3M5.4 5.4l2.1 2.1M16.5 16.5l2.1 2.1M18.6 5.4l-2.1 2.1M7.5 16.5l-2.1 2.1',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
        h('circle', { cx: 12, cy: 12, r: 4.6, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 }),
        h('circle', { cx: 12, cy: 12, r: 1.5, fill: 'currentColor' }),
      )
    }

    /* ------------------------------------------------------- hero job picker */

    const PICKER_CSS = `
.djq-root { position: relative; display: inline-flex; align-items: center; gap: 4px; }
.djq-chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px 0 7px;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; max-width: 220px; }
.djq-chip:hover { border-color: var(--dsw-alias-border-l2); }
.djq-chip[data-open="true"] { border-color: var(--dsw-alias-brand-primary); }
.djq-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); flex: none; }
.djq-dot[data-state="success"] { background: var(--dsw-alias-state-success-primary); }
.djq-dot[data-state="failure"] { background: var(--dsw-alias-state-error-primary); }
.djq-dot[data-state="unstable"] { background: var(--dsw-alias-state-warn-primary); }
.djq-dot[data-state="running"] { background: var(--dsw-alias-brand-primary); }
.djq-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.djq-caret { color: var(--dsw-alias-label-secondary); font-size: 10px; flex: none; }
.djq-build { height: 24px; min-width: 24px; padding: 0 6px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); font-size: 11px; font-family: inherit; }
.djq-build:disabled { opacity: .55; cursor: default; }
.djq-note { font-size: 11px; color: var(--dsw-alias-label-secondary); max-width: 190px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.djq-pop { position: absolute; bottom: calc(100% + 8px); left: 0; z-index: 40; width: 320px; max-width: 74vw;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18); padding: 8px; display: flex; flex-direction: column; gap: 6px;
  box-sizing: border-box; }
.djq-search { height: 28px; padding: 0 8px; font: inherit; font-size: 12px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary); outline: none; }
.djq-search:focus { border-color: var(--dsw-alias-brand-primary); }
.djq-list { max-height: 240px; overflow: auto; display: flex; flex-direction: column; }
.djq-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px;
  cursor: pointer; font-size: 12px; text-align: left; background: transparent; border: 0;
  color: inherit; font-family: inherit; width: 100%; box-sizing: border-box; }
.djq-row:hover { background: var(--dsw-alias-bg-layer-2); }
.djq-row[data-active="true"] { background: var(--dsw-alias-bg-layer-2); }
.djq-rowmain { min-width: 0; display: flex; flex-direction: column; }
.djq-rowname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.djq-rowmeta { font-size: 10px; color: var(--dsw-alias-label-secondary); }
.djq-empty { padding: 12px 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); text-align: center;
  display: flex; flex-direction: column; gap: 8px; align-items: center; }
.djq-link { background: transparent; border: 0; padding: 0; font: inherit; font-size: 12px;
  color: var(--dsw-alias-brand-primary); cursor: pointer; text-decoration: underline; }
`

    function JenkinsJobPicker() {
      useLocale()
      const [open, setOpen] = useState(false)
      const [jobs, setJobs] = useState(null)
      const [error, setError] = useState('')
      const [selected, setSelected] = useState(null)
      const [busy, setBusy] = useState(false)
      const [note, setNote] = useState('')
      const [query, setQuery] = useState('')
      const rootRef = useRef(null)

      const load = useCallback(async () => {
        setError('')
        setJobs(null)
        try {
          const result = await callApi('/jobs', {})
          if (!result.ok) {
            setJobs([])
            setError(result.error || t('pickJobEmpty'))
            return
          }
          setJobs(Array.isArray(result.jobs) ? result.jobs : [])
        } catch (caught) {
          setJobs([])
          setError(caught && caught.message ? caught.message : String(caught))
        }
      }, [])

      const toggle = useCallback(() => {
        setOpen((value) => {
          const next = !value
          if (next) void load()
          return next
        })
      }, [load])

      useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
      }, [open])

      const submit = useCallback(async (job) => {
        setBusy(true)
        setNote('')
        try {
          const result = await callApi('/build', { job: job.name, url: job.url })
          if (!result.ok) throw new Error(result.error || '触发构建失败')
          setNote(`${t('buildSubmitted')} · ${job.name}${result.usedDefaults ? ` · ${t('defaultParams')}` : ''}`)
        } catch (caught) {
          setNote(caught && caught.message ? caught.message : String(caught))
        } finally {
          setBusy(false)
        }
      }, [])

      const filtered = useMemo(() => {
        const list = jobs || []
        const needle = query.trim().toLowerCase()
        if (!needle) return list
        return list.filter((job) => job.name.toLowerCase().includes(needle))
      }, [jobs, query])

      const openPanel = () => {
        setOpen(false)
        if (layoutService && typeof layoutService.selectPanel === 'function') {
          try {
            layoutService.selectPanel('jenkins')
          } catch {
            /* the panel may be unavailable in this composition */
          }
        }
      }

      let body
      if (jobs === null) {
        body = h('div', { className: 'djq-empty' }, t('loading'))
      } else if (error) {
        body = h(
          'div',
          { className: 'djq-empty' },
          h('span', null, error),
          h('button', { className: 'djq-link', type: 'button', onClick: openPanel }, t('pickJobHint')),
        )
      } else if (filtered.length === 0) {
        body = h('div', { className: 'djq-empty' }, query ? t('noMatch') : t('pickJobEmpty'))
      } else {
        body = h(
          'div',
          { className: 'djq-list' },
          filtered.map((job) =>
            h(
              'button',
              {
                key: job.name,
                type: 'button',
                className: 'djq-row',
                'data-active': selected && selected.name === job.name ? 'true' : 'false',
                onClick: () => {
                  setSelected(job)
                  setOpen(false)
                  setNote('')
                },
              },
              h('span', { className: 'djq-dot', 'data-state': stateOf(job.color) }),
              h(
                'div',
                { className: 'djq-rowmain' },
                h('span', { className: 'djq-rowname' }, job.name),
                h(
                  'span',
                  { className: 'djq-rowmeta' },
                  job.lastBuild
                    ? `#${job.lastBuild.number === null ? '?' : job.lastBuild.number} · ${resultLabel(job.lastBuild.result, job.lastBuild.building)} · ${formatRelative(job.lastBuild.timestamp)}`
                    : t('noBuild'),
                ),
              ),
            ),
          ),
        )
      }

      return h(
        'div',
        { className: 'djq-root', ref: rootRef },
        h('style', null, PICKER_CSS),
        h(
          'button',
          {
            className: 'djq-chip',
            type: 'button',
            'data-open': open ? 'true' : 'false',
            title: selected ? selected.name : t('pickJob'),
            onClick: toggle,
          },
          h('span', { className: 'djq-dot', 'data-state': selected ? stateOf(selected.color) : 'idle' }),
          h('span', { className: 'djq-name' }, selected ? selected.name : t('pickJob')),
          h('span', { className: 'djq-caret' }, '\u25BE'),
        ),
        selected
          ? h(
              'button',
              {
                className: 'djq-build',
                type: 'button',
                title: t('build'),
                disabled: busy,
                onClick: () => void submit(selected),
              },
              busy ? '…' : '\u25B6',
            )
          : null,
        note ? h('span', { className: 'djq-note', title: note }, note) : null,
        open
          ? h(
              'div',
              { className: 'djq-pop' },
              h('input', {
                className: 'djq-search',
                value: query,
                placeholder: t('search'),
                spellCheck: false,
                onChange: (event) => setQuery(event.target.value),
              }),
              body,
            )
          : null,
      )
    }

    /* ----------------------------------------------------------------- panel */

    function JenkinsPanel() {
      useLocale()

      const [loading, setLoading] = useState(true)
      const [busy, setBusy] = useState('')
      const [banner, setBanner] = useState(null)
      const [connections, setConnections] = useState([])
      const [selectedId, setSelectedId] = useState('')
      const [settingsFile, setSettingsFile] = useState('')
      const [form, setForm] = useState({ name: '', baseUrl: '', username: '', token: '', insecureTls: true, jobFilter: '' })
      const [editing, setEditing] = useState(true)
      const [jobs, setJobs] = useState([])
      const [queue, setQueue] = useState([])
      const [search, setSearch] = useState('')
      const [expanded, setExpanded] = useState('')
      const [builds, setBuilds] = useState({})
      const [busyJob, setBusyJob] = useState('')
      const [updateInfo, setUpdateInfo] = useState(null)
      const timerRef = useRef(null)

      const settings = useMemo(
        () =>
          connections.find((item) => item.id === selectedId) || {
            id: '',
            name: '',
            baseUrl: '',
            username: '',
            hasToken: false,
            insecureTls: true,
            jobFilter: '',
            configured: false,
          },
        [connections, selectedId],
      )

      /** Adopt a /state (or connection operation) payload, focusing one connection. */
      const applyState = useCallback((payload, focusId) => {
        const list = Array.isArray(payload && payload.connections) ? payload.connections : []
        setConnections(list)
        setSettingsFile((payload && payload.settingsFile) || '')
        const pick =
          list.find((entry) => entry.id === focusId) ||
          list.find((entry) => entry.id === (payload && payload.activeId)) ||
          list[0] ||
          null
        setSelectedId(pick ? pick.id : '')
        return pick
      }, [])

      const syncedRef = useRef(null)
      useEffect(() => {
        if (syncedRef.current === selectedId) return
        syncedRef.current = selectedId
        const entry = connections.find((item) => item.id === selectedId) || null
        setForm({
          name: entry ? entry.name : '',
          baseUrl: entry ? entry.baseUrl : '',
          username: entry ? entry.username : '',
          token: '',
          insecureTls: entry ? entry.insecureTls !== false : true,
          jobFilter: entry && entry.jobFilter ? entry.jobFilter : '',
        })
        setEditing(!entry || !entry.configured)
        setJobs([])
        setQueue([])
        setExpanded('')
        setBuilds({})
        setBanner(null)
      }, [selectedId, connections])

      const loadJobsFor = useCallback(async (connId) => {
        if (!connId) return null
        const result = await callApi('/jobs', { connection: connId })
        if (!result.ok) throw new Error(result.error || '读取任务列表失败')
        setJobs(Array.isArray(result.jobs) ? result.jobs : [])
        return result
      }, [])

      const loadQueueFor = useCallback(async (connId) => {
        if (!connId) return
        try {
          const result = await callApi('/queue', { connection: connId })
          if (result.ok && Array.isArray(result.items)) setQueue(result.items)
        } catch {
          /* the queue is secondary: keep the page usable when only it fails */
        }
      }, [])

      const bootstrap = useCallback(async () => {
        setLoading(true)
        try {
          applyState(await callApi('/state'))
        } catch (error) {
          setBanner({ kind: 'error', text: error.message })
        } finally {
          setLoading(false)
        }
      }, [applyState])

      const checkUpdate = useCallback(async (silent) => {
        if (!silent) setBusy('update')
        try {
          const info = await callApi('/update')
          if (info && info.ok) {
            setUpdateInfo(info)
          } else if (!silent) {
            setBanner({ kind: 'error', text: (info && info.error) || '检查更新失败' })
          }
        } catch (error) {
          if (!silent) setBanner({ kind: 'error', text: error.message })
        } finally {
          if (!silent) setBusy('')
        }
      }, [])

      const runUpdate = useCallback(async () => {
        setBusy('updating')
        setBanner(null)
        try {
          const result = await callApi('/update/apply', {})
          if (!result.ok) throw new Error(result.error || '更新失败')
          setUpdateInfo(result)
          const application = result.result ? result.result.application : ''
          setBanner({ kind: 'ok', text: application === 'restart-required' ? t('updateRestart') : t('updateDone') })
        } catch (error) {
          setBanner({ kind: 'error', text: error.message })
        } finally {
          setBusy('')
        }
      }, [])

      useEffect(() => {
        void bootstrap()
        const updateTimer = setTimeout(() => {
          void checkUpdate(true)
        }, 900)
        return () => {
          clearTimeout(updateTimer)
          if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
        }
      }, [bootstrap, checkUpdate])

      // Load jobs and the queue whenever the selected connection becomes usable.
      useEffect(() => {
        if (!selectedId || !settings.configured) return undefined
        let cancelled = false
        void (async () => {
          try {
            await loadJobsFor(selectedId)
          } catch (error) {
            if (!cancelled) setBanner({ kind: 'error', text: error.message })
          }
          if (!cancelled) await loadQueueFor(selectedId)
        })()
        return () => {
          cancelled = true
        }
      }, [selectedId, settings.configured, loadJobsFor, loadQueueFor])

      const save = useCallback(async (event) => {
        if (event) event.preventDefault()
        setBusy('save')
        setBanner(null)
        try {
          const payload = {
            id: selectedId || undefined,
            name: form.name,
            baseUrl: form.baseUrl,
            username: form.username,
            insecureTls: form.insecureTls,
            jobFilter: form.jobFilter,
            makeActive: true,
          }
          if (form.token) payload.token = form.token
          const saved = await callApi('/connection/save', payload)
          if (!saved.ok) throw new Error(saved.error || '保存失败')
          const pick = applyState(saved, saved.id)
          setBanner({ kind: 'ok', text: `${t('saved')} · ${t('settingsPath')} ${saved.savedTo || settingsFile}` })
          setBusy('')
          const test = await callApi('/test', { connection: saved.id })
          if (!test.ok) {
            setBanner({ kind: 'error', text: test.error || '连接测试失败' })
            return
          }
          setBanner({
            kind: 'ok',
            text: `${t('testOk')} · ${test.version ? `Jenkins ${test.version}` : (pick && pick.baseUrl) || ''} · ${test.latencyMs}ms`,
          })
          setBusy('refresh')
          if (saved.id) await Promise.all([loadJobsFor(saved.id), loadQueueFor(saved.id)])
        } catch (error) {
          setBanner({ kind: 'error', text: error.message })
        } finally {
          setBusy('')
        }
      }, [form, selectedId, applyState, settingsFile, loadJobsFor, loadQueueFor])

      const test = useCallback(async () => {
        setBusy('test')
        setBanner(null)
        try {
          const payload = {
            id: selectedId || undefined,
            name: form.name,
            baseUrl: form.baseUrl,
            username: form.username,
            insecureTls: form.insecureTls,
            jobFilter: form.jobFilter,
            makeActive: true,
          }
          if (form.token) payload.token = form.token
          const saved = await callApi('/connection/save', payload)
          if (!saved.ok) throw new Error(saved.error || '保存失败')
          applyState(saved, saved.id)
          const result = await callApi('/test', { connection: saved.id })
          if (!result.ok) throw new Error(result.error || '连接测试失败')
          setBanner({
            kind: 'ok',
            text: `${t('testOk')} · ${result.version ? `Jenkins ${result.version}` : saved.connection.baseUrl} · ${result.latencyMs}ms`,
          })
        } catch (error) {
          setBanner({ kind: 'error', text: error.message })
        } finally {
          setBusy('')
        }
      }, [form, selectedId, applyState])

      const clearToken = useCallback(async () => {
        setBusy('token')
        try {
          const saved = await callApi('/connection/save', { id: selectedId, clearToken: true })
          if (!saved.ok) throw new Error(saved.error || '保存失败')
          applyState(saved, saved.id)
          setBanner({ kind: 'ok', text: t('saved') })
        } catch (error) {
          setBanner({ kind: 'error', text: error.message })
        } finally {
          setBusy('')
        }
      }, [selectedId, applyState])

      const addConnection = useCallback(() => {
        syncedRef.current = ''
        setSelectedId('')
        setForm({ name: '', baseUrl: '', username: '', token: '', insecureTls: true, jobFilter: '' })
        setEditing(true)
        setBanner(null)
      }, [])

      const removeConnection = useCallback(async () => {
        if (!selectedId) return
        if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t('removeConfirm'))) return
        setBusy('remove')
        try {
          const saved = await callApi('/connection/remove', { id: selectedId })
          if (!saved.ok) throw new Error(saved.error || '删除失败')
          applyState(saved)
          setBanner({ kind: 'ok', text: t('saved') })
        } catch (error) {
          setBanner({ kind: 'error', text: error.message })
        } finally {
          setBusy('')
        }
      }, [selectedId, applyState])

      const selectConnection = useCallback(
        async (id) => {
          setBanner(null)
          setSelectedId(id)
          if (!id) return
          try {
            const saved = await callApi('/connection/active', { id })
            if (saved.ok) applyState(saved, id)
          } catch {
            /* switching the active connection is best-effort */
          }
        },
        [applyState],
      )

      const refresh = useCallback(async () => {
        setBusy('refresh')
        setBanner(null)
        try {
          await Promise.all([loadJobsFor(selectedId), loadQueueFor(selectedId)])
        } catch (error) {
          setBanner({ kind: 'error', text: error.message })
        } finally {
          setBusy('')
        }
      }, [selectedId, loadJobsFor, loadQueueFor])

      const trigger = useCallback(async (job) => {
        setBusyJob(job.name)
        setBanner(null)
        try {
          const result = await callApi('/build', { connection: selectedId, job: job.name, url: job.url })
          if (!result.ok) throw new Error(result.error || '触发构建失败')
          setBanner({ kind: 'ok', text: `${t('buildStarted')} · ${job.name}${result.usedDefaults ? ` · ${t('defaultParams')}` : ''}${result.queueUrl ? ` · ${t('buildQueuedAt')}` : ''}` })
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => {
            void refresh()
          }, 4000)
        } catch (error) {
          setBanner({ kind: 'error', text: error.message })
        } finally {
          setBusyJob('')
        }
      }, [refresh])

      const toggleHistory = useCallback(async (job) => {
        if (expanded === job.name) {
          setExpanded('')
          return
        }
        setExpanded(job.name)
        if (builds[job.name]) return
        try {
          const result = await callApi('/builds', { connection: selectedId, url: job.url, limit: 8 })
          if (!result.ok) throw new Error(result.error || '读取构建历史失败')
          setBuilds((current) => ({ ...current, [job.name]: Array.isArray(result.builds) ? result.builds : [] }))
        } catch (error) {
          setBanner({ kind: 'error', text: error.message })
        }
      }, [expanded, builds, selectedId])

      const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase()
        if (!needle) return jobs
        return jobs.filter((job) => job.name.toLowerCase().includes(needle))
      }, [jobs, search])

      const chipFailed = settings.configured && !!banner && banner.kind === 'error'
      const chipText = !settings.configured
        ? t('connectHint')
        : chipFailed
          ? t('notConnected')
          : `${t('connected')} · ${settings.name ? `${settings.name} · ` : ''}${settings.baseUrl.replace(/^https?:\/\//, '')}`

      const updateText = !updateInfo
        ? ''
        : updateInfo.supported
          ? updateInfo.updateAvailable
            ? `${t('updateAvailable')} ${updateInfo.latestVersion || ''}`
            : t('upToDate')
          : updateInfo.reason || ''

      const field = (label, key, options) => {
        const opts = options || {}
        return h(
          'label',
          { className: `djl-field${opts.wide ? ' djl-span2' : ''}`, key },
          h('span', null, label),
          h('input', {
            className: 'djl-input',
            type: opts.type || 'text',
            value: form[key],
            placeholder: opts.placeholder || '',
            autoComplete: opts.autoComplete || 'off',
            spellCheck: false,
            onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })),
          }),
        )
      }

      return h(
        'div',
        { className: 'djl-root' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'djl-inner' },
          h(
            'header',
            { className: 'djl-head' },
            h(
              'div',
              null,
              h('h1', { className: 'djl-title' }, t('title')),
              h('p', { className: 'djl-sub' }, t('subtitle')),
            ),
            h(
              'div',
              { className: 'djl-head-right' },
              h(
                'span',
                { className: 'djl-chip', 'data-on': settings.configured && !chipFailed ? 'true' : 'false' },
                h('span', { className: 'djl-chip-dot' }),
                chipText,
              ),
              h(
                'button',
                { className: 'djl-btn', type: 'button', disabled: busy !== '' || !settings.configured, onClick: refresh },
                busy === 'refresh' ? t('refreshing') : t('refresh'),
              ),
            ),
          ),

          h(
            'div',
            { className: 'djl-update' },
            updateInfo && updateInfo.currentVersion ? h('span', { className: 'djl-version' }, `v${updateInfo.currentVersion}`) : null,
            h(
              'button',
              { className: 'djl-btn djl-btn-quiet', type: 'button', disabled: busy !== '', onClick: () => void checkUpdate(false) },
              busy === 'update' ? t('checkingUpdate') : t('checkUpdate'),
            ),
            updateInfo && updateInfo.supported && updateInfo.updateAvailable
              ? h(
                  'button',
                  { className: 'djl-btn', type: 'button', disabled: busy !== '', onClick: () => void runUpdate() },
                  busy === 'updating' ? t('updating') : `${t('applyUpdate')} ${updateInfo.latestVersion || ''}`.trim(),
                )
              : null,
            updateText ? h('span', { className: 'djl-update-text', title: updateText }, updateText) : null,
          ),

          banner
            ? h('div', { className: 'djl-banner', 'data-kind': banner.kind }, banner.text)
            : null,

          h(
            'section',
            { className: 'djl-card' },
            h(
              'div',
              { className: 'djl-card-head' },
              h('h2', null, t('connection')),
              h(
                'div',
                { className: 'djl-connbar' },
                connections.length > 0
                  ? h(
                      'select',
                      {
                        className: 'djl-input djl-select',
                        value: selectedId,
                        title: settings.baseUrl || '',
                        onChange: (event) => void selectConnection(event.target.value),
                      },
                      connections.map((entry) =>
                        h('option', { key: entry.id, value: entry.id }, entry.configured ? entry.name : `${entry.name}（未配置）`),
                      ),
                    )
                  : null,
                h('button', { className: 'djl-btn', type: 'button', disabled: busy !== '', onClick: addConnection }, t('addConn')),
                selectedId
                  ? h(
                      'button',
                      { className: 'djl-btn djl-btn-quiet', type: 'button', disabled: busy !== '', onClick: () => void removeConnection() },
                      t('removeConn'),
                    )
                  : null,
                h(
                  'button',
                  { className: 'djl-btn djl-btn-quiet', type: 'button', onClick: () => setEditing((value) => !value) },
                  editing ? t('collapse') : t('expand'),
                ),
              ),
            ),
            editing
              ? h(
                  'form',
                  { className: 'djl-card-body djl-form', onSubmit: save },
                  field(t('connName'), 'name', { wide: true, placeholder: t('connNamePlaceholder') }),
                  field(t('baseUrl'), 'baseUrl', { wide: true, placeholder: t('baseUrlPlaceholder') }),
                  field(t('username'), 'username', { placeholder: t('usernamePlaceholder'), autoComplete: 'username' }),
                  h(
                    'label',
                    { className: 'djl-field' },
                    h('span', null, t('token')),
                    h('input', {
                      className: 'djl-input',
                      type: 'password',
                      value: form.token,
                      placeholder: settings.hasToken ? t('tokenSaved') : t('tokenPlaceholder'),
                      autoComplete: 'off',
                      spellCheck: false,
                      onChange: (event) => setForm((current) => ({ ...current, token: event.target.value })),
                    }),
                  ),
                  field(t('jobFilter'), 'jobFilter', { wide: true, placeholder: t('jobFilterPlaceholder') }),
                  h(
                    'label',
                    { className: 'djl-check' },
                    h('input', {
                      type: 'checkbox',
                      checked: form.insecureTls,
                      onChange: (event) => setForm((current) => ({ ...current, insecureTls: event.target.checked })),
                    }),
                    t('insecureTls'),
                  ),
                  h(
                    'div',
                    { className: 'djl-actions' },
                    h(
                      'button',
                      { className: 'djl-btn djl-btn-primary', type: 'submit', disabled: busy !== '' },
                      busy === 'save' ? t('saving') : t('saveAndConnect'),
                    ),
                    h(
                      'button',
                      { className: 'djl-btn', type: 'button', disabled: busy !== '', onClick: test },
                      busy === 'test' ? t('testing') : t('test'),
                    ),
                    settings.hasToken
                      ? h(
                          'button',
                          { className: 'djl-btn djl-btn-quiet', type: 'button', disabled: busy !== '', onClick: clearToken },
                          t('clearToken'),
                        )
                      : null,
                  ),
                  h('p', { className: 'djl-hint' }, `${t('settingsPath')} ${settingsFile || ''}`),
                )
              : null,
          ),

          h(
            'section',
            { className: 'djl-card' },
            h(
              'div',
              { className: 'djl-card-head' },
              h('h2', null, t('jobs'), h('span', { className: 'djl-count' }, String(jobs.length))),
              h('input', {
                className: 'djl-search',
                value: search,
                placeholder: t('search'),
                spellCheck: false,
                onChange: (event) => setSearch(event.target.value),
              }),
            ),
            loading
              ? h('div', { className: 'djl-empty' }, t('loading'))
              : !settings.configured
                ? h('div', { className: 'djl-empty' }, t('emptyHint'))
                : filtered.length === 0
                  ? h('div', { className: 'djl-empty' }, search ? t('noMatch') : t('empty'))
                  : h(
                      'ul',
                      { className: 'djl-list' },
                      filtered.map((job) => {
                        const last = job.lastBuild
                        const open = expanded === job.name
                        const rows = builds[job.name]
                        return h(
                          'li',
                          { className: 'djl-job', key: job.name },
                          h('span', { className: 'djl-dot', 'data-state': stateOf(job.color) }),
                          h(
                            'div',
                            { className: 'djl-job-main' },
                            h('div', { className: 'djl-job-name', title: job.name }, job.name),
                            h(
                              'div',
                              { className: 'djl-job-meta' },
                              last
                                ? `#${last.number === null ? '?' : last.number} · ${resultLabel(last.result, last.building)} · ${formatRelative(last.timestamp)}${last.duration ? ` · ${formatDuration(last.duration)}` : ''}`
                                : t('noBuild'),
                            ),
                          ),
                          h(
                            'div',
                            { className: 'djl-job-actions' },
                            h(
                              'button',
                              { className: 'djl-btn djl-btn-quiet', type: 'button', onClick: () => void toggleHistory(job) },
                              open ? t('hideHistory') : t('history'),
                            ),
                            h(
                              'button',
                              {
                                className: 'djl-btn',
                                type: 'button',
                                disabled: busyJob !== '',
                                onClick: () => void trigger(job),
                              },
                              busyJob === job.name ? t('building') : t('build'),
                            ),
                          ),
                          open
                            ? h(
                                'div',
                                { className: 'djl-builds' },
                                rows === undefined
                                  ? h('div', { className: 'djl-build-row' }, t('loading'))
                                  : rows.length === 0
                                    ? h('div', { className: 'djl-build-row' }, t('noBuilds'))
                                    : rows.map((build) =>
                                        h(
                                          'div',
                                          { className: 'djl-build-row', key: String(build.number) },
                                          h('span', { className: 'djl-build-num' }, `#${build.number === null ? '?' : build.number}`),
                                          h('span', { className: 'djl-dot', 'data-state': build.building ? 'running' : stateOf({ SUCCESS: 'blue', FAILURE: 'red', UNSTABLE: 'yellow', ABORTED: 'aborted' }[build.result] || 'grey') }),
                                          h('span', null, resultLabel(build.result, build.building)),
                                          h('span', null, formatRelative(build.timestamp)),
                                          h('span', null, formatDuration(build.duration)),
                                        ),
                                      ),
                              )
                            : null,
                        )
                      }),
                    ),
          ),

          h(
            'section',
            { className: 'djl-card' },
            h(
              'div',
              { className: 'djl-card-head' },
              h('h2', null, t('queue'), h('span', { className: 'djl-count' }, String(queue.length))),
            ),
            queue.length === 0
              ? h('div', { className: 'djl-empty' }, t('queueEmpty'))
              : h(
                  'div',
                  null,
                  queue.map((item) =>
                    h(
                      'div',
                      { className: 'djl-queue-row', key: String(item.id) },
                      h('span', { className: 'djl-queue-name', title: item.name }, item.name || '?'),
                      h('span', { className: 'djl-queue-why' }, item.why || (item.blocked ? t('blocked') : t('waiting'))),
                    ),
                  ),
                ),
          ),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        localeService = ctx.locale
        layoutService = typeof ctx.get === 'function' ? ctx.get('layout') : null
        syncLocale()

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'jenkins',
              order: 20,
              label: () => t('nav'),
            },
            JenkinsIcon,
          ),
        )

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'jenkins' }, JenkinsPanel),
        )

        ctx.slots.inject('conversation.hero.options', () =>
          ctx.slots.register(
            { name: 'conversation.hero.options', id: 'jenkins-job', order: 10, label: () => t('pickJob') },
            JenkinsJobPicker,
          ),
        )
      },
    }
  },
})

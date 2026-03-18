import './site.css'

type LocalBootPayload = {
  susFile: File
  bgmFile: File | null
  coverFile: File | null
  rawOffsetMs: number | null
  title: string | null
  lyricist: string | null
  composer: string | null
  arranger: string | null
  vocal: string | null
  difficulty: string | null
  showLockControlsButton: boolean
}

declare global {
  interface Window {
    __MMW_BOOT_LOCAL_PAYLOAD?: LocalBootPayload
  }
}

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (!appRoot) {
  throw new Error('Missing app root.')
}
const app: HTMLDivElement = appRoot

function normalizePath(pathname: string) {
  if (pathname.endsWith('/') && pathname !== '/') {
    return pathname.slice(0, -1)
  }
  return pathname
}

function hasPreviewQuery(url: URL) {
  const keys = ['sus', 'config', 'cfg', 'bgm', 'cover', 'offset']
  return keys.some((key) => url.searchParams.has(key))
}

type NavItem = {
  href: string
  label: string
  external?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '主页' },
  { href: '/upload', label: '加载自制谱' },
  { href: '/preview', label: '预览页' },
  { href: '/about', label: '关于' },
  { href: 'https://viewer.unipjsk.com/musics', label: '官服歌曲', external: true },
]

function readOptionalText(input: HTMLInputElement) {
  const trimmed = input.value.trim()
  return trimmed === '' ? null : trimmed
}

function readOptionalOffset(input: HTMLInputElement) {
  const trimmed = input.value.trim()
  if (trimmed === '') {
    return null
  }
  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

async function mountPreviewApp(payload?: LocalBootPayload) {
  if (payload) {
    window.__MMW_BOOT_LOCAL_PAYLOAD = payload
  }
  await import('./previewApp')
}

function renderShell(content: string, currentPath: string) {
  const links = NAV_ITEMS
    .map((item) => {
      const activeClass = !item.external && item.href === currentPath ? 'is-active' : ''
      const externalAttrs = item.external ? ' target="_blank" rel="noreferrer"' : ''
      return `<a href="${item.href}" class="nav-link ${activeClass}"${externalAttrs}>${item.label}</a>`
    })
    .join('')

  app.innerHTML = `
    <div class="app-layout">
      <aside class="app-sidebar">
        <div class="sidebar-header">
          <div class="sidebar-brand">PJSK谱面在线预览</div>
          <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Toggle Menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav">
          ${links}
        </nav>
      </aside>
      <main class="app-main">
        ${content}
      </main>
    </div>
  `

  const menuToggle = app.querySelector('#mobile-menu-toggle')
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      const nav = app.querySelector('#sidebar-nav')
      if (nav) {
        nav.classList.toggle('is-open')
      }
    })
  }
}

function renderHomePage() {
  document.title = 'PJSK谱面在线预览 | 主页'
  renderShell(`
    <section class="hero">
      <img src="/assets/landing/chart.webp" alt="chart preview" />
      <div class="hero-body">
        <h1 class="hero-title">Project SEKAI 音游谱面预览工具</h1>
        <p class="hero-text">支持 SUS 解析、完整 HUD、开场信息与特效。你可以快速加载自制谱面，或直接跳转官服歌曲浏览页面进行选曲预览。</p>
        <div class="home-actions">
          <a class="action-button" href="/upload">加载自制谱</a>
          <a class="action-button secondary" href="https://viewer.unipjsk.com/musics" target="_blank" rel="noreferrer">预览官服歌曲</a>
        </div>
      </div>
    </section>
  `, '/')
}

function renderUploadPage() {
  document.title = 'PJSK谱面在线预览 | 加载自制谱'
  renderShell(`
    <section class="upload-card">
      <h1 class="upload-title">加载自制谱</h1>
      <p class="upload-text">选择本地文件并填写基础信息，然后直接进入预览页。上传只在本地浏览器中处理，不会上传到服务器。</p>
      <form class="upload-form" id="upload-form">
        <div class="upload-grid">
          <div class="upload-row file">
            <label for="upload-sus">SUS 谱面（必填）</label>
            <input id="upload-sus" type="file" accept=".sus,text/plain" required />
          </div>
          <div class="upload-row file">
            <label for="upload-bgm">BGM（可选）</label>
            <input id="upload-bgm" type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac" />
          </div>
          <div class="upload-row file">
            <label for="upload-cover">曲绘（可选）</label>
            <input id="upload-cover" type="file" accept="image/*" />
          </div>
          <div class="upload-row">
            <label for="upload-offset">offset(ms)</label>
            <input id="upload-offset" type="text" inputmode="decimal" placeholder="例如 9000" />
          </div>
          <div class="upload-row">
            <label for="upload-diff">难度</label>
            <select id="upload-diff">
              <option value="0">EASY</option>
              <option value="1">NORMAL</option>
              <option value="2">HARD</option>
              <option value="3">EXPERT</option>
              <option value="4" selected>MASTER</option>
              <option value="5">APPEND</option>
            </select>
          </div>
          <div class="upload-row wide">
            <label for="upload-title">曲名</label>
            <input id="upload-title" type="text" />
          </div>
          <div class="upload-row">
            <label for="upload-lyricist">作词</label>
            <input id="upload-lyricist" type="text" />
          </div>
          <div class="upload-row">
            <label for="upload-composer">作曲</label>
            <input id="upload-composer" type="text" />
          </div>
          <div class="upload-row">
            <label for="upload-arranger">编曲</label>
            <input id="upload-arranger" type="text" />
          </div>
          <div class="upload-row">
            <label for="upload-vocal">演唱</label>
            <input id="upload-vocal" type="text" />
          </div>
          <div class="upload-row wide">
            <label>
              <input id="upload-show-lock" type="checkbox" checked />
              全屏显示锁屏组件（录屏建议关闭）
            </label>
          </div>
        </div>
        <div class="upload-error" id="upload-error"></div>
        <div class="upload-actions">
          <a href="/preview">仅打开预览页</a>
          <button id="upload-submit" type="submit">开始预览</button>
        </div>
      </form>
    </section>
  `, '/upload')

  const form = app.querySelector<HTMLFormElement>('#upload-form')!
  const susInput = app.querySelector<HTMLInputElement>('#upload-sus')!
  const bgmInput = app.querySelector<HTMLInputElement>('#upload-bgm')!
  const coverInput = app.querySelector<HTMLInputElement>('#upload-cover')!
  const offsetInput = app.querySelector<HTMLInputElement>('#upload-offset')!
  const diffInput = app.querySelector<HTMLSelectElement>('#upload-diff')!
  const titleInput = app.querySelector<HTMLInputElement>('#upload-title')!
  const lyricistInput = app.querySelector<HTMLInputElement>('#upload-lyricist')!
  const composerInput = app.querySelector<HTMLInputElement>('#upload-composer')!
  const arrangerInput = app.querySelector<HTMLInputElement>('#upload-arranger')!
  const vocalInput = app.querySelector<HTMLInputElement>('#upload-vocal')!
  const showLockInput = app.querySelector<HTMLInputElement>('#upload-show-lock')!
  const errorNode = app.querySelector<HTMLDivElement>('#upload-error')!
  const submitButton = app.querySelector<HTMLButtonElement>('#upload-submit')!

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const susFile = susInput.files?.[0]
    if (!susFile) {
      errorNode.textContent = '请选择 SUS 谱面文件。'
      return
    }

    errorNode.textContent = ''
    submitButton.disabled = true
    submitButton.textContent = '正在进入预览…'

    const payload: LocalBootPayload = {
      susFile,
      bgmFile: bgmInput.files?.[0] ?? null,
      coverFile: coverInput.files?.[0] ?? null,
      rawOffsetMs: readOptionalOffset(offsetInput),
      title: readOptionalText(titleInput),
      lyricist: readOptionalText(lyricistInput),
      composer: readOptionalText(composerInput),
      arranger: readOptionalText(arrangerInput),
      vocal: readOptionalText(vocalInput),
      difficulty: diffInput.value.trim() === '' ? null : diffInput.value.trim(),
      showLockControlsButton: showLockInput.checked,
    }

    history.pushState({}, '', '/preview')
    await mountPreviewApp(payload)
  })
}

function renderAboutPage() {
  document.title = 'PJSK谱面在线预览 | 关于'
  renderShell(`
    <section class="preview-about">
      <h1>关于本项目</h1>
      <p>本项目是一个 Project SEKAI 风格的 SUS 预览器 Web 移植，包含谱面预览、HUD 与开场信息显示。</p>
      <p>开发者：<a href="https://space.bilibili.com/622551112" target="_blank" rel="noreferrer">綿菓子ウニ</a> ｜ 项目仓库：<a href="https://github.com/watagashi-uni/sekai-mmw-preview-web" target="_blank" rel="noreferrer">watagashi-uni/sekai-mmw-preview-web</a></p>
      <h2>引用与致谢</h2>
      <ul class="about-list">
        <li><a href="https://github.com/crash5band/MikuMikuWorld" target="_blank" rel="noreferrer">crash5band/MikuMikuWorld</a>（MIT）</li>
        <li><a href="https://github.com/crash5band/MikuMikuWorld/blob/master/LICENSE" target="_blank" rel="noreferrer">MikuMikuWorld MIT License</a></li>
        <li><a href="https://github.com/TootieJin/pjsekai-overlay-APPEND" target="_blank" rel="noreferrer">TootieJin/pjsekai-overlay-APPEND</a>（AGPL）</li>
      </ul>
    </section>
  `, '/about')
}

async function bootstrapRouter() {
  const url = new URL(window.location.href)
  const path = normalizePath(url.pathname)

  if (path === '/preview' || hasPreviewQuery(url)) {
    document.title = 'PJSK谱面在线预览 | 预览页'
    if (path !== '/preview') {
      history.replaceState({}, '', `/preview${url.search}${url.hash}`)
    }
    await mountPreviewApp()
    return
  }

  if (path === '/upload') {
    renderUploadPage()
    return
  }

  if (path === '/about') {
    renderAboutPage()
    return
  }

  renderHomePage()
}

void bootstrapRouter()

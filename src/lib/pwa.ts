import { registerSW } from 'virtual:pwa-register'

declare global {
  interface Window {
    __MMW_PWA_BOOTED__?: boolean
  }
}

const STYLE_ID = 'mmw-pwa-toast-style'
const HOST_ID = 'mmw-pwa-toast-host'
const WARMUP_MESSAGE_TYPE = 'MMW_WARMUP'

function ensureToastStyles() {
  if (document.getElementById(STYLE_ID)) {
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${HOST_ID} {
      position: fixed;
      right: max(14px, env(safe-area-inset-right));
      bottom: max(14px, env(safe-area-inset-bottom));
      z-index: 2147483000;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
      pointer-events: none;
    }

    .mmw-pwa-toast {
      width: min(90vw, 360px);
      border-radius: 14px;
      border: 1px solid rgba(158, 203, 246, 0.34);
      background:
        linear-gradient(152deg, rgba(12, 25, 42, 0.93), rgba(8, 16, 28, 0.92)),
        linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 52%);
      color: #eef7ff;
      box-shadow:
        0 14px 38px rgba(0, 0, 0, 0.42),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(10px) saturate(122%);
      pointer-events: auto;
      padding: 12px 12px 10px;
    }

    .mmw-pwa-toast-title {
      margin: 0;
      font-size: 0.98rem;
      font-weight: 800;
      letter-spacing: 0.01em;
      color: #f3f9ff;
    }

    .mmw-pwa-toast-body {
      margin: 6px 0 0;
      font-size: 0.87rem;
      line-height: 1.45;
      color: rgba(224, 239, 255, 0.84);
    }

    .mmw-pwa-toast-actions {
      margin-top: 10px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .mmw-pwa-toast button {
      border: 1px solid rgba(164, 201, 238, 0.28);
      border-radius: 999px;
      padding: 6px 12px;
      font: inherit;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      color: #e9f5ff;
      background: rgba(24, 44, 68, 0.84);
    }

    .mmw-pwa-toast button:hover {
      background: rgba(34, 58, 87, 0.9);
    }

    .mmw-pwa-toast button.primary {
      border-color: rgba(167, 211, 253, 0.52);
      color: #f7fbff;
      background: linear-gradient(180deg, rgba(86, 146, 212, 0.92), rgba(58, 103, 162, 0.94));
      box-shadow: 0 8px 16px rgba(51, 100, 160, 0.35);
    }

    .mmw-pwa-toast button.primary:disabled {
      opacity: 0.72;
      cursor: default;
    }

    @media (max-width: 640px) {
      #${HOST_ID} {
        right: max(10px, env(safe-area-inset-right));
        bottom: max(10px, env(safe-area-inset-bottom));
      }

      .mmw-pwa-toast {
        width: min(95vw, 360px);
      }
    }
  `
  document.head.appendChild(style)
}

function ensureToastHost() {
  const existing = document.getElementById(HOST_ID)
  if (existing) {
    return existing
  }
  const host = document.createElement('div')
  host.id = HOST_ID
  document.body.appendChild(host)
  return host
}

function createToast(title: string, body: string) {
  const toast = document.createElement('div')
  toast.className = 'mmw-pwa-toast'

  const titleNode = document.createElement('p')
  titleNode.className = 'mmw-pwa-toast-title'
  titleNode.textContent = title
  toast.appendChild(titleNode)

  const bodyNode = document.createElement('p')
  bodyNode.className = 'mmw-pwa-toast-body'
  bodyNode.textContent = body
  toast.appendChild(bodyNode)

  const actions = document.createElement('div')
  actions.className = 'mmw-pwa-toast-actions'
  toast.appendChild(actions)

  return { toast, actions }
}

function dismissToast(node: HTMLElement | null) {
  if (!node) {
    return
  }
  node.remove()
}

function requestWarmup(registration: ServiceWorkerRegistration | undefined) {
  const postWarmup = (worker: ServiceWorker | null | undefined) => {
    if (!worker) {
      return
    }
    worker.postMessage({ type: WARMUP_MESSAGE_TYPE })
  }

  postWarmup(registration?.active)
  postWarmup(registration?.waiting)
  postWarmup(registration?.installing)

  void navigator.serviceWorker.ready
    .then((readyRegistration) => {
      postWarmup(readyRegistration.active)
    })
    .catch(() => {
      // ignore readiness failures
    })
}

export function setupPwaUpdatePrompt() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }
  if (window.__MMW_PWA_BOOTED__) {
    return
  }
  window.__MMW_PWA_BOOTED__ = true

  ensureToastStyles()
  const host = ensureToastHost()

  let updateToastNode: HTMLElement | null = null
  let offlineToastNode: HTMLElement | null = null

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, registration) {
      requestWarmup(registration)
    },
    onNeedRefresh() {
      if (updateToastNode) {
        return
      }
      if (offlineToastNode) {
        dismissToast(offlineToastNode)
        offlineToastNode = null
      }

      const { toast, actions } = createToast('发现新版本', '点击立即更新以加载最新资源。')

      const dismissBtn = document.createElement('button')
      dismissBtn.type = 'button'
      dismissBtn.textContent = '稍后'
      dismissBtn.addEventListener('click', () => {
        dismissToast(updateToastNode)
        updateToastNode = null
      })

      const updateBtn = document.createElement('button')
      updateBtn.type = 'button'
      updateBtn.className = 'primary'
      updateBtn.textContent = '立即更新'
      updateBtn.addEventListener('click', async () => {
        try {
          updateBtn.disabled = true
          updateBtn.textContent = '更新中…'
          await updateSW(true)
        } catch {
          updateBtn.disabled = false
          updateBtn.textContent = '立即更新'
        }
      })

      actions.appendChild(dismissBtn)
      actions.appendChild(updateBtn)

      host.appendChild(toast)
      updateToastNode = toast
    },
    onOfflineReady() {
      if (offlineToastNode || updateToastNode) {
        return
      }
      const { toast, actions } = createToast('资源缓存完成', '离线模式已可用，后续加载会更快。')

      const closeBtn = document.createElement('button')
      closeBtn.type = 'button'
      closeBtn.textContent = '知道了'
      closeBtn.addEventListener('click', () => {
        dismissToast(offlineToastNode)
        offlineToastNode = null
      })
      actions.appendChild(closeBtn)

      host.appendChild(toast)
      offlineToastNode = toast
      window.setTimeout(() => {
        dismissToast(offlineToastNode)
        offlineToastNode = null
      }, 5200)
    },
    onRegisterError(error) {
      console.error('[PWA] register failed:', error)
    },
  })
}

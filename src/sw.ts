/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { createHandlerBoundToURL, cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{
    url: string
    revision?: string | null
  }>
}

const CACHE_NAME_STATIC_RUNTIME = 'mmw-static-runtime-v2'

function normalizeManifestUrl(url: string) {
  const prefixed = url.startsWith('/') ? url : `/${url}`
  return encodeURI(prefixed)
}

const precacheManifest = (() => {
  const dedupedByUrl = new Map<
    string,
    {
      url: string
      revision?: string | null
    }
  >()

  for (const entry of self.__WB_MANIFEST) {
    const normalizedEntry = {
      ...entry,
      url: normalizeManifestUrl(entry.url),
    }

    const existingEntry = dedupedByUrl.get(normalizedEntry.url)
    if (!existingEntry) {
      dedupedByUrl.set(normalizedEntry.url, normalizedEntry)
      continue
    }

    // Prefer the cache-busted variant when duplicate URL entries disagree.
    const existingHasRevision = existingEntry.revision != null
    const nextHasRevision = normalizedEntry.revision != null
    if (!existingHasRevision && nextHasRevision) {
      dedupedByUrl.set(normalizedEntry.url, normalizedEntry)
    }
  }

  return Array.from(dedupedByUrl.values())
})()

self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') {
    return
  }

  if (event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

void self.skipWaiting()
clientsClaim()

precacheAndRoute(precacheManifest)
cleanupOutdatedCaches()

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html')),
)

registerRoute(
  ({ url }) =>
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/mmw/') || url.pathname.endsWith('.wasm') || url.pathname.startsWith('/wasm/')),
  new CacheFirst({
    cacheName: CACHE_NAME_STATIC_RUNTIME,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 3000,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  }),
  'GET',
)

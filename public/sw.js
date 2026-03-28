const CACHE = 'audiobook-v1'

// Cache everything on first fetch (network-first with cache fallback for navigation, cache-first for assets)
self.addEventListener('install', e => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  // Only cache same-origin requests
  if (url.origin !== location.origin) return

  if (request.mode === 'navigate') {
    // Navigation: network first, cache fallback
    e.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
          return res
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/')))
    )
  } else {
    // Assets: cache first, then network
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
          return res
        })
      })
    )
  }
})

// Message handler for manual cache-all trigger
self.addEventListener('message', e => {
  if (e.data?.type === 'CACHE_ALL') {
    e.waitUntil(
      caches.open(CACHE).then(async cache => {
        const urls = e.data.urls || []
        let done = 0
        for (const url of urls) {
          try {
            const res = await fetch(url)
            await cache.put(url, res)
          } catch {}
          done++
          // Report progress back to client
          const clients = await self.clients.matchAll()
          clients.forEach(c => c.postMessage({ type: 'CACHE_PROGRESS', done, total: urls.length }))
        }
        const clients = await self.clients.matchAll()
        clients.forEach(c => c.postMessage({ type: 'CACHE_DONE' }))
      })
    )
  }
})

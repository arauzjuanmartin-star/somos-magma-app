// Service worker de Mi Magma: muestra los avisos push (lib/push.js) y abre la app al tocarlos.
// No cachea nada: la app sigue pidiendo todo al servidor como siempre.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch (err) { d = { titulo: 'Somos Magma', cuerpo: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Somos Magma', {
    body: d.cuerpo || '', icon: '/icons/icono-192.png', badge: '/icons/icono-192.png', tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || '/mi' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/mi', self.location.origin).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const abierta = cs.find(c => c.url.startsWith(self.location.origin))
    if (abierta) { abierta.navigate(url); return abierta.focus() }
    return self.clients.openWindow(url)
  }))
})

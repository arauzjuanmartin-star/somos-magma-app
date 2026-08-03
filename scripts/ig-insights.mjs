// Lee los números de Instagram de Somos Magma vía la API Graph de Meta.
// Usa IG_APP_ID + IG_APP_SECRET + IG_TOKEN de .env.local.
// La primera vez IG_TOKEN es el token corto del Explorador de la API Graph:
// el script lo canjea por uno largo (60 días) y te lo muestra para guardar.
//
// Uso:  node scripts/ig-insights.mjs
//       node scripts/ig-insights.mjs <token>   (para probar un token puntual)
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))

const API = 'https://graph.facebook.com/v21.0'
const APP_ID = env.IG_APP_ID
const APP_SECRET = env.IG_APP_SECRET
let TOKEN = (process.argv[2] || env.IG_TOKEN || '').trim()

if (!TOKEN) {
  console.error('❌ Falta el token. Generalo en el Explorador de la API Graph y pegámelo, o ponelo en IG_TOKEN de .env.local.')
  process.exit(1)
}

// Llamada genérica a la API con manejo de error legible
async function api(path, params = {}) {
  const url = new URL(`${API}/${path}`)
  for (const [k, v] of Object.entries({ ...params, access_token: TOKEN })) url.searchParams.set(k, v)
  const r = await fetch(url)
  const j = await r.json()
  if (j.error) throw new Error(`${j.error.message} (código ${j.error.code})`)
  return j
}

// 1) Canjear token corto -> largo (60 días). Si ya es largo, Meta lo devuelve igual.
async function canjearTokenLargo() {
  const url = new URL(`${API}/oauth/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', APP_ID)
  url.searchParams.set('client_secret', APP_SECRET)
  url.searchParams.set('fb_exchange_token', TOKEN)
  const r = await fetch(url)
  const j = await r.json()
  if (j.error) throw new Error(`No se pudo canjear el token: ${j.error.message}`)
  return j.access_token
}

const barra = (n, max) => '█'.repeat(Math.max(1, Math.round((n / (max || 1)) * 24)))

async function main() {
  console.log('🔑 Canjeando token por uno de larga duración (60 días)...')
  const tokenLargo = await canjearTokenLargo()
  TOKEN = tokenLargo
  console.log('✅ Token largo obtenido.\n')

  // 2) Encontrar la cuenta de Instagram a través de la página de Facebook
  const pages = await api('me/accounts', {
    fields: 'name,instagram_business_account{id,username,name,followers_count,media_count,biography}',
  })
  const conIG = (pages.data || []).find(p => p.instagram_business_account)
  if (!conIG) throw new Error('No encontré ninguna cuenta de Instagram vinculada a tus páginas. ¿La IG está conectada a la página de Facebook en el Business?')
  const ig = conIG.instagram_business_account

  console.log('📸 INSTAGRAM — SOMOS MAGMA')
  console.log(`   @${ig.username}  ·  ${ig.followers_count} seguidores  ·  ${ig.media_count} publicaciones`)
  console.log(`   (vía página de Facebook: ${conIG.name})\n`)

  // 3) Últimas publicaciones, rankeadas por interacción (likes + comentarios)
  const media = await api(`${ig.id}/media`, {
    fields: 'caption,media_type,permalink,timestamp,like_count,comments_count',
    limit: 30,
  })
  const posts = (media.data || []).map(m => ({
    ...m,
    inter: (m.like_count || 0) + (m.comments_count || 0),
    fecha: new Date(m.timestamp).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    texto: (m.caption || '(sin texto)').replace(/\s+/g, ' ').slice(0, 55),
  }))
  const top = [...posts].sort((a, b) => b.inter - a.inter)
  const maxInter = top[0]?.inter || 1

  console.log(`🏆 TOP POSTS (de los últimos ${posts.length}) — por likes + comentarios:\n`)
  top.slice(0, 10).forEach((p, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${p.fecha} · ${p.media_type.padEnd(13)} ❤️ ${String(p.like_count || 0).padStart(4)}  💬 ${String(p.comments_count || 0).padStart(3)}`)
    console.log(`    ${barra(p.inter, maxInter)}  "${p.texto}"`)
  })

  // Mejor día de la semana (de esta muestra)
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const porDia = {}
  posts.forEach(p => {
    const d = dias[new Date(p.timestamp).getDay()]
    porDia[d] = porDia[d] || { total: 0, n: 0 }
    porDia[d].total += p.inter
    porDia[d].n++
  })
  const ranking = Object.entries(porDia).map(([d, v]) => ({ d, prom: Math.round(v.total / v.n) })).sort((a, b) => b.prom - a.prom)
  console.log('\n📅 Interacción promedio por día (de esta muestra):')
  ranking.forEach(r => console.log(`   ${r.d}: ${r.prom} interacciones/post`))

  // 4) Alcance de la cuenta (best-effort — la API de insights es más quisquillosa)
  try {
    const ins = await api(`${ig.id}/insights`, { metric: 'reach', period: 'days_28', metric_type: 'total_value' })
    const reach = ins.data?.[0]?.total_value?.value
    if (reach != null) console.log(`\n📈 Alcance últimos 28 días: ${reach} cuentas`)
  } catch (e) {
    console.log(`\n⚠️  Alcance/insights avanzados: ${e.message}`)
    console.log('    (Lo afinamos después — con los likes/comentarios de arriba ya tenés qué post funciona.)')
  }

  console.log('\n' + '─'.repeat(60))
  console.log('🔐 GUARDÁ ESTE TOKEN LARGO (dura 60 días) — pegámelo y lo pongo en .env.local:')
  console.log(tokenLargo)
  console.log('─'.repeat(60))
}

main().catch(e => {
  console.error('\n❌ Error:', e.message)
  process.exit(1)
})

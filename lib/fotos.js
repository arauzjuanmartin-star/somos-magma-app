// ============================ LAS FOTOS DE UN PROYECTO ============================
// Busca las fotos donde hayan caído adentro de la carpeta de entrega, arma el plan
// (qué se mueve, qué se firma, cómo queda cada nombre) y lo ejecuta de a tandas.
//
// Vive en lib/ y no adentro del endpoint para poder probarlo contra las carpetas
// reales desde un script (scripts/fotos-proyecto.mjs), que es como se verificó.
//
// A dónde van:
//   · carpeta nueva (tiene "Finales")   → Finales/Fotos. El cliente recibe el link de
//     Finales y ve el video y, al lado, la carpeta de fotos.
//   · carpeta vieja (tiene "Fotos")     → se quedan en esa "Fotos".
//   · carpeta sin nada (fotos sueltas)  → se crea Finales/Fotos.
// Lo que ya está adentro del destino NO se mueve (Unilever las tiene por día:
// Fotos/Lunes … Fotos/Jueves, y esa división vale). Solo se firma. Y si el fotógrafo
// las separó por día en otro lado ("Pre-entregas/Lunes"), la división viaja con ellas.
//
// La firma: Cliente_Proyecto_001_@somosmagma_ar.jpg. La pone Magma al entregar — Juan
// descartó pedírsela al fotógrafo en Lightroom ("la sacó él, es raro"). Lo que ya está
// firmado no se renumera: se puede correr las veces que haga falta.

import { sinTildes, nombreProyecto } from './drive.js'
import { SLOT_PROY, MAX_SLOTS } from './slots.js'
import { llevaFotos, SUB_FIN, SUB_FOTOS } from './edicion.js'

export const USUARIO_IG = '@somosmagma_ar'
const IMAGEN = /\.(jpe?g|png|tiff?|webp|heic|dng|cr2|cr3|nef|arw|raf)$/i
const CARPETA = 'application/vnd.google-apps.folder'
const EN_PARALELO = 4   // más que esto y Drive empieza a rebotar por límite de escrituras

const idDeLink = l => (String(l || '').match(/[-\w]{25,}/) || [])[0] || ''
export const linkCarpeta = id => `https://drive.google.com/drive/folders/${id}`
const limpio = s => sinTildes(String(s || '')).replace(/[^A-Za-z0-9]+/g, '')
const orden = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
const k = s => sinTildes(s).toLowerCase().trim()
const esFotos = c => /^fotos?$/.test(k(c.name))

async function hijos(drive, id) {
  const out = []; let pageToken
  do {
    const r = await drive.files.list({
      q: `'${id}' in parents and trashed = false`,
      includeItemsFromAllDrives: true, supportsAllDrives: true,
      fields: 'nextPageToken, files(id,name,mimeType)', pageSize: 1000, pageToken,
    })
    out.push(...(r.data.files || [])); pageToken = r.data.nextPageToken
  } while (pageToken)
  return out
}

// Recorre la carpeta de entrega entera. Los accesos directos (el crudo que se le da
// al cliente es uno) no son carpetas para Drive, así que no se entra al crudo.
async function recorrer(drive, raizId) {
  const carpetas = [{ id: raizId, name: '', ruta: '', nivel: 0, padre: null }]
  const fotos = []
  for (let i = 0; i < carpetas.length && i < 80; i++) {
    const c = carpetas[i]
    for (const f of await hijos(drive, c.id)) {
      if (f.mimeType === CARPETA) { if (c.nivel < 4) carpetas.push({ id: f.id, name: f.name, ruta: c.ruta ? `${c.ruta}/${f.name}` : f.name, nivel: c.nivel + 1, padre: c.id }) }
      else if (IMAGEN.test(f.name)) fotos.push({ id: f.id, name: f.name, carpetaId: c.id, ruta: c.ruta })
    }
  }
  return { carpetas, fotos }
}

async function conReintento(fn) {
  for (let i = 0; ; i++) {
    try { return await fn() }
    catch (e) {
      const c = e?.code || e?.response?.status
      if (i >= 3 || ![403, 429, 500, 503].includes(c)) throw e
      await new Promise(r => setTimeout(r, 600 * 2 ** i))
    }
  }
}

// `h` y `fila` son el header y la fila del proyecto en PROYECTOS.
// Devuelve { estado, plan, ctx }: estado es lo que ve la pantalla, plan lo que se haría.
export async function mirarFotos({ drive, h, fila, num }) {
  const cliente = String(fila[h.indexOf('Cliente')] || fila[h.indexOf('Agencia')] || '').trim()
  const proyecto = String(fila[h.indexOf('Proyecto')] || '').trim()
  const pedidos = []
  for (let n = 1; n <= MAX_SLOTS; n++) { const p = String(fila[SLOT_PROY(n).pedido] || '').trim(); if (p) pedidos.push(p) }
  const vendidas = llevaFotos(pedidos)

  const raizId = idDeLink(fila[h.indexOf('Drive Entrega')])
  if (!raizId) return { estado: { ok: true, sinCarpeta: true, vendidas, total: 0, firmadas: 0, listas: 0, faltan: 0 }, plan: [], ctx: null }

  const { carpetas, fotos } = await recorrer(drive, raizId)

  // ---- el destino
  const deRaiz = carpetas.filter(c => c.nivel === 1)
  const finales = deRaiz.find(c => k(c.name) === k(SUB_FIN)) || null
  const fotosVieja = !finales ? deRaiz.find(esFotos) || null : null
  const destino = fotosVieja || (finales ? carpetas.find(c => c.padre === finales.id && esFotos(c)) || null : null)
  const rutaDestino = fotosVieja ? fotosVieja.ruta : `${SUB_FIN}/${SUB_FOTOS}`

  // Todo lo que cuelga del destino ya está en su lugar
  const bajoDestino = new Set()
  if (destino) { bajoDestino.add(destino.id); let sumo = true; while (sumo) { sumo = false; for (const c of carpetas) if (!bajoDestino.has(c.id) && bajoDestino.has(c.padre)) { bajoDestino.add(c.id); sumo = true } } }

  // Las carpetas de la estructura no son "un día": no viajan con las fotos.
  const DE_ESTRUCTURA = new Set([k(SUB_FIN), k(SUB_FOTOS), 'foto', 'pre-entregas', 'preentregas', 'pre entregas'])
  const subDe = ruta => { const u = String(ruta || '').split('/').pop(); return u && !DE_ESTRUCTURA.has(k(u)) ? u : '' }

  const firmada = f => f.name.includes(USUARIO_IG)
  const enDestino = f => bajoDestino.has(f.carpetaId)
  const base = [limpio(cliente), limpio(nombreProyecto(proyecto))].filter(Boolean).join('_') || `Proyecto${num}`

  // La numeración sigue desde la última ya firmada, para no pisar lo entregado. Si están
  // separadas por día, cada día numera aparte y lleva el día en el nombre
  // (Unilever_PeopleWeek_Lunes_001…): si no, el jueves salía antes que el lunes por abecedario.
  const ultima = {}
  fotos.filter(firmada).forEach(f => { const m = f.name.match(/_(\d{3,4})_@/); if (m) { const g = k(subDe(f.ruta)); ultima[g] = Math.max(ultima[g] || 0, parseInt(m[1])) } })
  const plan = fotos
    .filter(f => !firmada(f) || !enDestino(f))
    .sort((a, b) => orden(a.ruta, b.ruta) || orden(a.name, b.name))
    .map(f => {
      let despues = f.name
      if (!firmada(f)) {
        const dia = subDe(f.ruta), n = (ultima[k(dia)] = (ultima[k(dia)] || 0) + 1)
        const ext = (f.name.match(/\.[A-Za-z0-9]+$/) || ['.jpg'])[0].toLowerCase()
        despues = `${base}${dia ? '_' + limpio(dia) : ''}_${String(n).padStart(3, '0')}_${USUARIO_IG}${ext}`
      }
      return { id: f.id, antes: f.name, despues, de: f.ruta || '(suelta en la carpeta)', carpetaId: f.carpetaId, mover: !enDestino(f), sub: enDestino(f) ? '' : subDe(f.ruta) }
    })

  const porCarpeta = {}
  fotos.forEach(f => { const c = f.ruta || '(sueltas en la carpeta)'; porCarpeta[c] = (porCarpeta[c] || 0) + 1 })
  const estado = {
    ok: true, vendidas, cliente, proyecto,
    total: fotos.length,
    firmadas: fotos.filter(firmada).length,
    listas: fotos.filter(f => firmada(f) && enDestino(f)).length,
    porCarpeta: Object.entries(porCarpeta).sort((a, b) => orden(a[0], b[0])).map(([carpeta, cuantas]) => ({ carpeta, n: cuantas })),
    destino: rutaDestino,
    linkFotos: destino ? linkCarpeta(destino.id) : '',
    linkEntrega: linkCarpeta(raizId),
    aMover: plan.filter(p => p.mover).length,
    aFirmar: plan.filter(p => p.antes !== p.despues).length,
    faltan: plan.length,
    ejemplos: plan.slice(0, 6).map(({ antes, despues, de, mover, sub }) => ({ antes, despues, de, mover, sub })),
  }
  return { estado, plan, ctx: { raizId, carpetas, finales, fotosVieja, destino } }
}

// Ejecuta el plan hasta que se acaba o se acaba el tiempo (`hasta` = Date.now() límite).
// Devuelve cuántas hizo y cuántas faltan: el que llama vuelve a mirar y sigue.
export async function acomodarFotos({ drive, plan, ctx, hasta }) {
  const crear = async (nombre, padre) => (await drive.files.create({ requestBody: { name: nombre, mimeType: CARPETA, parents: [padre] }, fields: 'id', supportsAllDrives: true })).data.id
  let { finales, destino } = ctx
  let finalesNueva = false
  if (!destino) {
    if (!finales) { finales = { id: await crear(SUB_FIN, ctx.raizId) }; finalesNueva = true }
    destino = { id: await crear(SUB_FOTOS, finales.id) }
  }
  // Las subcarpetas por día adentro del destino: la que ya existe se usa, la que no se crea.
  const subId = {}
  ctx.carpetas.filter(c => c.padre === destino.id).forEach(c => { subId[k(c.name)] = c.id })
  for (const sub of [...new Set(plan.map(p => p.sub).filter(Boolean))]) if (!subId[k(sub)]) subId[k(sub)] = await crear(sub, destino.id)

  let hechas = 0
  const fallos = []
  const cola = [...plan]
  const uno = async p => {
    try {
      await conReintento(() => drive.files.update({
        fileId: p.id, supportsAllDrives: true, fields: 'id',
        ...(p.mover ? { addParents: p.sub ? subId[k(p.sub)] : destino.id, removeParents: p.carpetaId } : {}),
        requestBody: p.antes !== p.despues ? { name: p.despues } : {},
      }))
      hechas++
    } catch (e) { fallos.push(`${p.antes}: ${e.message}`) }
  }
  while (cola.length && Date.now() < hasta) await Promise.all(cola.splice(0, EN_PARALELO).map(uno))

  return { hechas, faltan: cola.length, fallos, finalesNueva, destinoId: destino.id, linkCliente: linkCarpeta((finales || ctx.fotosVieja || destino).id) }
}

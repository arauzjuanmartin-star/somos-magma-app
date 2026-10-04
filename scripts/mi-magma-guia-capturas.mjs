// Capturas para la guía "Mi Magma, cómo se usa" (https://claude.ai/artifact/MZMNdhj762GendAnXTdM18): la app real, con
// DATOS DE EJEMPLO (no los de nadie) y el botón de cada paso marcado en rojo.
//
// Uso (con `npx next dev` corriendo en el puerto 3000):
//   node scripts/mi-magma-guia-capturas.mjs _preview-mi-magma-2/guia <archivo con un token de sesión de next-auth>
//   node scripts/mi-magma-guia.mjs _preview-mi-magma-2     → arma guia-mi-magma.html con esas capturas, para publicar
import { spawn } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

const OUT = process.argv[2], TOKEN = readFileSync(process.argv[3], 'utf8').trim()
mkdirSync(OUT, { recursive: true })
const DEMO = {
  ok: true, quien: 'Micaela Ejemplo', primerNombre: 'Mica', hoy: '03/10/2026', diasAdelante: 120, diasNoPuedo: ['20/10/2026'],
  push: { disponible: true, clave: 'BCLDPa_8PO_92o4KoAJalWA0yQTRKgiPhWRltom2DOerhRLJmFUVBiYz7cIG5tWdjS3e3eBlQ7wkscwX_VcgUFA' },
  proximos: [
    { num: '2401', slot: 1, fecha: '08/10/2026', rol: 'Film ½', monto: 220000, cliente: 'Marca Ejemplo', agencia: '', proyecto: 'Lanzamiento de producto', pm: 'Sofi', horario: '09:00 a 13:00 hs', lugar: 'Av. del Libertador 4101, CABA', clase: 'Activación de marca', claseExplicada: 'Gente interactuando con el producto y el stand, promotoras, regalos.', formato: 'Vertical (redes sociales)', red: 'Instagram', grafica: '', equipo: [{ quien: 'Santi', rol: 'Foto ½' }], sale: ['Edit 60s'], driveCrudo: 'https://drive.google.com/', notas: [], puedeNota: true, esHoy: false, sePaga: '15/11', falta: [], respuesta: null, urgente: false },
    { num: '2407', slot: 1, fecha: '14/10/2026', rol: 'Video ½', monto: 220000, cliente: 'Congreso Ejemplo', agencia: '', proyecto: 'Jornada anual', pm: 'Juan', horario: '15:00 a 19:00 hs', lugar: 'Hotel Centro, CABA', clase: 'Charla o corporativo', claseExplicada: 'Cobertura formal de una charla: que se entienda quién habla y qué dice.', formato: 'Horizontal', red: '', grafica: '', equipo: [], sale: ['Edit 60s'], driveCrudo: 'https://drive.google.com/', notas: [], puedeNota: true, esHoy: false, sePaga: '15/11', falta: [], respuesta: { que: 'confirmo', cuando: '02/10/2026 18:20', motivo: '', fecha: '14/10/2026' }, urgente: false },
  ],
  meses: [
    { clave: '2026-10', nombre: 'Octubre', enCurso: true, lineas: [{ fecha: '08/10/2026', dia: '08/10', rol: 'Film ½', cliente: 'Marca Ejemplo', proyecto: 'Lanzamiento de producto', num: '2401', monto: 220000, viaticos: 0, pagado: false, yaFue: false }, { fecha: '14/10/2026', dia: '14/10', rol: 'Video ½', cliente: 'Congreso Ejemplo', proyecto: 'Jornada anual', num: '2407', monto: 220000, viaticos: 0, pagado: false, yaFue: false }], total: 440000, pagado: 0, pendiente: 440000, honorarios: 440000, viaticos: 0, factura: '', faltanHacer: 2, sePaga: '15/11/2026' },
    { clave: '2026-09', nombre: 'Septiembre', enCurso: false, lineas: [{ fecha: '04/09/2026', dia: '04/09', rol: 'Film ½', cliente: 'Marca Ejemplo', proyecto: 'Evento de marca', num: '2301', monto: 220000, viaticos: 0, pagado: false, yaFue: true }, { fecha: '11/09/2026', dia: '11/09', rol: 'Film ½', cliente: 'Expo Ejemplo', proyecto: 'Stand en La Rural', num: '2312', monto: 220000, viaticos: 18000, pagado: false, yaFue: true }, { fecha: '23/09/2026', dia: '23/09', rol: 'Foto ½', cliente: 'Congreso Ejemplo', proyecto: 'Charla abierta', num: '2330', monto: 220000, viaticos: 0, pagado: false, yaFue: true }], total: 678000, pagado: 0, pendiente: 678000, honorarios: 660000, viaticos: 18000, factura: '', faltanHacer: 0, sePaga: '15/10/2026' },
    { clave: '2026-08', nombre: 'Agosto', enCurso: false, lineas: [{ fecha: '12/08/2026', dia: '12/08', rol: 'Film ½', cliente: 'Marca Ejemplo', proyecto: 'Activación', num: '2190', monto: 220000, viaticos: 0, pagado: true, yaFue: true }], total: 220000, pagado: 220000, pendiente: 0, honorarios: 220000, viaticos: 0, factura: 'https://drive.google.com/', faltanHacer: 0, sePaga: '15/09/2026' },
  ],
  entregas: [
    { num: '2312', slot: 1, fecha: '11/09/2026', cliente: 'Expo Ejemplo', proyecto: 'Stand en La Rural', etapa: 'entregado', piezas: 1, listas: 1, notas: [], puedeNota: true, texto: 'Entregado', link: 'https://drive.google.com/', links: [], entregadas: ['Edit 60s'] },
    { num: '2330', slot: 1, fecha: '23/09/2026', cliente: 'Congreso Ejemplo', proyecto: 'Charla abierta', etapa: 'edicion', piezas: 2, listas: 0, notas: [{ cuando: '23/09', texto: 'La organización pidió que no aparezca el panel de sponsors viejo.' }], puedeNota: true, texto: 'En edición', link: '', links: [], entregadas: [] },
  ],
  ficha: { nombre: 'Micaela Ejemplo', rubro: 'Filmmaker', zona: 'CABA', mail: 'mica.ejemplo@gmail.com', celular: '••••••4321', banco: 'Galicia', alias: '•••••.mp', cbu: '••••••••1234', cuit: '••••••••7-8', acuerdo: null, trabajos: 37, desde: '15/03/2026' },
  historial: [{ clave: '2026-09', anio: 2026, mes: 'Septiembre', jornadas: 3, rodajes: 3, monto: 660000, clientes: 3 }, { clave: '2026-08', anio: 2026, mes: 'Agosto', jornadas: 5, rodajes: 5, monto: 1100000, clientes: 4 }, { clave: '2026-07', anio: 2026, mes: 'Julio', jornadas: 4, rodajes: 4, monto: 880000, clientes: 3 }],
  anios: [{ anio: 2026, jornadas: 37, monto: 8140000, meses: 7 }],
  paraGasto: [{ num: '2330', slot: 1, fecha: '23/09/2026', cliente: 'Congreso Ejemplo', proyecto: 'Charla abierta', rol: 'Foto ½', sePaga: '15/10/2026' }],
  gastos: [{ id: 'T-1', cargado: '11/09/2026 19:02', num: '2312', trabajo: 'Expo Ejemplo · Stand en La Rural', fecha: '11/09/2026', que: 'Peaje', monto: 18000, estado: 'aprobado', motivo: '', sePaga: '15/10/2026' }],
  queFue: ['Nafta', 'Peaje', 'Estacionamiento', 'Taxi o remís', 'Comida', 'Otro'],
}
// Antes de que la página pida nada: /api/mi contesta el ejemplo, las escrituras contestan "ok", y el navegador dice
// que los avisos todavía no están activados (para que se vea la tarjeta "Activar avisos").
const INIT = `(()=>{ const DEMO=${JSON.stringify(DEMO)}; const f=window.fetch;
  window.fetch=async(u,o)=>{ const s=String(u);
    if(s.startsWith('/api/mi/disponibilidad')){ const b=JSON.parse(o.body); return new Response(JSON.stringify({ok:true,respuesta:{que:b.accion,cuando:'03/10/2026 10:30',motivo:b.motivo||'',fecha:''}})) }
    if(s.startsWith('/api/mi/')) return new Response(JSON.stringify({ok:true}))
    if(s.startsWith('/api/mi')) return new Response(JSON.stringify(DEMO))
    return f(u,o) }
  try{ Object.defineProperty(Notification,'permission',{get:()=> 'default'}) }catch(e){}
})()`

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9223', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--user-data-dir=/tmp/chrome-magma-guia', 'about:blank'], { stdio: 'ignore' })
const esperar = ms => new Promise(r => setTimeout(r, ms))
let lista = null
for (let i = 0; i < 20 && !lista; i++) { await esperar(700); try { lista = await (await fetch('http://127.0.0.1:9223/json/list')).json() } catch (e) { /* todavía no */ } }
const ws = new WebSocket(lista.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.onopen = r)
let id = 0; const pend = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id) } }
const cmd = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
await cmd('Page.enable'); await cmd('Network.enable'); await cmd('Runtime.enable')
const ev = async expr => { const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r?.exceptionDetails ? 'ERROR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 100) : r?.result?.value }
const ANCHO = 390
const click = t => `(()=>{const b=[...document.querySelectorAll('button,a,label')].find(x=>x.textContent.trim()===${JSON.stringify(t)}||x.textContent.trim().startsWith(${JSON.stringify(t)}));if(b){b.click();return true}return false})()`
// Marca en rojo el botón que hay que tocar (lo busca por su texto)
const marcar = t => `(()=>{const b=[...document.querySelectorAll('button,a,label')].filter(x=>x.textContent.trim().startsWith(${JSON.stringify(t)})).pop();if(!b)return false;b.style.outline='4px solid #CE2637';b.style.outlineOffset='4px';b.style.borderRadius=b.style.borderRadius||'10px';return true})()`
const scrollA = t => `(()=>{const b=[...document.querySelectorAll('div,p,button')].filter(x=>x.children.length<3&&x.textContent.trim().startsWith(${JSON.stringify(t)})).pop();if(!b)return false;const y=b.getBoundingClientRect().top+window.scrollY-90;window.scrollTo(0,Math.max(0,y));return true})()`

async function captura(nombre, { url = 'http://localhost:3000/mi', pasos = [], alto = 780, conSesion = true } = {}) {
  await cmd('Emulation.setDeviceMetricsOverride', { width: ANCHO, height: alto, deviceScaleFactor: 2, mobile: true })
  await cmd('Network.clearBrowserCookies')
  if (conSesion) await cmd('Network.setCookie', { name: 'next-auth.session-token', value: TOKEN, domain: 'localhost', path: '/', httpOnly: true })
  await cmd('Page.navigate', { url: 'about:blank' }); await esperar(200)
  await cmd('Page.navigate', { url }); await esperar(conSesion ? 5000 : 3500)
  const traza = []
  for (const p of pasos) { traza.push(await ev(p)); await esperar(700) }
  const r = await cmd('Page.captureScreenshot', { format: 'jpeg', quality: 82 })
  writeFileSync(`${OUT}/${nombre}.jpg`, Buffer.from(r.data, 'base64'))
  console.log(`  ${nombre}.jpg  [${traza.join(', ')}]  ${Math.round(r.data.length * 0.75 / 1024)} KB`)
}
await cmd('Page.addScriptToEvaluateOnNewDocument', { source: INIT })

const abrir1 = `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Marca Ejemplo/.test(x.textContent));if(b){b.click();return true}return false})()`
await captura('01-entrar', { url: 'http://localhost:3000/login?volver=/mi', conSesion: false, pasos: [marcar('Ingresar con Google')], alto: 700 })
await captura('02-agenda', { alto: 700 })
await captura('03-confirmar', { pasos: [abrir1, marcar('Confirmo')], alto: 760 })
await captura('04-no-puedo', { pasos: [abrir1, click('No puedo'), marcar('Avisar que no puedo')], alto: 700 })
await captura('05-avisos', { pasos: [scrollA('Avisos en este celular'), marcar('Activar avisos')], alto: 560 })
await captura('06-dias', { pasos: [scrollA('Días que no podés')], alto: 620 })
await captura('07-nota', { pasos: [abrir1, scrollA('Para la editora'), marcar('Dejar una nota para la editora')], alto: 560 })
await captura('08-facturar', { pasos: [click('Facturar'), click('Septiembre'), scrollA('Tu factura de septiembre'), marcar('Subir mi factura')], alto: 700 })
await captura('09-gasto', { pasos: [click('Facturar'), scrollA('Gastos que pagaste vos'), marcar('＋ Pasar un gasto')], alto: 520 })
await captura('10-como-quedo', { pasos: [click('Cómo quedó'), marcar('Ver cómo quedó')], alto: 760 })
await captura('11-ficha', { pasos: [click('Mi ficha'), scrollA('Tu historial')], alto: 620 })
ws.close(); chrome.kill(); console.log('listo')

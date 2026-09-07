// Capturas reales del módulo Edición, para la guía del equipo.
// Maneja Chrome por CDP con el WebSocket nativo de Node — sin instalar nada.
import { spawn } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { encode } from 'next-auth/jwt'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1); return [l.slice(0,i).trim(), v]
}))
const SECRET = env.NEXTAUTH_SECRET
if (!SECRET) { console.log('falta NEXTAUTH_SECRET'); process.exit(1) }

const QUIEN = process.argv[2] || 'juan@somosmagma.com'
const OUT = '/tmp/capturas'
mkdirSync(OUT, { recursive: true })

// Sesión válida firmada con el mismo secreto que usa la app en local
const token = await encode({ token: { name:'Juan', email:QUIEN, sub:QUIEN, picture:null }, secret: SECRET })
console.log('sesión generada para', QUIEN)

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chrome = spawn(CHROME, [
  '--headless=new','--remote-debugging-port=9222','--no-first-run','--no-default-browser-check',
  '--hide-scrollbars','--force-device-scale-factor=2',
  `--user-data-dir=/tmp/chrome-magma`, 'about:blank',
], { stdio:'ignore' })

const esperar = ms => new Promise(r => setTimeout(r, ms))
await esperar(2500)

const lista = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const target = lista.find(t => t.type === 'page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r => ws.onopen = r)

let id = 0
const pend = new Map()
ws.onmessage = e => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id) }
}
const cmd = (method, params={}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id:i, method, params })) })

await cmd('Page.enable'); await cmd('Network.enable'); await cmd('Runtime.enable')
await cmd('Network.setCookie', { name:'next-auth.session-token', value:token, domain:'localhost', path:'/', httpOnly:true })

async function captura(nombre, { ancho=1280, alto=900, antes=null, espera=3500 } = {}) {
  await cmd('Emulation.setDeviceMetricsOverride', { width:ancho, height:alto, deviceScaleFactor:2, mobile:ancho<600 })
  await cmd('Page.navigate', { url:'http://localhost:3000/' })
  await esperar(espera)
  if (antes) { await cmd('Runtime.evaluate', { expression: antes, awaitPromise:true }); await esperar(1800) }
  const r = await cmd('Page.captureScreenshot', { format:'png' })
  if (!r?.data) { console.log(`  ✗ ${nombre}`); return }
  writeFileSync(`${OUT}/${nombre}.png`, Buffer.from(r.data, 'base64'))
  console.log(`  ✓ ${nombre}.png`)
}

// helpers que corren dentro de la página
const clickTexto = t => `(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim().includes(${JSON.stringify(t)}));if(b)b.click();return !!b})()`
const irAEdicion = clickTexto('Edición')

console.log('\nsacando capturas…')
await captura('01-inicio', { espera:5000 })
await captura('02-tablero', { antes: irAEdicion })
await captura('03-tablero-celular', { ancho:414, alto:860, antes: irAEdicion })

ws.close(); chrome.kill()
console.log(`\nlisto → ${OUT}`)

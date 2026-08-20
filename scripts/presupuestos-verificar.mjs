// Verifica que los números de PRESUPUESTOS cierren.
//   node scripts/presupuestos-verificar.mjs [dias]     (default 90)
// Chequea, por cada presupuesto: Subtotal+Fee+Gan+IIBB+Interés+Ajuste == Total == Precio Final,
// que Ganancias sea 35% del Fee y IIBB 4% del Fee, y que el Precio Final espeje al PROYECTO.
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const DIAS = Number(process.argv[2]) || 90
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
  return [l.slice(0,i).trim(),v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({version:'v4',auth})
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
// el sheet guarda los montos en formato US: " $1,234,567.00"
const num = v => { const s=String(v||'').replace(/[\s$]/g,''); if(!s) return 0; return Number(s.replace(/,/g,'')) || 0 }
const ar = n => n.toLocaleString('es-AR')
const fecha = s => { const m=String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(!m) return null; let y=+m[3]; if(y<100)y+=2000; return new Date(y,+m[2]-1,+m[1]) }
const get = async r => (await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:r})).data.values || []

const [pres,proy] = await Promise.all([get('PRESUPUESTOS!A:BE'), get('PROYECTOS!A:CI')])
const H = pres[0]||[], HR = proy[0]||[]
// mismos índices que usa pages/api/presupuesto-precio.js
const P  = { pf:8, sub:38, fee:39, gan:40, iibb:41, int:44, tot:45, aj:46 }
const PR = { nro:2, total:7 }

// si el sheet se renumera, los índices fijos apuntan a otra columna: avisar antes de nada
const esperado = { pf:'Precio Final', sub:'Subtotal', fee:'Fee Agencia', gan:'Impuesto a las ganancias', iibb:'IIBB', int:'Interes $', tot:'Total', aj:'Ajuste' }
const desfasados = Object.entries(esperado).filter(([k,v]) => String(H[P[k]]||'').trim() !== v)
if (desfasados.length) {
  console.log('⚠️  LAS COLUMNAS SE MOVIERON — presupuesto-precio.js va a escribir en el lugar equivocado:')
  desfasados.forEach(([k,v]) => console.log(`   ${k}: esperaba "${v}" y encontró "${H[P[k]]}"`))
  console.log('')
}

const iFP=H.indexOf('Fecha Presupuesto'), iEst=H.indexOf('Estado'), iCli=H.indexOf('Cliente'), iProy=H.indexOf('Proyecto')
const iAd=H.indexOf('Es Adicional'), iMan=H.indexOf('Precio Cliente Manual')
const pedidos=[]; for(let c=0;c<H.length;c++){ const m=/^Pedido (\d+)$/.exec(H[c]); if(m) pedidos.push({p:c, pr:H.indexOf('Precio '+m[1])}) }

const desde = new Date(Date.now() - DIAS*864e5)
const noCierra=[], impMal=[], sinImp=[], adicSueltos=[], espejoMal=[]
let n=0

for (let i=1;i<pres.length;i++){
  const r=pres[i]; const nro=String(r[0]||'').trim(); if(!nro) continue
  const fp=fecha(r[iFP]); if(!fp || fp<desde) continue
  n++
  const o={fila:i+1, nro, cli:r[iCli], proy:r[iProy], est:String(r[iEst]||''), fp:r[iFP],
    pf:num(r[P.pf]), sub:num(r[P.sub]), fee:num(r[P.fee]), gan:num(r[P.gan]),
    iibb:num(r[P.iibb]), int:num(r[P.int]), tot:num(r[P.tot]), aj:num(r[P.aj])}
  const partes = o.sub+o.fee+o.gan+o.iibb+o.int+o.aj
  if (Math.abs(partes-o.pf)>1 || Math.abs(o.pf-o.tot)>1)
    noCierra.push({...o, partes, deberia: Math.round(o.pf-(partes-o.aj))})
  if (o.fee>0 && o.gan>0 && Math.abs(o.gan-o.fee*0.35)>2) impMal.push({...o, campo:'Ganancias', esperado:Math.round(o.fee*0.35), real:o.gan})
  if (o.fee>0 && o.iibb>0 && Math.abs(o.iibb-o.fee*0.04)>2) impMal.push({...o, campo:'IIBB', esperado:Math.round(o.fee*0.04), real:o.iibb})
  if (o.fee>0 && (o.gan===0 || o.iibb===0)) sinImp.push(o)

  // adicionales aprobados: se ofrecieron, ¿se cobraron?
  const ad=String(r[iAd]||'').split('|'), mn=String(r[iMan]||'').split('|')
  let k=0, ventaAd=0, nAd=0
  pedidos.forEach(({p,pr}) => { if(!String(r[p]||'').trim()) return; if(ad[k]==='1'){ nAd++; ventaAd += num(mn[k])||num(r[pr]) } k++ })
  if (nAd && ventaAd>0 && /^APROBADO/i.test(o.est.trim()) && Math.abs(partes-o.pf)<=1) adicSueltos.push({...o, nAd, ventaAd})

  if (/^APROBADO/i.test(o.est.trim()) && o.pf>0) {
    const j = proy.findIndex((x,ix) => ix>0 && String(x[PR.nro]||'').trim()===nro)
    if (j>0 && Math.abs(num(proy[j][PR.total])-o.pf)>1) espejoMal.push({...o, pt:num(proy[j][PR.total])})
  }
}

console.log(`PRESUPUESTOS — últimos ${DIAS} días: ${n} presupuestos\n`)
const bloque = (titulo, lista, fmt) => {
  console.log(`${lista.length ? '✗' : '✓'} ${titulo}: ${lista.length}`)
  lista.slice(0,20).forEach(o => console.log('    '+fmt(o)))
  if (lista.length>20) console.log(`    … y ${lista.length-20} más`)
  console.log('')
}
bloque('No cierran (las partes no dan el Precio Final)', noCierra,
  o=>`#${o.nro} ${o.fp} ${String(o.cli||'').slice(0,18).padEnd(18)} [${o.est.slice(0,9)}] partes $${ar(Math.round(o.partes))} vs Precio Final $${ar(o.pf)} — el Ajuste debería ser $${ar(o.deberia)} y dice $${ar(o.aj)}`)
bloque('Ganancias/IIBB fuera del 35% / 4% del Fee', impMal,
  o=>`#${o.nro} ${String(o.cli||'').slice(0,18).padEnd(18)} ${o.campo}: $${ar(o.real)} y debería ser $${ar(o.esperado)}`)
bloque('Con Fee pero sin Ganancias o sin IIBB (tilde apagado)', sinImp,
  o=>`#${o.nro} ${String(o.cli||'').slice(0,18).padEnd(18)} fee $${ar(o.fee)} · gan $${ar(o.gan)} · iibb $${ar(o.iibb)} · precio $${ar(o.pf)}`)
bloque('Aprobados con adicional ofrecido — chequear si el cliente lo tomó', adicSueltos,
  o=>`#${o.nro} ${String(o.cli||'').slice(0,18).padEnd(18)} ${o.nAd} adic por $${ar(o.ventaAd)} — precio $${ar(o.pf)} (¿lo tomó el cliente?)`)
bloque('Precio del presupuesto != Total del proyecto', espejoMal,
  o=>`#${o.nro} ${String(o.cli||'').slice(0,18).padEnd(18)} presu $${ar(o.pf)} vs proyecto $${ar(o.pt)}`)

const roto = noCierra.length+impMal.length+espejoMal.length
console.log(roto ? `→ ${roto} cosas para revisar.` : '→ Todo cierra.')

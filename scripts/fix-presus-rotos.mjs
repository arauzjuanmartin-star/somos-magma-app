// Arregla los 3 presupuestos cuyas partes no dan el Precio Final (detectados 2026-08-20).
//   node scripts/fix-presus-rotos.mjs              -> preview
//   node scripts/fix-presus-rotos.mjs --escribir   -> escribe
// El Precio Final NO se toca en ninguno: está confirmado contra FACTURACION y PROYECTOS.
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const ESCRIBIR = process.argv.includes('--escribir')
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const num=v=>{const s=String(v||'').replace(/[\s$]/g,'');if(!s)return 0;return Number(s.replace(/,/g,''))||0}
const ar=n=>n.toLocaleString('es-AR')
const col=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}
const g=async r=>(await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:r})).data.values||[]

const pres=await g('PRESUPUESTOS!A:BE'), H=pres[0]||[]
const P={pf:8,sub:38,fee:39,gan:40,iibb:41,int:44,tot:45,aj:46}
const iFeeSvc=H.indexOf('Fee Servicios')
const fila=nro=>{for(let i=1;i<pres.length;i++) if(String(pres[i][0]||'').trim()===nro) return i+1; return -1}

// Cada arreglo: qué celdas cambian y por qué. El Ajuste absorbe la diferencia, igual que hace la app.
const casos=[]
{ // #2078 Hard Rock — vendió 2 adicionales; el precio los incluye pero el Ajuste quedó del cálculo previo
  const f=fila('2078'), r=pres[f-1]
  const partesSinAj=num(r[P.sub])+num(r[P.fee])+num(r[P.gan])+num(r[P.iibb])+num(r[P.int])
  casos.push({nro:'2078', fila:f, cli:'Hard Rock / Lanzamiento',
    motivo:'Los 2 adicionales (Edit 60s+ y FPV) ya están dentro del Precio Final — confirmado con la factura 0001-00000127 de $2.655.950 = $2.195.000 + IVA. Solo faltaba recalcular el Ajuste.',
    cambios:[{campo:'Ajuste', col:P.aj, de:num(r[P.aj]), a:Math.round(num(r[P.pf])-partesSinAj)}]})
}
{ // #2182 Meikin — descuento previo + adicional Vivo ½ vendido a $550.000; el Ajuste neto nunca se recalculó
  const f=fila('2182'), r=pres[f-1]
  const partesSinAj=num(r[P.sub])+num(r[P.fee])+num(r[P.gan])+num(r[P.iibb])+num(r[P.int])
  casos.push({nro:'2182', fila:f, cli:'Meikin / Cobertuna 3 fechas',
    motivo:'El adicional "Vivo ½" se vendió a $550.000 y está dentro del Precio Final de $4.550.000 (coincide con el Total del proyecto). El Ajuste seguía teniendo el descuento viejo sin sumarle el adicional.',
    cambios:[{campo:'Ajuste', col:P.aj, de:num(r[P.aj]), a:Math.round(num(r[P.pf])-partesSinAj)}]})
}
{ // #2193 Tripin Jujuy — comisión que Juan le paga a Magma por usar la cámara: ingreso sin costo.
  // La app hace fee = otro tanto encima del precio del pedido, así que con el tilde puesto contaba $180.000.
  const f=fila('2193'), r=pres[f-1]
  casos.push({nro:'2193', fila:f, cli:'Juan / Tripin Jujuy',
    motivo:'Comisión de $90.000 que Juan le pagó a Magma por usar la cámara. Entraron $90.000 y no se le pagó a nadie. El tilde "Fee" del pedido hacía que la app contara $90.000 de costo MÁS $90.000 de fee = $180.000.',
    cambios:[{campo:'Fee Agencia', col:P.fee, de:num(r[P.fee]), a:0},
             {campo:'Fee Servicios (máscara)', col:iFeeSvc, de:String(r[iFeeSvc]||''), a:'0', texto:true},
             {campo:'Ajuste', col:P.aj, de:num(r[P.aj]), a:0}]})
}

console.log(ESCRIBIR?'>>> ESCRIBIENDO <<<\n':'--- PREVIEW (no escribe nada) ---\n')
const data=[]
for(const c of casos){
  const r=pres[c.fila-1]
  console.log(`#${c.nro} — ${c.cli}  (fila ${c.fila})`)
  console.log(`  ${c.motivo}`)
  c.cambios.forEach(x=>{
    console.log(`    ${x.campo.padEnd(24)} ${x.texto?`"${x.de}"`:'$'+ar(x.de)}  →  ${x.texto?`"${x.a}"`:'$'+ar(x.a)}`)
    data.push({range:`PRESUPUESTOS!${col(x.col)}${c.fila}`, values:[[x.a]]})
  })
  // verificación: con los cambios aplicados, ¿cierra?
  const v={sub:num(r[P.sub]),fee:num(r[P.fee]),gan:num(r[P.gan]),iibb:num(r[P.iibb]),int:num(r[P.int]),aj:num(r[P.aj])}
  c.cambios.forEach(x=>{ if(x.col===P.fee)v.fee=x.a; if(x.col===P.aj)v.aj=x.a })
  const partes=v.sub+v.fee+v.gan+v.iibb+v.int+v.aj, pf=num(r[P.pf])
  console.log(`    queda: ${ar(v.sub)} + ${ar(v.fee)} + ${ar(v.gan)} + ${ar(v.iibb)} + ${ar(v.int)} + ${ar(v.aj)} = $${ar(Math.round(partes))}  vs Precio Final $${ar(pf)}  ${Math.abs(partes-pf)<=1?'✓ CIERRA':'✗ NO CIERRA'}`)
  console.log(`    Precio Final: $${ar(pf)} (NO se toca)\n`)
}
if(!ESCRIBIR){ console.log('Para aplicarlo: node scripts/fix-presus-rotos.mjs --escribir'); process.exit(0) }
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:SHEET_ID,requestBody:{valueInputOption:'USER_ENTERED',data}})
// el proyecto espeja el Ajuste (col BH) — mantenerlo igual que el presupuesto
const proy=await g('PROYECTOS!A:CI'); const dp=[]
for(const c of casos){
  const aj=c.cambios.find(x=>x.col===P.aj); if(!aj) continue
  const j=proy.findIndex((x,ix)=>ix>0&&String(x[2]||'').trim()===c.nro)
  if(j>0){ dp.push({range:`PROYECTOS!BH${j+1}`, values:[[aj.a]]}); console.log(`  proyecto #${c.nro} fila ${j+1}: Ajuste → $${ar(aj.a)}`) }
}
if(dp.length) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:SHEET_ID,requestBody:{valueInputOption:'USER_ENTERED',data:dp}})
await sheets.spreadsheets.values.append({spreadsheetId:SHEET_ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:casos.map(c=>[new Date().toISOString(),'juan@somosmagma.com (script)','fix-presus-rotos','PRESUPUESTOS',c.nro,c.cambios.map(x=>`${x.campo}: ${x.de} → ${x.a}`).join(' · ')])}})
console.log('\nListo. Queda registrado en LOG.')

/**
 * Carga en GASTOS_FIJOS, justo debajo de la fila "AGREGAR GASTOS TARJETA",
 * los gastos de estructura que se pagan con tarjeta y no estaban anotados.
 * Los pidió Mariana ahí para verlos y filtrarlos junto al resto (Regla #4).
 *
 * Van con Categoria="Tarjeta" y la app las EXCLUYE del total de Egresos a
 * propósito: el resumen de la tarjeta ya se cuenta entero como egreso del mes,
 * así que sumarlas otra vez duplicaría el gasto. Ver Egresos en pages/index.js.
 *
 * Es idempotente: no vuelve a cargar un concepto que ya esté.
 *
 * Uso:  node scripts/gastos-tarjeta-a-gastos-fijos.mjs             (preview)
 *       node scripts/gastos-tarjeta-a-gastos-fijos.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim(); if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
  return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR=process.argv.includes('--escribir')
const MES=Number(process.argv.find(a=>/^\d+$/.test(a))||7), ANIO=2026
const ANCLA=/agregar gastos tarjeta/i
const CAT='Tarjeta'

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['MOVIMIENTOS_TARJETA!A:N','GASTOS_FIJOS!A:Q'],valueRenderOption:'FORMATTED_VALUE'})
const obj=v=>{const [h,...f]=v.values||[];return f.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
const [MOV,GF]=R.data.valueRanges.map(obj)
const H=R.data.valueRanges[1].values[0]
const num=v=>{const n=parseFloat(String(v).replace(/[^0-9.-]/g,''));return isNaN(n)?0:n}
const fmt=n=>'$'+Math.round(n).toLocaleString('es-AR')

// mismos criterios que gastos-fijos-tarjeta.mjs
const FIJO=/^(software|seguros|oficina|telefon|internet)/i
const STOP=new Set(['OFICINA','MAGMA','POLIZA','PÓLIZA','COBRO','DUPLICADO','REVERSO','TARJETA','GASTOS','AGREGAR','PLAN','PAGO','SALDO','ANUAL','RENOVACION','RENOVACIÓN',
  'ADS','SOFTWARE','WEB','USD','ARS','VARIOS','OTROS','SERVICIOS','SERVICIO','COSTOS','COSTO','MENSUAL','SUSCRIPCION','SUSCRIPCIONES'])
const toks=s=>new Set(String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .split(/[^A-Z0-9]+/).filter(t=>t.length>=3&&!STOP.has(t)&&!/^\d+$/.test(t)))
const gfAct=GF.filter(g=>{const a=String(g['Activo']||'').toUpperCase()
  return (a===''||a==='SI'||a==='SÍ'||a==='TRUE')&&!/[uú]nico/i.test(String(g['Frecuencia']))&&num(g['Monto'])>0})
  .map(g=>({con:String(g['Concepto']||''),monto:num(g['Monto']),tk:toks(g['Concepto'])}))
const yaEnGF=c=>{const t=toks(c);return gfAct.find(g=>[...t].some(x=>g.tk.has(x)))}
const base=s=>String(s||'').replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim().toUpperCase()||'(sin comercio)'

const G={}
MOV.filter(m=>/empresa/i.test(String(m['Categoria']||''))&&FIJO.test(String(m['Subcategoria']||''))
  &&String(m['Mes']).trim()===String(MES)&&String(m['Año']).includes(String(ANIO))).forEach(m=>{
  const mon=String(m['Moneda']||'ARS').toUpperCase()
  const k=base(m['Comercio'])+'|'+mon
  const g=G[k]=G[k]||{com:base(m['Comercio']),sub:String(m['Subcategoria']||''),tarj:String(m['Tarjeta']||''),mon,neto:0}
  g.neto+=num(m['Monto'])
})
// solo lo que falta: lo que ya está arriba en GASTOS_FIJOS se duplicaría
const faltan=Object.values(G).filter(g=>Math.abs(g.neto)>0.5&&!yaEnGF(g.com))
  .sort((a,b)=>(a.mon===b.mon? b.neto-a.neto : a.mon==='ARS'?-1:1))
// y lo que ya se cargó en una corrida anterior
const yaCargado=new Set(GF.filter(g=>String(g['Categoria']||'').trim().toLowerCase()===CAT.toLowerCase())
  .map(g=>String(g['Concepto']||'').trim().toUpperCase()))
const nuevas=faltan.filter(g=>!yaCargado.has(g.com))

const filaAncla=GF.findIndex(g=>ANCLA.test(String(g['Concepto']||'')))+2   // +1 header, +1 base-1
if(filaAncla<2){ console.error('No encuentro la fila "AGREGAR GASTOS TARJETA". Freno.'); process.exit(1) }

const set=(o)=>{const f=new Array(H.length).fill(''); Object.entries(o).forEach(([k,v])=>{const i=H.indexOf(k); if(i>=0)f[i]=v}); return f}
const filas=nuevas.map(g=>set({
  'Categoria':CAT, 'Concepto':g.com, 'Monto':g.neto, 'Moneda':g.mon, 'Frecuencia':'mensual',
  'Persona/Cuenta':g.tarj, 'Activo':'SI', 'Tipo':g.sub,
  'Observacion':`Se paga con ${g.tarj}. Valor de ${MES}/${ANIO}. Ya viene dentro del resumen de la tarjeta — no sumarlo aparte al total del mes.`,
}))

console.log(`\nGASTOS_FIJOS · la fila "AGREGAR GASTOS TARJETA" es la ${filaAncla}`)
console.log(`Se insertan ${filas.length} filas justo debajo (fila ${filaAncla+1} en adelante)\n`)
if(yaCargado.size) console.log(`(ya había ${yaCargado.size} cargadas de una corrida anterior, no se repiten)\n`)
console.log(`${'CATEGORIA'.padEnd(10)} ${'CONCEPTO'.padEnd(26)} ${'MONTO'.padStart(12)} ${'MON'.padEnd(4)} ${'TARJETA'.padEnd(16)} RUBRO`)
console.log('-'.repeat(94))
filas.forEach((f,i)=>{const g=nuevas[i]
  console.log(`${CAT.padEnd(10)} ${g.com.slice(0,25).padEnd(26)} ${(g.mon==='USD'?'US$ '+Math.round(g.neto):fmt(g.neto)).padStart(12)} ${g.mon.padEnd(4)} ${g.tarj.padEnd(16)} ${g.sub}`)})
console.log('-'.repeat(94))
const tA=nuevas.filter(g=>g.mon!=='USD').reduce((s,g)=>s+g.neto,0), tU=nuevas.filter(g=>g.mon==='USD').reduce((s,g)=>s+g.neto,0)
console.log(`${''.padEnd(37)} ${fmt(tA).padStart(12)}  + US$ ${Math.round(tU)}`)
console.log(`\nVan con Activo=SI (es la verdad) y Categoria="${CAT}".`)
console.log(`La app EXCLUYE esa categoría del total de Egresos: el resumen de la tarjeta ya se cuenta entero.`)

if(!filas.length){ console.log('\nNada para cargar.'); process.exit(0) }
if(!ESCRIBIR){ console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir. ---'); process.exit(0) }

const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId))'})
const sheetId=meta.data.sheets.find(s=>s.properties.title==='GASTOS_FIJOS').properties.sheetId
await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
  {insertDimension:{range:{sheetId,dimension:'ROWS',startIndex:filaAncla,endIndex:filaAncla+filas.length},inheritFromBefore:false}},
]}})
await sheets.spreadsheets.values.update({spreadsheetId:ID,range:`GASTOS_FIJOS!A${filaAncla+1}`,
  valueInputOption:'USER_ENTERED',requestBody:{values:filas}})

// ── verificar releyendo ──
const v=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'GASTOS_FIJOS!A:Q'})
const V2=v.data.values||[], H2=V2[0]
const iCat=H2.indexOf('Categoria'), iCon=H2.indexOf('Concepto'), iMon=H2.indexOf('Monto')
const cargadas=V2.slice(1).filter(f=>String(f[iCat]||'').trim().toLowerCase()===CAT.toLowerCase())
const anclaAhora=V2.findIndex(f=>ANCLA.test(String(f[iCon]||'')))+1
console.log(`\n✓ "AGREGAR GASTOS TARJETA" quedó en la fila ${anclaAhora}`)
console.log(`✓ ${cargadas.length} filas con Categoria="${CAT}" (esperadas ${filas.length+yaCargado.size})`)
console.log(`✓ primera cargada: fila ${anclaAhora+1} · ${V2[anclaAhora]?.[iCon]} · ${V2[anclaAhora]?.[iMon]}`)
const faltaAlguna=nuevas.filter(g=>!cargadas.some(f=>String(f[iCon]||'').trim().toUpperCase()===g.com))
console.log(faltaAlguna.length? `✗ no se escribieron: ${faltaAlguna.map(g=>g.com).join(', ')}` : '✓ se escribieron todas')
if(faltaAlguna.length||cargadas.length!==filas.length+yaCargado.size) process.exit(1)
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan (script)','gastos-tarjeta-a-gastos-fijos','GASTOS_FIJOS',String(filaAncla+1),`${filas.length} gastos de tarjeta`]]}}) }catch(e){}

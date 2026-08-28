/**
 * Los gastos FIJOS que se pagan con tarjeta — lo que pidió Mariana para el
 * estado de resultados. En GASTOS_FIJOS hay una fila que dice literalmente
 * "AGREGAR GASTOS TARJETA $0": esto es eso.
 *
 * Usa un mes de referencia (el último bien cargado, julio 2026 por default),
 * netea los cobros duplicados con su reverso, y cruza contra GASTOS_FIJOS para
 * marcar lo que YA está contado ahí — si no, se suma dos veces al resultado.
 *
 * Uso: node scripts/gastos-fijos-tarjeta.mjs [mes] [anio]
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim(); if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
  return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const MES=Number(process.argv[2]||7), ANIO=Number(process.argv[3]||2026)
const MESN=['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['MOVIMIENTOS_TARJETA!A:N','GASTOS_FIJOS!A:Q'],valueRenderOption:'FORMATTED_VALUE'})
const obj=v=>{const [h,...f]=v.values||[];return f.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
const [MOV,GF]=R.data.valueRanges.map(obj)
const num=v=>{const n=parseFloat(String(v).replace(/[^0-9.-]/g,''));return isNaN(n)?0:n}
const fmt=n=>(n<0?'-$':'$')+Math.abs(Math.round(n)).toLocaleString('es-AR')

// Estructura = lo que se paga aunque no haya un solo rodaje. Producción y compras
// varían con el trabajo (no son estructura); bancarios son financieros.
const FIJO=/^(software|seguros|oficina|telefon|internet)/i
const esFijo=m=>/empresa/i.test(String(m['Categoria']||''))&&FIJO.test(String(m['Subcategoria']||''))
const delMes=m=>String(m['Mes']).trim()===String(MES)&&String(m['Año']).includes(String(ANIO))
const mov=MOV.filter(m=>esFijo(m)&&delMes(m))

// Cruce con GASTOS_FIJOS por palabras en común (≥3 letras), salteando las genéricas
// que harían matchear cualquier cosa con cualquier cosa.
const STOP=new Set(['OFICINA','MAGMA','POLIZA','PÓLIZA','COBRO','DUPLICADO','REVERSO','TARJETA','GASTOS','AGREGAR','PLAN','PAGO','SALDO','ANUAL','RENOVACION','RENOVACIÓN'])
const toks=s=>new Set(String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .split(/[^A-Z0-9]+/).filter(t=>t.length>=3&&!STOP.has(t)&&!/^\d+$/.test(t)))
const gfAct=GF.filter(g=>{const a=String(g['Activo']||'').toUpperCase();return (a===''||a==='SI'||a==='SÍ'||a==='TRUE')&&!/[uú]nico/i.test(String(g['Frecuencia']))&&num(g['Monto'])>0})
  .map(g=>({con:String(g['Concepto']||''),monto:num(g['Monto']),tk:toks(g['Concepto'])}))
const yaEnGF=c=>{const t=toks(c);return gfAct.find(g=>[...t].some(x=>g.tk.has(x)))}

// Agrupar por comercio "base": sacar el sufijo entre paréntesis junta la póliza
// con su cobro duplicado y su reverso, que se netean solos.
const base=s=>String(s||'').replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim().toUpperCase()||'(sin comercio)'
const G={}
mov.forEach(m=>{
  const k=base(m['Comercio'])+'|'+String(m['Moneda']||'ARS').toUpperCase()
  const g=G[k]=G[k]||{com:base(m['Comercio']),sub:String(m['Subcategoria']||''),mon:String(m['Moneda']||'ARS').toUpperCase(),neto:0,lineas:[],rev:false}
  g.neto+=num(m['Monto']); g.lineas.push(m)
  if(/reverso|duplicad/i.test(String(m['Comercio']))) g.rev=true
})
const lista=Object.values(G).filter(g=>Math.abs(g.neto)>0.5).sort((a,b)=>(a.mon===b.mon? b.neto-a.neto : a.mon==='ARS'?-1:1))

console.log(`\n${'='.repeat(94)}`)
console.log(`GASTOS FIJOS PAGADOS CON TARJETA · ${MESN[MES]} ${ANIO}   (para el estado de resultados)`)
console.log(`${'='.repeat(94)}\n`)
console.log(`${'CONCEPTO'.padEnd(30)} ${'RUBRO'.padEnd(24)} ${'DEL MES'.padStart(12)}   YA ESTÁ EN GASTOS_FIJOS`)
console.log('-'.repeat(94))
let ars=0, usd=0, dup=0
lista.forEach(g=>{
  const y=yaEnGF(g.com)
  if(g.mon==='USD') usd+=g.neto; else { ars+=g.neto; if(y) dup+=g.neto }
  const m=g.mon==='USD'?`US$ ${Math.round(g.neto).toLocaleString('es-AR')}`:fmt(g.neto)
  console.log(`${g.com.slice(0,29).padEnd(30)} ${g.sub.slice(0,23).padEnd(24)} ${m.padStart(12)}   ${y?`⚠ sí — "${y.con}" ${fmt(y.monto)}`:''}`)
  if(g.rev) console.log(`${''.padEnd(30)} ${'  └ neto de un cobro duplicado + su reverso'}`)
})
console.log('-'.repeat(94))
console.log(`${'TOTAL EN PESOS'.padEnd(55)} ${fmt(ars).padStart(12)}`)
console.log(`${'TOTAL EN DÓLARES'.padEnd(55)} ${('US$ '+Math.round(usd).toLocaleString('es-AR')).padStart(12)}`)
console.log(`\n${'  · ya contado en GASTOS_FIJOS (NO volver a sumarlo)'.padEnd(55)} ${fmt(dup).padStart(12)}`)
console.log(`${'  · SOLO en la tarjeta — esto es lo que falta en el estado'.padEnd(55)} ${fmt(ars-dup).padStart(12)}`)

// posibles duplicados sin reverso: mismo monto exacto, mismo rubro, distinto comercio
const porMonto={}
lista.filter(g=>g.mon==='ARS').forEach(g=>{const k=Math.round(g.neto)+'|'+g.sub; (porMonto[k]=porMonto[k]||[]).push(g.com)})
const sosp=Object.entries(porMonto).filter(([,v])=>v.length>1)
if(sosp.length){ console.log(`\n⚠ REVISAR — mismo monto exacto, mismo rubro, dos veces (¿cobro duplicado sin reverso?):`)
  sosp.forEach(([k,v])=>console.log(`   ${fmt(Number(k.split('|')[0]))}  ${k.split('|')[1]}  →  ${v.join('  +  ')}`)) }

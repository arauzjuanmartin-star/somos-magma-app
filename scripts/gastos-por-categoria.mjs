/**
 * A.7 de la Práctica 2 — reagrupar la estructura fija por categoría para ver qué recortar.
 * Pedido de Sofi (01/08): "Organizar los gastos por tipo/categoría".
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')

const G=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'GASTOS_FIJOS!A:H',valueRenderOption:'FORMATTED_VALUE'})).data.values||[]
const h=G[0], C=n=>h.indexOf(n)
// mismo filtro que snapshot-coach.mjs: solo los activos y solo lo mensual
const filas=G.slice(1).filter(r=>r&&txt(r[C('Concepto')])&&/^s[ií]$|^activo$|^true$/i.test(txt(r[C('Activo')])))
const mensual=filas.filter(r=>/mensual/i.test(txt(r[C('Frecuencia')])))
const otros  =filas.filter(r=>!/mensual/i.test(txt(r[C('Frecuencia')])))

const cat={}
mensual.forEach(r=>{ const k=txt(r[C('Categoria')])||'(sin categoría)'
  ;(cat[k]=cat[k]||[]).push({c:txt(r[C('Concepto')]), m:num(r[C('Monto')]), q:txt(r[C('Persona/Cuenta')])}) })

const total=Object.values(cat).flat().reduce((a,x)=>a+x.m,0)
console.log(`\n${'█'.repeat(78)}\n  ESTRUCTURA FIJA MENSUAL POR CATEGORÍA — ${M(total)}/mes\n${'█'.repeat(78)}`)

Object.entries(cat).sort((a,b)=>b[1].reduce((s,x)=>s+x.m,0)-a[1].reduce((s,x)=>s+x.m,0)).forEach(([k,items])=>{
  const s=items.reduce((a,x)=>a+x.m,0), pct=(s/total*100)
  const barra='█'.repeat(Math.max(1,Math.round(pct/2)))
  console.log(`\n\x1b[1m  ${k.toUpperCase().padEnd(16)} ${M(s).padStart(14)}   ${pct.toFixed(1).padStart(5)}%  \x1b[36m${barra}\x1b[0m`)
  items.sort((a,b)=>b.m-a.m).forEach(x=>console.log(`     ${x.c.slice(0,42).padEnd(44)} ${M(x.m).padStart(13)}  ${x.q||''}`))
})

console.log(`\n${'─'.repeat(78)}`)
console.log(`  TOTAL MENSUAL ${M(total).padStart(58)}`)

if(otros.length){
  console.log(`\n\x1b[33m  ── fuera del mensual (${otros.length}) — no suman a la estructura ──\x1b[0m`)
  otros.forEach(r=>console.log(`     ${txt(r[C('Concepto')]).slice(0,42).padEnd(44)} ${M(num(r[C('Monto')])).padStart(13)}  ${txt(r[C('Frecuencia')])}`))
}

// ── lo accionable: dónde está la plata que se puede tocar ──
console.log(`\n${'█'.repeat(78)}\n  DÓNDE MIRAR PRIMERO\n${'█'.repeat(78)}`)
const top=Object.values(cat).flat().sort((a,b)=>b.m-a.m).slice(0,10)
console.log(`\n  Los 10 conceptos más caros concentran ${M(top.reduce((a,x)=>a+x.m,0))} (${(top.reduce((a,x)=>a+x.m,0)/total*100).toFixed(0)}% del total):`)
top.forEach((x,i)=>console.log(`   ${String(i+1).padStart(2)}. ${x.c.slice(0,44).padEnd(46)} ${M(x.m).padStart(13)}  ${(x.m/total*100).toFixed(1)}%`))

const impuestos=Object.entries(cat).filter(([k])=>/impuesto/i.test(k)).flatMap(([,v])=>v).reduce((a,x)=>a+x.m,0)
const sueldos=Object.entries(cat).filter(([k])=>/sueldo|personal|equipo/i.test(k)).flatMap(([,v])=>v).reduce((a,x)=>a+x.m,0)
console.log(`\n  Comprometido y no recortable en el corto plazo:`)
console.log(`     impuestos            ${M(impuestos).padStart(14)}  ${(impuestos/total*100).toFixed(0)}%`)
console.log(`     sueldos/equipo       ${M(sueldos).padStart(14)}  ${(sueldos/total*100).toFixed(0)}%`)
console.log(`     ${'─'.repeat(36)}`)
console.log(`     margen real de recorte ${M(total-impuestos-sueldos).padStart(12)}  ${((total-impuestos-sueldos)/total*100).toFixed(0)}%`)
console.log('')

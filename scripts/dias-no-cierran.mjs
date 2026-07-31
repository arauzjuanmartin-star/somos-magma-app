/**
 * LISTA "NO CIERRA": proyectos donde el reparto de plata sugiere que NO todos
 * fueron la misma cantidad de días (caso COMPARTIR: Lucho fue al armado, el resto no).
 * Compara lo que cobró cada uno contra su tarifa de referencia y contra el resto del equipo.
 * Solo lectura — no escribe nada.
 */
import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const ED=/edit|edici|post|color|dise|anim|motion/i
const NOJOR=/comision|model|makeup|maquilla|viatico|catering|alquiler|equipo/i

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PRESUPUESTOS','PROYECTOS','HISTORICO_2025','RRHH'],valueRenderOption:'FORMATTED_VALUE'})
const [PRE,PRO,H25,RR]=R.data.valueRanges.map(v=>v.values||[])
const iCant=PRE[0].indexOf('Cant. Fechas')
const cantF={}; PRE.slice(1).forEach(r=>{const n=txt(r[0]); const c=num(r[iCant]); if(n&&c) cantF[n]=c})
const tRR={}; RR.slice(1).forEach(r=>{const n=txt(r[0]).toLowerCase(); if(n)tRR[n]={media:num(r[11]),jornada:num(r[12])}})

// ---- armar proyectos ----
function leer2026(){
  const out=[]
  PRO.slice(1).forEach((row,i)=>{
    const fecha=txt(row[3]); if(!/\/202[56]$/.test(fecha))return
    const staff=[]
    PED.forEach(pc=>{const ped=txt(row[pc]); if(!ped||ED.test(ped)||NOJOR.test(ped))return
      const precio=num(row[pc+1]), pers=txt(row[pc+2])
      if(precio<=1||!pers||/somos magma/i.test(pers))return
      staff.push({ped,precio,pers})})
    if(staff.length<1)return
    out.push({origen:'2026',fila:i+2,npresu:txt(row[2]),fecha,agencia:txt(row[4])||'—',
      proy:txt(row[6]),staff,costo:staff.reduce((s,x)=>s+x.precio,0),cant:cantF[txt(row[2])]})
  })
  return out
}
function leer2025(){
  const out=[]
  H25.slice(1).forEach((r,i)=>{
    if(!txt(r[6]))return
    const staff=[]
    ;[15,17,19,21,23,25].forEach(sc=>{const pers=txt(r[sc]); const precio=num(r[sc+1])
      if(!pers||precio<=1||/somos magma/i.test(pers))return
      staff.push({ped:'',precio,pers})})
    if(staff.length<1)return
    out.push({origen:'2025',fila:i+2,npresu:txt(r[3]),fecha:txt(r[2]),agencia:txt(r[5])||txt(r[4])||'—',
      proy:txt(r[6]),staff,costo:staff.reduce((s,x)=>s+x.precio,0)})
  })
  return out
}
const todos=[...leer2026(),...leer2025()]

// tarifa modal por persona, por año (para 2025 los precios son de otra escala)
function modales(lista){
  const ac={}; lista.forEach(p=>p.staff.forEach(s=>(ac[s.pers.toLowerCase()]=ac[s.pers.toLowerCase()]||[]).push(s.precio)))
  const md={}; Object.entries(ac).forEach(([k,a])=>{const c={};a.forEach(x=>c[x]=(c[x]||0)+1)
    md[k]=+Object.entries(c).sort((x,y)=>y[1]-x[1]||(+x[0])-(+y[0]))[0][0]})
  return md
}
const md26=modales(todos.filter(p=>p.origen==='2026')), md25=modales(todos.filter(p=>p.origen==='2025'))

todos.forEach(p=>{
  const md=p.origen==='2026'?md26:md25
  p.staff.forEach(s=>{
    const t=tRR[s.pers.toLowerCase()], media=/1\/2|½/.test(s.ped)
    const r=(p.origen==='2026'&&t&&t.jornada)?(media?(t.media||t.jornada/2):t.jornada):(md[s.pers.toLowerCase()]||0)
    s.ref=r; s.dias=r?+(s.precio/r).toFixed(1):null
  })
  const ds=p.staff.filter(s=>s.dias!==null).map(s=>s.dias)
  p.maxD=ds.length?Math.max(...ds):1
  p.minD=ds.length?Math.min(...ds):1
  // NO CIERRA si: alguien >=1.6 días Y hay dispersión con el resto, o choca con Cant. Fechas
  p.dispersion = p.maxD>=1.6 && (p.maxD-p.minD)>=0.8
  p.chocaCant = p.cant!==undefined && p.maxD>=1.6 && Math.abs(Math.round(p.maxD)-p.cant)>=1
  p.todosMas = p.minD>=1.6 // todos fueron varios días — el proyecto entero es multi-día
  p.noCierra = p.dispersion || p.chocaCant
})

const lista=todos.filter(p=>p.noCierra||p.todosMas).sort((a,b)=>b.costo-a.costo)
let out=''
const L=s=>{out+=s+'\n'}
function render(titulo,arr){
  L(`\n${'█'.repeat(80)}\n  ${titulo} — ${arr.length} proyectos · ${money(arr.reduce((s,p)=>s+p.costo,0))} en staff\n${'█'.repeat(80)}`)
  const porAg={}; arr.forEach(p=>(porAg[p.agencia]=porAg[p.agencia]||[]).push(p))
  Object.entries(porAg).sort((a,b)=>b[1].reduce((s,p)=>s+p.costo,0)-a[1].reduce((s,p)=>s+p.costo,0)).forEach(([ag,ps])=>{
    L(`\n▓▓ ${ag.toUpperCase()}  ·  ${ps.length} proy  ·  ${money(ps.reduce((s,p)=>s+p.costo,0))}`)
    ps.forEach(p=>{
      const tipo = p.todosMas&&!p.dispersion ? 'TODOS varios días'
                 : p.dispersion ? 'UNOS SÍ Y OTROS NO ⚠'
                 : 'choca con Cant.Fechas'
      L(`\n  ${p.fecha}  ${p.proy.slice(0,44)}${p.npresu?'  ['+p.npresu+']':''}`)
      L(`     staff ${money(p.costo)}${p.cant!==undefined?`  ·  presu dice ${p.cant} fechas`:'  ·  sin Cant.Fechas'}  ·  ${tipo}`)
      p.staff.sort((a,b)=>(b.dias||0)-(a.dias||0)).forEach(s=>{
        const marca = s.dias>=1.6?' ←':''
        L(`        ${money(s.precio).padStart(12)}  ${(s.ped||'—').slice(0,11).padEnd(13)}${s.pers.slice(0,26).padEnd(28)}${s.ref?`≈${s.dias}d`:'(sin ref)'}${marca}`)})
    })
  })
}
render('2026 · PROYECTOS', lista.filter(p=>p.origen==='2026'))
render('2025 · HISTORICO_2025', lista.filter(p=>p.origen==='2025'))
const RUTA='/private/tmp/claude-501/-Users-dronjuan-somos-magma-app/ecd947ac-0d54-475a-815e-ef8ee6b06411/scratchpad/no-cierran.txt'
writeFileSync(RUTA,out)
const l26=lista.filter(p=>p.origen==='2026'), l25=lista.filter(p=>p.origen==='2025')
console.log(`RESUMEN
  2026: ${l26.length} proyectos no cierran (${money(l26.reduce((s,p)=>s+p.costo,0))})
     · unos sí y otros no: ${l26.filter(p=>p.dispersion).length}
     · todos varios días:  ${l26.filter(p=>p.todosMas&&!p.dispersion).length}
     · choca con Cant.Fechas: ${l26.filter(p=>p.chocaCant&&!p.dispersion).length}
  2025: ${l25.length} proyectos no cierran (${money(l25.reduce((s,p)=>s+p.costo,0))})
     · unos sí y otros no: ${l25.filter(p=>p.dispersion).length}
     · todos varios días:  ${l25.filter(p=>p.todosMas&&!p.dispersion).length}
  archivo: ${RUTA}`)

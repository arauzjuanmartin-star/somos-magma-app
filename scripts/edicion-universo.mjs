/**
 * Universo REAL de edición: cruza PROYECTOS + Pagos_Staff para no perder a nadie
 * (Teo, Diego Bariloche, Diego Costa no aparecen en PROYECTOS).
 * Objetivo: cuánta edición se paga por mes y cuánto de eso absorbe un editor fijo.
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
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const ESEDIT=/edit|edici|color|motion|anim|dise|post/i

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS','Pagos_Staff','RRHH'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,PAG,RR]=R.data.valueRanges.map(v=>v.values||[])

// --- rubro de cada persona segun RRHH (para pescar editores sin pedido explicito) ---
const rubro={}
RR.slice(1).forEach(r=>{const n=txt(r[0]).toLowerCase(); if(n) rubro[n]=txt(r[1])})

// --- A) edicion en PROYECTOS 2026 ---
function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?{mes:+m[2],anio:+m[3]}:null}
const ediPro=[]
PRO.slice(1).forEach(row=>{
  const f=pf(row[3]); if(!f||f.anio!==2026||f.mes>7)return
  const dias=num(row[84])||1
  const exc={}; txt(row[85]).split('|').forEach(p=>{const m=p.match(/^\s*(.+?):(\d+)\s*$/); if(m)exc[m[1].trim()]=+m[2]})
  PED.forEach(pc=>{
    const ped=txt(row[pc]); if(!ped||!ESEDIT.test(ped))return
    const precio=num(row[pc+1]), pers=txt(row[pc+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    ediPro.push({mes:f.mes,pers,ped,precio,jorn:exc[pers]??dias,proy:txt(row[6]),npresu:txt(row[2])})
  })
})

// --- B) edicion en Pagos_Staff 2026 (por Servicio o por rubro de la persona) ---
const ediPag=[]
PAG.slice(1).forEach((r,i)=>{
  const pers=txt(r[1]); if(!pers||/somos magma/i.test(pers))return
  if(/2025|migrad/i.test(txt(r[11]))||/\/2025/.test(txt(r[0])))return
  const mes=parseInt(txt(r[2]))||0; if(mes<1||mes>7)return
  const monto=num(r[6])||num(r[7]); if(monto<=1)return
  const serv=txt(r[5])
  const esEdit = ESEDIT.test(serv) || (!serv && /edit/i.test(rubro[pers.toLowerCase()]||''))
  if(!esEdit)return
  ediPag.push({fila:i+2,mes,pers,serv,monto,proy:txt(r[4]),npresu:txt(r[3])})
})

console.log(`\n${'█'.repeat(78)}\n  EDICIÓN — universo completo (ene-jul 2026)\n${'█'.repeat(78)}`)
console.log(`  En PROYECTOS:   ${ediPro.length} líneas · ${money(ediPro.reduce((s,x)=>s+x.precio,0))}`)
console.log(`  En Pagos_Staff: ${ediPag.length} líneas · ${money(ediPag.reduce((s,x)=>s+x.monto,0))}`)

// unir por persona: Pagos_Staff manda (es lo que efectivamente se pagó)
const gente={}
ediPro.forEach(x=>{const g=gente[x.pers]=gente[x.pers]||{pro:0,pro$:0,pag:0,pag$:0,meses:new Set()}
  g.pro+=x.jorn; g.pro$+=x.precio; g.meses.add(x.mes)})
ediPag.forEach(x=>{const g=gente[x.pers]=gente[x.pers]||{pro:0,pro$:0,pag:0,pag$:0,meses:new Set()}
  g.pag++; g.pag$+=x.monto; g.meses.add(x.mes)})
console.log(`\n  ${'persona'.padEnd(32)}${'jorn(PROY)'.padStart(11)}${'$ PROY'.padStart(13)}${'filas(PAG)'.padStart(11)}${'$ PAGADO'.padStart(13)}   rubro RRHH`)
Object.entries(gente).sort((a,b)=>Math.max(b[1].pro$,b[1].pag$)-Math.max(a[1].pro$,a[1].pag$)).forEach(([p,g])=>
  console.log(`  ${p.slice(0,30).padEnd(32)}${String(g.pro).padStart(11)}${money(g.pro$).padStart(13)}${String(g.pag).padStart(11)}${money(g.pag$).padStart(13)}   ${(rubro[p.toLowerCase()]||'—').slice(0,26)}`))

// --- total mensual de edicion, tomando el mayor de las dos fuentes por persona ---
const totMes={}
for(let m=1;m<=7;m++){
  const a=ediPro.filter(x=>x.mes===m).reduce((s,x)=>s+x.precio,0)
  const b=ediPag.filter(x=>x.mes===m).reduce((s,x)=>s+x.monto,0)
  totMes[m]={pro:a,pag:b,max:Math.max(a,b)}
}
console.log(`\n${'━'.repeat(78)}\n  GASTO EN EDICIÓN POR MES\n${'━'.repeat(78)}`)
console.log(`  mes    desde PROYECTOS   desde Pagos_Staff   el mayor`)
let sum=0
for(let m=1;m<=7;m++){const t=totMes[m]; sum+=t.max
  console.log(`  ${MES[m].padEnd(5)} ${money(t.pro).padStart(16)} ${money(t.pag).padStart(19)} ${money(t.max).padStart(12)}`)}
console.log(`  ${'─'.repeat(60)}`)
console.log(`  TOTAL ${money(sum).padStart(52)}`)
console.log(`  PROMEDIO MENSUAL: ${money(sum/7)}`)
const jornPro=ediPro.reduce((s,x)=>s+x.jorn,0)
console.log(`\n  Jornadas de edición (PROYECTOS): ${jornPro} → ${(jornPro/7).toFixed(1)}/mes · tarifa ${money(ediPro.reduce((s,x)=>s+x.precio,0)/jornPro)}/jornada`)

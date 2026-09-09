/**
 * REPARTO DE CONVOCATORIAS — cuántas veces se llamó a cada uno, mes a mes.
 * Es la misma cuenta que muestra el gráfico de la app (lib/jornadas.js), para
 * poder mirarla desde la terminal sin abrir el navegador.
 *
 * Uso:  node scripts/reparto-fechas.mjs            → últimos 6 meses
 *       node scripts/reparto-fechas.mjs 9/2026     → un mes
 *       node scripts/reparto-fechas.mjs 9/2026 --todo   → incluye edición
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { repartoDelMes, ultimaConvocatoria } from '../lib/jornadas.js'
import { canonStaff, canonKey } from '../lib/staff.js'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const MESES=['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const obj=v=>{const h=v[0]||[];return v.slice(1).filter(r=>r.some(c=>c!=='')).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
// Los slots 1-12 vienen sin numerar en el sheet — igual que toProyectos() en lib/sheets.js
const objProy=v=>{const h=v[0]||[];return v.slice(1).filter(r=>r.some(c=>c!=='')).map(r=>{
  const o={}; let st=0,pc=0
  h.forEach((k,i)=>{ if(k==='Staff'){st++;o['Staff '+st]=r[i]||''} else if(k==='Precio'){pc++;o['Precio '+pc]=r[i]||''} else o[k]=r[i]||'' })
  return o })}

const soloRodaje=!process.argv.includes('--todo')
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:EV','RRHH!A:Z']})
const proyectos=objProy(R.data.valueRanges[0].values||[])
const rrhh=obj(R.data.valueRanges[1].values||[])

const hoy=new Date()
const arg=process.argv[2]
const periodos=[]
if(arg&&/^\d{1,2}\/\d{4}$/.test(arg)){ const [m,y]=arg.split('/'); periodos.push([+m,+y]) }
else for(let i=5;i>=0;i--){ const d=new Date(hoy.getFullYear(),hoy.getMonth()-i,1); periodos.push([d.getMonth()+1,d.getFullYear()]) }

console.log(`\n  REPARTO DE CONVOCATORIAS ${soloRodaje?'(solo rodaje — sin edición)':'(TODO, incluye edición)'}`)
for(const [mes,anio] of periodos){
  const lista=repartoDelMes(proyectos, mes, anio, {soloRodaje})
  const tot=lista.reduce((s,p)=>s+p.jornadas,0)
  console.log(`\n═══ ${MESES[mes].toUpperCase()} ${anio} · ${tot} convocatorias entre ${lista.length} personas${lista.length?` · promedio ${(tot/lista.length).toFixed(1)}`:''}`)
  lista.forEach(p=>{
    const share=tot?p.jornadas/tot:0
    console.log(`  ${String(p.jornadas).padStart(3)}  ${'█'.repeat(Math.min(28,p.jornadas)).padEnd(28)} ${p.nombre.padEnd(34)} ${M(p.monto).padStart(12)}${share>=0.25?'   ← concentra el '+Math.round(share*100)+'% del mes':''}`)
  })
}

// A quién hace rato que no se llama (roster activo de RRHH que no aparece este mes)
const [mesUlt,anioUlt]=periodos[periodos.length-1]
const enElMes=new Set(repartoDelMes(proyectos, mesUlt, anioUlt, {soloRodaje}).map(p=>p.key))
const ultima=ultimaConvocatoria(proyectos, {soloRodaje})
const mesesEntre=(a,b)=>(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth())
const dormidos=rrhh
  .filter(r=>/activo/i.test(String(r['Estado']||'')))
  .map(r=>{const nombre=canonStaff(String(r['Nombre Apellido']||r['Nombre']||'').trim());return {nombre,key:canonKey(nombre)}})
  .filter(r=>r.nombre&&!enElMes.has(r.key))
  .map(r=>{const u=ultima[r.key];return {...r, meses:u?mesesEntre(u.fecha,hoy):null, ultima:u?u.fecha:null}})
  .filter(r=>r.meses!==null&&r.meses>=1)
  .sort((a,b)=>a.meses-b.meses)
console.log(`\n═══ ACTIVOS QUE NO FUERON EN ${MESES[mesUlt].toUpperCase()} (${dormidos.length})`)
dormidos.forEach(d=>console.log(`  hace ${String(d.meses).padStart(2)} ${(d.meses===1?'mes':'meses').padEnd(5)}  ${d.nombre.padEnd(34)} última: ${d.ultima.toLocaleDateString('es-AR')}`))
console.log('')

/**
 * ESCENARIO: Lulú sale de PM y pasa a editora fija.
 * Compara contra: (B) contratar un editor nuevo y dejar a Lulú de PM.
 * Todo monotributista, sin cargas. Solo lectura.
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
const MES=['','ene','feb','mar','abr','may','jun','jul']
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const N=7, CAP=21
const LULU=/luc[ií]a\s+mar[ií]a\s+grenier/i
function rol(p0){const p=txt(p0).toLowerCase()
  if(/comision|rental|alquiler|viatico|servicio|crudos|catering/.test(p))return 'NO'
  if(/edit|edici|color|motion|anim|dise/.test(p))return 'EDICION'
  if(/asist/.test(p))return 'ASIST'
  if(/produ/.test(p))return 'PRODU'
  if(/sonid|audio/.test(p))return 'SONIDO'
  if(/vivo|stream/.test(p))return 'VIVO'
  if(/locu/.test(p))return 'LOCU'
  if(/drone|dron|fpv/.test(p))return 'DRONE'
  if(/makeup|maquilla|model|peluq/.test(p))return 'OTROS'
  if(/film|c[aá]mara|camara|video|foto|dirfoto/.test(p))return 'CAMARA'
  return 'SIN'}
function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?{mes:+m[2],anio:+m[3]}:null}

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.values
const L=[]
PRO.slice(1).forEach(row=>{
  const f=pf(row[3]); if(!f||f.anio!==2026||f.mes>7)return
  const dias=num(row[84])||1
  const exc={}; txt(row[85]).split('|').forEach(p=>{const m=p.match(/^\s*(.+?):(\d+)\s*$/); if(m)exc[m[1].trim()]=+m[2]})
  PED.forEach(pc=>{const ped=txt(row[pc]); if(!ped)return
    const precio=num(row[pc+1]), pers=txt(row[pc+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    const r=rol(ped); if(r==='NO')return
    L.push({mes:f.mes,rol:r,precio,pers,jorn:exc[pers]??dias,ag:txt(row[4])||txt(row[5])||'—',ped,proy:txt(row[6])})})
})
const J=a=>a.reduce((s,x)=>s+x.jorn,0), $=a=>a.reduce((s,x)=>s+x.precio,0)
const edi=L.filter(l=>l.rol==='EDICION')
const T_EDI=$(edi)/J(edi)

// ---- LULU HOY ----
const lulu=L.filter(l=>LULU.test(l.pers))
const SUELDO_LULU=1300000, MONO_LULU=447000
console.log(`\n${'█'.repeat(78)}\n  LULÚ HOY\n${'█'.repeat(78)}`)
console.log(`  Sueldo fijo (rol PM/asistente): ${money(SUELDO_LULU)}  + monotributo ${money(MONO_LULU)} = ${money(SUELDO_LULU+MONO_LULU)}/mes`)
console.log(`\n  Extras que cobra APARTE:`)
const lr={}; lulu.forEach(l=>{const o=lr[l.rol]=lr[l.rol]||{j:0,$:0}; o.j+=l.jorn; o.$+=l.precio})
Object.entries(lr).sort((a,b)=>b[1].$-a[1].$).forEach(([r,o])=>
  console.log(`   ${r.padEnd(9)} ${String(o.j).padStart(3)} jorn · ${money(o.$).padStart(12)} · ${money(o.$/N).padStart(11)}/mes`))
console.log(`   ${'─'.repeat(52)}`)
console.log(`   TOTAL     ${String(J(lulu)).padStart(3)} jorn · ${money($(lulu)).padStart(12)} · ${money($(lulu)/N).padStart(11)}/mes`)
console.log(`\n  COSTO TOTAL DE LULÚ HOY: ${money(SUELDO_LULU+MONO_LULU+$(lulu)/N)}/mes`)
const luEdi=lulu.filter(l=>l.rol==='EDICION'), luPM=lulu.filter(l=>l.rol!=='EDICION')
console.log(`     de eso, editando: ${money($(luEdi)/N)}/mes (${(J(luEdi)/N).toFixed(1)} jorn)`)
console.log(`     de eso, rol PM:   ${money($(luPM)/N)}/mes (${(J(luPM)/N).toFixed(1)} jorn)`)

// ---- capacidad y demanda ----
const EDI_MES=$(edi)/N, EDI_JORN=J(edi)/N
console.log(`\n${'━'.repeat(78)}\n  LA DEMANDA DE EDICIÓN\n${'━'.repeat(78)}`)
console.log(`  ${EDI_JORN.toFixed(1)} jornadas/mes · ${money(EDI_MES)}/mes · ${money(T_EDI)}/jornada`)
console.log(`  mes:  ${[1,2,3,4,5,6,7].map(m=>MES[m]+' '+J(edi.filter(l=>l.mes===m))).join(' · ')}`)
console.log(`  Capacidad de Lulú full: ${CAP} jorn/mes → cubre todo salvo mayo (${J(edi.filter(l=>l.mes===5))} jorn)`)
const excedente=Math.max(0,CAP-EDI_JORN)
console.log(`  Capacidad ociosa: ${excedente.toFixed(1)} jorn/mes → para edición de fotos y lo que surja`)

// ---- ESCENARIOS ----
console.log(`\n${'█'.repeat(78)}\n  COMPARACIÓN\n${'█'.repeat(78)}`)
function bloque(nom,hoy,despues,detalleHoy,detalleDesp){
  console.log(`\n▓ ${nom}`)
  detalleHoy.forEach(d=>console.log(`     ${d[0].padEnd(46)} ${money(d[1]).padStart(13)}`))
  console.log(`     ${'HOY total'.padEnd(46)} ${money(hoy).padStart(13)}`)
  console.log('')
  detalleDesp.forEach(d=>console.log(`     ${d[0].padEnd(46)} ${money(d[1]).padStart(13)}`))
  console.log(`     ${'DESPUÉS total'.padEnd(46)} ${money(despues).padStart(13)}`)
  const a=hoy-despues
  console.log(`     ${'→ AHORRO'.padEnd(46)} ${money(a).padStart(13)}/mes  ·  ${money(a*12)}/año  ${a>0?'✓':'✗'}`)
}
const otrosEdi=EDI_MES-$(luEdi)/N   // edición que hoy hacen los demás
const PMS=[1200000,1500000,1800000]
PMS.forEach(pm=>{
  bloque(`E · LULÚ EDITORA + PM nuevo a ${money(pm)}`,
    SUELDO_LULU+MONO_LULU+$(lulu)/N + otrosEdi,
    SUELDO_LULU+MONO_LULU+pm,
    [['Lulú sueldo + monotributo',SUELDO_LULU+MONO_LULU],
     ['Lulú extras (edición + PM)',$(lulu)/N],
     ['edición que hacen los demás',otrosEdi]],
    [['Lulú sueldo + monotributo (ahora edita full)',SUELDO_LULU+MONO_LULU],
     ['PM nuevo',pm]])
})
console.log(`\n${'─'.repeat(78)}`)
PMS.forEach(ed=>{
  bloque(`B · EDITOR NUEVO a ${money(ed)} (Lulú sigue de PM)`,
    SUELDO_LULU+MONO_LULU+$(lulu)/N + otrosEdi,
    SUELDO_LULU+MONO_LULU+$(luPM)/N+ed,
    [['Lulú sueldo + monotributo',SUELDO_LULU+MONO_LULU],
     ['Lulú extras (edición + PM)',$(lulu)/N],
     ['edición que hacen los demás',otrosEdi]],
    [['Lulú sueldo + monotributo',SUELDO_LULU+MONO_LULU],
     ['Lulú extras SOLO de PM (deja de editar)',$(luPM)/N],
     ['editor nuevo',ed]])
})

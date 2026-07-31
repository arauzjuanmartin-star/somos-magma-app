/**
 * RECÁLCULO v4 — corrige el conteo de jornadas.
 *
 * REGLA CORRECTA: las jornadas de una persona en un proyecto son las del proyecto
 * (o su excepción en "Días x persona"), SIN IMPORTAR cuántas líneas de pago tenga.
 * Varias líneas de la misma persona = conceptos de cobro, no jornadas.
 * Si una persona tiene líneas de roles distintos, las jornadas se reparten
 * proporcionalmente a la plata de cada rol.
 *
 * Compara contra el conteo viejo (línea × días) para ver cuánto se infló.
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
const N=7
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
function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?{d:new Date(+m[3],+m[2]-1,+m[1]),mes:+m[2],anio:+m[3]}:null}
const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.values
const grupos=[], diasRodaje=new Set()
let viejoTot=0
PRO.slice(1).forEach(row=>{
  const f=pf(row[3]); if(!f||f.anio!==2026||f.mes>7)return
  const dias=num(row[84])||1
  const exc={}; txt(row[85]).split('|').forEach(p=>{const m=p.match(/^\s*(.+?):(\d+)\s*$/); if(m)exc[m[1].trim()]=+m[2]})
  // agrupar líneas por persona
  const porPers={}
  PED.forEach(pc=>{const ped=txt(row[pc]); if(!ped)return
    const precio=num(row[pc+1]), pers=txt(row[pc+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    const r=rol(ped); if(r==='NO')return
    const o=porPers[pers]=porPers[pers]||{lineas:[],total:0}
    o.lineas.push({r,precio}); o.total+=precio
    viejoTot += (exc[pers]??dias)          // como contaba antes: cada línea × días
  })
  let hayCam=false
  Object.entries(porPers).forEach(([pers,o])=>{
    const jornPers = exc[pers] ?? dias      // ← las jornadas de la persona, una vez
    const porRol={}
    o.lineas.forEach(l=>{porRol[l.r]=(porRol[l.r]||0)+l.precio})
    Object.entries(porRol).forEach(([r,plata])=>{
      const j = jornPers * (plata/o.total)  // reparto proporcional si hay varios roles
      grupos.push({mes:f.mes,pers,rol:r,jorn:j,precio:plata,nLineas:o.lineas.length})
      if(r==='CAMARA') hayCam=true
    })
  })
  if(hayCam) for(let i=0;i<dias;i++){const d=new Date(f.d);d.setDate(d.getDate()+i);diasRodaje.add(key(d))}
})
const J=a=>a.reduce((s,x)=>s+x.jorn,0), $=a=>a.reduce((s,x)=>s+x.precio,0)
const cam=grupos.filter(g=>g.rol==='CAMARA'), edi=grupos.filter(g=>g.rol==='EDICION')

console.log(`\n${'█'.repeat(76)}\n  RECÁLCULO — jornadas por persona, no por línea de pago\n${'█'.repeat(76)}`)
console.log(`  Conteo VIEJO (cada línea × días): ${Math.round(viejoTot)} jornadas`)
console.log(`  Conteo NUEVO (por persona):       ${Math.round(J(grupos))} jornadas`)
console.log(`  → estaba inflado ${Math.round((viejoTot/J(grupos)-1)*100)}%\n`)

console.log(`  ${'rol'.padEnd(10)}${'jorn'.padStart(8)}${'/mes'.padStart(8)}${'costo'.padStart(15)}${'/mes'.padStart(13)}${'tarifa'.padStart(12)}`)
const roles={}; grupos.forEach(g=>{const o=roles[g.rol]=roles[g.rol]||{j:0,$:0}; o.j+=g.jorn; o.$+=g.precio})
Object.entries(roles).sort((a,b)=>b[1].j-a[1].j).forEach(([r,o])=>
  console.log(`  ${r.padEnd(10)}${o.j.toFixed(0).padStart(8)}${(o.j/N).toFixed(1).padStart(8)}${money(o.$).padStart(15)}${money(o.$/N).padStart(13)}${money(o.$/o.j).padStart(12)}`))

const T_CAM=$(cam)/J(cam), T_EDI=$(edi)/J(edi), DIAS=diasRodaje.size/N
console.log(`\n${'━'.repeat(76)}\n  LO QUE CAMBIA PARA LA DECISIÓN\n${'━'.repeat(76)}`)
console.log('  '+''.padEnd(30)+' '+'ANTES'.padStart(14)+' '+'AHORA'.padStart(14))
console.log(`  ${'Jornadas cámara/mes'.padEnd(30)} ${'37,4'.padStart(14)} ${(J(cam)/N).toFixed(1).padStart(14)}`)
console.log(`  ${'Tarifa cámara/jornada'.padEnd(30)} ${'$242.906'.padStart(14)} ${money(T_CAM).padStart(14)}`)
console.log(`  ${'Jornadas edición/mes'.padEnd(30)} ${'14,6'.padStart(14)} ${(J(edi)/N).toFixed(1).padStart(14)}`)
console.log(`  ${'Tarifa edición/jornada'.padEnd(30)} ${'$120.880'.padStart(14)} ${money(T_EDI).padStart(14)}`)
console.log(`  ${'Días de rodaje/mes'.padEnd(30)} ${'13,4'.padStart(14)} ${DIAS.toFixed(1).padStart(14)}`)
console.log(`\n  Cámara sigue valiendo ${(T_CAM/T_EDI).toFixed(1)}x lo que vale edición.`)

console.log(`\n${'━'.repeat(76)}\n  EL MODELO DE LUCHO FIJO, CORREGIDO\n${'━'.repeat(76)}`)
const camAbs=DIAS*T_CAM
console.log(`  Techo de cámara: ${DIAS.toFixed(1)} jornadas/mes × ${money(T_CAM)} = ${money(camAbs)}/mes`)
const lu=grupos.filter(g=>/jorge luis chavez/i.test(g.pers))
const luCam=lu.filter(g=>g.rol==='CAMARA')
console.log(`\n  Lucho hoy: ${J(lu).toFixed(1)} jornadas/mes totales (${(J(lu)/N).toFixed(1)}/mes) · ${money($(lu)/N)}/mes`)
console.log(`     de cámara: ${(J(luCam)/N).toFixed(1)}/mes a ${money($(luCam)/J(luCam))}/jornada`)
;[1600000,1900000,2200000].forEach(M=>{
  const nuevasJ=DIAS-(J(luCam)/N)
  const inc=nuevasJ*T_CAM
  const hoyTotal=$(lu)/N+inc
  console.log(`\n  Fijo a ${money(M)}/mes:`)
  console.log(`     hoy pagás ${money($(lu)/N)} (Lucho) + ${money(inc)} (las ${nuevasJ.toFixed(1)} jorn que sumaría) = ${money(hoyTotal)}`)
  console.log(`     AHORRO DE CAJA: ${money(hoyTotal-M)}/mes · ${money((hoyTotal-M)*12)}/año`)})

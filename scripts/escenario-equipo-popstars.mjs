/** Escenario de estructura post-reunión 20/08: qué se compra afuera hoy (edición/cámara), Lucho, Mannequin, estacionalidad */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim(), num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const INTERNOS=/grenier|halbach|ayala|arauz|somos magma/i
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI'],valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.valueRanges[0].values||[]
const tipoDe=p=>/edici|edit|motion|posproduc/i.test(p)?'edición':/asist/i.test(p)?'asistente':/produc|pm\b|coordin/i.test(p)?'producción':/foto|video|film|camar|dron|sonid|luz|luces/i.test(p)?'cámara/técnica':'otros'
const MESES=['ene','feb','mar','abr','may','jun','jul','ago']

const porTipo={}, porMesEd={}, porMesCam={}, personas={}, lucho={n:0,$:0,tipos:{}}, mannequin={n:0,$:0,proy:[]}
let mesesConDato=new Set()
PRO.slice(1).forEach(r=>{const f=fecha(r[3]); if(!f||f.getFullYear()!==2026||f.getMonth()>7)return
  const m=f.getMonth(); mesesConDato.add(m)
  const ag=txt(r[4]), cli=txt(r[5])
  if(/manneq|maneq/i.test(ag+' '+cli)){mannequin.n++; mannequin.$+=num(r[7]); mannequin.proy.push([MESES[m],(ag||cli).slice(0,22),num(r[7])])}
  PED.forEach(c=>{const ped=txt(r[c]); if(!ped)return; const st=txt(r[c+2]), pr=num(r[c+1]); if(pr<=1||!st)return
    const t=tipoDe(ped)
    if(/luch|lucio|luciano/i.test(st)){lucho.n++;lucho.$+=pr;lucho.tipos[t]=(lucho.tipos[t]||0)+pr}
    if(INTERNOS.test(st))return   // solo lo que se compra AFUERA
    porTipo[t]=porTipo[t]||{n:0,$:0}; porTipo[t].n++; porTipo[t].$+=pr
    personas[st]=personas[st]||{n:0,$:0}; personas[st].n++; personas[st].$+=pr
    if(t==='edición'){porMesEd[m]=porMesEd[m]||{n:0,$:0}; porMesEd[m].n++; porMesEd[m].$+=pr}
    if(t==='cámara/técnica'){porMesCam[m]=porMesCam[m]||{n:0,$:0}; porMesCam[m].n++; porMesCam[m].$+=pr}
  })})
const NM=mesesConDato.size

console.log(`════ 1. LO QUE SE COMPRA AFUERA (staff externo, ene-ago 2026, ${NM} meses) ════`)
Object.entries(porTipo).sort((a,b)=>b[1].$-a[1].$).forEach(([t,v])=>
  console.log(`${t.padEnd(16)} ${String(v.n).padStart(4)} líneas  ${M(v.$).padStart(15)}  = ${M(v.$/NM).padStart(13)}/mes  (${Math.round(v.n/NM)} por mes)`))

console.log('\n════ 2. EDICIÓN externa mes a mes (¿hay caudal para un editor fijo?) ════')
for(let m=0;m<8;m++){const v=porMesEd[m]||{n:0,$:0}
  console.log(`${MESES[m]}  ${String(v.n).padStart(3)} ediciones  ${M(v.$).padStart(13)}   ${'█'.repeat(Math.round(v.n/2))}`)}
const edN=Object.values(porMesEd).reduce((a,b)=>a+b.n,0), edP=Object.values(porMesEd).reduce((a,b)=>a+b.$,0)
console.log(`     promedio: ${(edN/NM).toFixed(1)} ediciones/mes · ${M(edP/NM)}/mes · precio medio ${M(edP/edN)}`)

console.log('\n════ 3. CÁMARA/TÉCNICA externa mes a mes ════')
for(let m=0;m<8;m++){const v=porMesCam[m]||{n:0,$:0}
  console.log(`${MESES[m]}  ${String(v.n).padStart(3)} líneas  ${M(v.$).padStart(14)}   ${'█'.repeat(Math.round(v.n/3))}`)}
const cN=Object.values(porMesCam).reduce((a,b)=>a+b.n,0), cP=Object.values(porMesCam).reduce((a,b)=>a+b.$,0)
console.log(`     promedio: ${(cN/NM).toFixed(1)} líneas/mes · ${M(cP/NM)}/mes`)

console.log('\n════ 4. LUCHO (todas sus líneas 2026) ════')
console.log(`${lucho.n} trabajos · ${M(lucho.$)} · ${M(lucho.$/NM)}/mes`)
Object.entries(lucho.tipos).sort((a,b)=>b[1]-a[1]).forEach(([t,v])=>console.log('   ',t.padEnd(16),M(v)))

console.log('\n════ 5. TOP 12 freelancers externos por plata ════')
Object.entries(personas).sort((a,b)=>b[1].$-a[1].$).slice(0,12).forEach(([p,v])=>
  console.log(p.slice(0,32).padEnd(33),String(v.n).padStart(3),'trab',M(v.$).padStart(14),M(v.$/NM).padStart(12)+'/mes'))

console.log('\n════ 6. MANNEQUIN ════')
console.log(`${mannequin.n} proyectos · ${M(mannequin.$)} · ${M(mannequin.$/NM)}/mes de producción`)
mannequin.proy.slice(0,15).forEach(p=>console.log('   ',p[0],p[1].padEnd(24),M(p[2])))

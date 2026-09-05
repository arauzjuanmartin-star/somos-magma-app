/** Números para la reunión con Tom y Lulú (19/08/2026): carga por PM, jornadas de los socios, ritmo. */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI','PRESUPUESTOS!A:CI'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,PRE]=R.data.valueRanges.map(v=>v.values||[])

const norm=p=>{const s=txt(p).toLowerCase()
  if(/edici|edit|motion/.test(s))return 'EDICION'
  if(/(foto|video|film|camar)/.test(s))return /1\/2|½|medi/.test(s)?'CAMARA ½':'CAMARA 1'
  if(/asist/.test(s))return 'ASISTENTE'
  if(/drone|fpv/.test(s))return 'DRONE'
  if(/produc/.test(s))return 'PRODUCCION'
  return null}

// ---------- 1. Carga 2026 por PM (PROYECTOS) ----------
const porPM={}, porMes={}, socios={Juan:{n:0,$:0,det:{}},Sofia:{n:0,$:0,det:{}}}
let proy2026=0, fact2026=0, sinPM=0
PRO.slice(1).forEach(r=>{const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  const mes=f.getMonth()+1; if(mes>8)return  // meses transcurridos
  proy2026++; const tot=num(r[7]); fact2026+=tot
  const pm=txt(r[51])||'(sin PM)'; if(pm==='(sin PM)')sinPM++
  porPM[pm]=porPM[pm]||{n:0,$:0}; porPM[pm].n++; porPM[pm].$+=tot
  porMes[mes]=porMes[mes]||{n:0,$:0}; porMes[mes].n++; porMes[mes].$+=tot
  PED.forEach(c=>{const ped=txt(r[c]); if(!ped)return
    const st=txt(r[c+2]), pr=num(r[c+1]), rec=norm(ped)
    if(/^juan/i.test(st)&&!/martin arauz/i.test(st)===false){} // noop
    const key=/^juan/i.test(st)?'Juan':/^sof/i.test(st)?'Sofia':null
    if(!key||!rec||pr<=1)return
    socios[key].n++; socios[key].$+=pr
    socios[key].det[rec]=socios[key].det[rec]||{n:0,$:0}; socios[key].det[rec].n++; socios[key].det[rec].$+=pr })
})
console.log('=== PROYECTOS 2026 (ene-ago) ===')
console.log('proyectos:',proy2026,' facturado:',M(fact2026),' sin PM:',sinPM)
console.log('\n-- por mes --')
Object.keys(porMes).sort((a,b)=>a-b).forEach(m=>console.log(String(m).padStart(2),porMes[m].n,'proy',M(porMes[m].$)))
console.log('\n-- carga por PM --')
Object.entries(porPM).sort((a,b)=>b[1].n-a[1].n).forEach(([k,v])=>console.log(k.padEnd(22),String(v.n).padStart(4),'proy',M(v.$).padStart(16)))

console.log('\n=== JORNADAS DE LOS SOCIOS EN RODAJE/EDICION 2026 (líneas de staff) ===')
for(const k of ['Juan','Sofia']){const s=socios[k]
  console.log(`${k}: ${s.n} líneas · ${M(s.$)} · ${M(s.$/8)}/mes`)
  Object.entries(s.det).sort((a,b)=>b[1].n-a[1].n).forEach(([r,v])=>console.log('   ',r.padEnd(12),String(v.n).padStart(3),M(v.$)))}

// ---------- 2. PRESUPUESTOS 2026 por PM Interno ----------
const prePM={}
let pre2026=0
PRE.slice(1).forEach(r=>{const f=fecha(r[9])||fecha(r[1]); if(!f||f.getFullYear()!==2026)return
  pre2026++; const pm=txt(r[2])||'(sin PM)'; const est=txt(r[3])
  prePM[pm]=prePM[pm]||{n:0,apr:0,$:0}; prePM[pm].n++
  if(/aprob/i.test(est)){prePM[pm].apr++; prePM[pm].$+=num(r[45]||r[8])} })
console.log('\n=== PRESUPUESTOS 2026 por PM Interno ===  total:',pre2026)
Object.entries(prePM).sort((a,b)=>b[1].n-a[1].n).slice(0,12).forEach(([k,v])=>
  console.log(k.padEnd(22),String(v.n).padStart(4),'presus ·',String(v.apr).padStart(4),'aprob ('+Math.round(v.apr/v.n*100)+'%) ·',M(v.$)))

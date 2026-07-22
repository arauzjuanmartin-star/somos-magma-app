/**
 * Chequeo semanal de SOMOS MAGMA — el sistema para que nada pase desapercibido.
 * Junta todas las lentes que fuimos aprendiendo a mirar. Solo lectura.
 *
 *   node scripts/somos-semana.mjs           -> imprime el reporte
 *   node scripts/somos-semana.mjs --html     -> además deja /tmp scratchpad con el HTML del mail
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const ERR=/^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const txt=v=>{const s=String(v??'').trim();return ERR.test(s)?'':s}
const raw=v=>String(v??'').trim()
const nrm=v=>txt(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
const num=v=>{const s=txt(v).replace(/\s/g,'');if(!s)return 0;const neg=/^-/.test(s);const n=parseFloat(s.replace(/[^\d.]/g,''))||0;return neg?-n:n}
const fecha=v=>{const m=txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;const d=new Date(y,+m[2]-1,+m[1]);return isNaN(d)?null:d}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const esTrue=v=>/^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(v))
const hoy=new Date(); hoy.setHours(0,0,0,0)
const DIA=86400000, dias=d=>Math.round((hoy-d)/DIA)
const ANIO=hoy.getFullYear()
const L=[]; const say=(s='')=>L.push(s)

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['PRESUPUESTOS','PROYECTOS','FACTURACION','PRESTAMOS','PAGOS_STAFF','TARJETAS','MOVIMIENTOS_TARJETA','AGENCIAS','Contactos/agencias'],
  valueRenderOption:'FORMATTED_VALUE'})
const [PRE,PRO,FAC,PST,PAG,TAR,MOV,AG,CON]=r.data.valueRanges.map(v=>v.values||[])
const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]
const STF=[13,16,19,22,25,28,31,34,37,40,43,46,49,62,65,68,71,74,77,80,83]

say(`# 🌋 Chequeo semanal · SOMOS MAGMA`)
say(`_${hoy.toLocaleDateString('es-AR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}_`)
say('')

// ---------- 1. COBRANZAS / FACTURACIÓN ----------
const pc=FAC.slice(1).filter(f=>(txt(f[1])||txt(f[8]))&&!esTrue(f[4])&&num(f[12])>0)
const sinEmitir=pc.filter(f=>!txt(f[14]))
const vencidas=pc.filter(f=>{const v=fecha(f[19]);return v&&v<hoy})
const facMesActual=FAC.slice(1).filter(f=>{const fe=fecha(f[6]);return fe&&fe.getFullYear()===ANIO&&fe.getMonth()===hoy.getMonth()}).reduce((s,f)=>s+num(f[12]),0)
const proMesActual=PRO.slice(1).filter(p=>{const fe=fecha(p[3]);return txt(p[2])&&fe&&fe.getFullYear()===ANIO&&fe.getMonth()===hoy.getMonth()}).reduce((s,p)=>s+num(p[7]),0)
say(`## 💸 Cobranzas y facturación`)
say(`- **Por cobrar:** ${money(pc.reduce((s,f)=>s+num(f[12]),0))} en ${pc.length} facturas`)
say(`- **⚠️ Sin factura emitida:** ${money(sinEmitir.reduce((s,f)=>s+num(f[12]),0))} en ${sinEmitir.length} filas — trabajo hecho sin facturar`)
say(`- **Vencidas sin cobrar:** ${money(vencidas.reduce((s,f)=>s+num(f[12]),0))} en ${vencidas.length}`)
say(`- **Gap del mes:** facturado ${money(facMesActual)} vs trabajo real ${money(proMesActual)} → faltan facturar ${money(Math.max(0,proMesActual-facMesActual))}`)
if(sinEmitir.length){say(`  - Top sin emitir: ${sinEmitir.sort((a,b)=>num(b[12])-num(a[12])).slice(0,4).map(f=>`${txt(f[8])||txt(f[7])} ${money(num(f[12]))}`).join(' · ')}`)}
say('')

// ---------- 2. CHURN: clientes recurrentes que se enfriaron ----------
say(`## 📉 Clientes que se enfrían`)
const INTERNO=/^(juan|sofi|sofia|somos magma|magma)$/i
const porCli={}
PRO.slice(1).forEach(p=>{if(!txt(p[2]))return;const k=txt(p[5])||txt(p[4]);if(!k||INTERNO.test(k.trim()))return;const fe=fecha(p[3]);if(!fe)return
  porCli[k]=porCli[k]||{n:0,ult:fe,monto:0};porCli[k].n++;porCli[k].monto+=num(p[7]);if(fe>porCli[k].ult)porCli[k].ult=fe})
// recurrente (≥3 proyectos), frío (>75 días sin aparecer) y con facturación real (>$1M)
const enfria=Object.entries(porCli).filter(([,d])=>d.n>=3&&dias(d.ult)>75&&d.monto>=1000000).sort((a,b)=>b[1].monto-a[1].monto)
if(enfria.length){enfria.slice(0,6).forEach(([k,d])=>say(`- **${k}** — ${d.n} proyectos, ${money(d.monto)}, última vez hace ${dias(d.ult)} días`))}
else say(`- Ningún cliente recurrente frío esta semana ✓`)
say('')

// ---------- 3. PRÉSTAMOS ----------
say(`## 🏦 Préstamos`)
const prox=PST.slice(1).filter(row=>{const v=fecha(row[3]);return v&&!esTrue(row[6])&&v>=hoy&&(v-hoy)/DIA<=35})
const pend=PST.slice(1).filter(row=>!esTrue(row[6])).reduce((s,row)=>s+num(row[4]),0)
say(`- **Pendiente total cargado:** ${money(pend)}`)
if(prox.length){prox.sort((a,b)=>fecha(a[3])-fecha(b[3])).forEach(row=>say(`- ⏰ Vence ${txt(row[3])}: ${txt(row[0])} cuota ${txt(row[1])} · ${money(num(row[4]))}`.replace('cuota cuota','cuota')))}
else say(`- Sin cuotas cargadas venciendo en 35 días (ojo: la solapa PRESTAMOS está incompleta)`)
say('')

// ---------- 4. DEUDA CON JUAN Y SOFI ----------
say(`## 🤝 Lo que Magma les debe a Juan y Sofi (financian la empresa)`)
const cuenta=(re)=>{
  let trab=0,cob=0
  PRO.slice(1).forEach(row=>{if(!txt(row[2]))return;const fe=fecha(row[3]);if(!fe||fe.getFullYear()!==ANIO)return
    STF.forEach((sc,i)=>{if(re.test(txt(row[sc])))trab+=num(row[PRC[i]])})})
  PAG.slice(1).forEach(row=>{if(!re.test(txt(row[1])))return;const fp=fecha(row[0]);if(!fp||fp.getFullYear()!==ANIO)return;cob+=num(row[7])})
  return trab-cob
}
const dJuan=cuenta(/arauz/i), dSofi=cuenta(/sofia\s+maria\s+grenier/i)
say(`- **Juan:** ${money(dJuan)} · **Sofi:** ${money(dSofi)} · **Total:** ${money(dJuan+dSofi)}`)
say(`  _Crece cada mes que laburan sin cobrar. Se cobra cuando Magma limpie sus deudas._`)
say('')

// ---------- 5. PRESUPUESTOS ZOMBIS ----------
const zombis=PRE.slice(1).filter(p=>{const e=txt(p[3]).toUpperCase();const fe=fecha(p[1]);return txt(p[0])&&/ESPERA|PENDIENTE/.test(e)&&fe&&fe<hoy})
say(`## 🧟 Presupuestos zombis (en espera con evento pasado)`)
say(`- ${zombis.length} presupuestos por ${money(zombis.reduce((s,p)=>s+num(p[8]),0))} — hay que cerrarlos (aprobado o desaprobado)`)
say('')

// ---------- 6. DATOS ROTOS ----------
say(`## 🔧 Salud de los datos`)
// celdas #ERROR! en Contactos y AGENCIAS
let rotas=0
;[CON,AG].forEach(tab=>tab.slice(1).forEach(row=>row.forEach(c=>{if(typeof c==='string'&&ERR.test(c.trim()))rotas++})))
// tarjetas sin persona
const tarSinPers=TAR.slice(1).filter(row=>!txt(row[1])).length
const movSinPers=MOV.slice(1).filter(row=>!txt(row[14])).length
// duplicados de N° de presupuesto
const cnt={}; PRE.slice(1).forEach(p=>{const n=txt(p[0]);if(n)cnt[n]=(cnt[n]||0)+1})
const dup=Object.entries(cnt).filter(([,c])=>c>1)
say(`- Celdas #ERROR! en Contactos/Agencias: ${rotas} ${rotas?'⚠️':'✓'}`)
say(`- Tarjetas sin "Persona": ${tarSinPers} resúmenes, ${movSinPers} movimientos ${tarSinPers||movSinPers?'⚠️':'✓'}`)
say(`- N° de presupuesto duplicados: ${dup.length} ${dup.length?'⚠️ ('+dup.slice(0,5).map(([n,c])=>`#${n}×${c}`).join(', ')+')':'✓'}`)
say('')

say(`---`)
say(`_Verificado contra el Master Magma. No usa BALANCE ni Dashboard_data (fórmulas rotas en marzo). Generado por scripts/somos-semana.mjs._`)

const out=L.join('\n')
console.log(out)

// dejar HTML para el mail si se pide
if(process.argv.includes('--html')){
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
  const html=out.split('\n').map(l=>{
    if(l.startsWith('# '))return `<h2 style="font-family:Arial;color:#CE2637">${esc(l.slice(2))}</h2>`
    if(l.startsWith('## '))return `<h3 style="font-family:Arial;margin-top:18px">${esc(l.slice(3))}</h3>`
    if(l.startsWith('- '))return `<div style="font-family:Arial;font-size:14px;margin:3px 0">• ${esc(l.slice(2)).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')}</div>`
    if(l.startsWith('  - ')||l.startsWith('  _'))return `<div style="font-family:Arial;font-size:12.5px;color:#666;margin-left:16px">${esc(l.trim()).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/_(.+?)_/g,'<i>$1</i>')}</div>`
    if(l.startsWith('_'))return `<div style="font-family:Arial;font-size:11px;color:#999">${esc(l.replace(/_/g,''))}</div>`
    if(l==='---')return '<hr style="border:none;border-top:1px solid #ddd;margin:16px 0">'
    return l?`<div style="font-family:Arial">${esc(l)}</div>`:'<div style="height:6px"></div>'
  }).join('\n')
  const { writeFileSync }=await import('fs')
  writeFileSync('/tmp/somos-semana-mail.html',html)
  console.error('\n[HTML del mail escrito en /tmp/somos-semana-mail.html]')
}

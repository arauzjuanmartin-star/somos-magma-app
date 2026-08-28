/**
 * Carga los 2 préstamos Galicia (a nombre de Sofía Grenier) desde los cuadros de marcha,
 * con desglose capital/interés/impuestos. Reemplaza las filas parciales que había.
 * Suma la comisión de Garantizar ($460.000, pago único 18/5/2026) a GASTOS_FIJOS.
 *
 * Cada cuota se valida: capital + interés + IVA + percepción + sellos == monto total.
 * Si algún número no cuadra, ABORTA (protege de errores de transcripción).
 *
 *   node scripts/prestamos-galicia-cargar.mjs        -> preview
 *   node scripts/prestamos-galicia-cargar.mjs --go   -> aplica
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const GO=process.argv.includes('--go')
const txt=v=>String(v??'').trim()
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const dmy=iso=>{const[y,m,d]=iso.split('-');return `${+d}/${+m}/${y}`}

// [cuota, vto, montoTotal, capital, interésNom, ivaIntNom, ivaPercep, sellos, abonada]
const G15=[
[1,'2025-03-05',1020638.35,625000,343561.64,36073.97,5153.42,10849.32,1],
[2,'2025-04-04',1142027.39,625000,448972.60,47142.12,6734.59,14178.08,1],
[3,'2025-05-05',1136032.88,625000,443767.12,46595.55,6656.51,14013.70,1],
[4,'2025-06-04',1097068.50,625000,409931.51,43042.81,6148.97,12945.21,1],
[5,'2025-07-04',1074589.04,625000,390410.96,40993.15,5856.16,12328.77,1],
[6,'2025-08-04',1066346.57,625000,383253.42,40241.61,5748.80,12102.74,1],
[7,'2025-09-04',1043117.80,625000,363082.19,38123.63,5446.23,11465.75,1],
[8,'2025-10-06',1032627.39,625000,353972.60,37167.12,5309.59,11178.08,1],
[9,'2025-11-04',972682.20,625000,301917.81,31701.37,4528.77,9534.25,1],
[10,'2025-12-04',962191.78,625000,292808.22,30744.86,4392.12,9246.58,1],
[11,'2026-01-05',960693.15,625000,291506.85,30608.22,4372.60,9205.48,1],
[12,'2026-02-04',917232.88,625000,253767.12,26645.55,3806.51,8013.70,1],
[13,'2026-03-04',876769.86,625000,218630.14,22956.16,3279.45,6904.11,1],
[14,'2026-04-06',897001.37,625000,236198.63,24800.86,3542.98,7458.90,1],
[15,'2026-05-04',834808.22,625000,182191.78,19130.14,2732.88,5753.42,1],
[16,'2026-06-04',834058.92,625000,181541.10,19061.82,2723.12,5732.88,1],
[17,'2026-07-06',816824.65,625000,166575.34,17490.41,2498.63,5260.27,1],
[18,'2026-08-04',777110.96,625000,132089.04,13869.35,1981.34,4171.23,0],
[19,'2026-09-04',764372.61,625000,121027.40,12707.88,1815.41,3821.92,0],
[20,'2026-10-05',741143.83,625000,100856.16,10589.90,1512.84,3184.93,0],
[21,'2026-11-04',714917.80,625000,78082.19,8198.63,1171.23,2465.75,0],
[22,'2026-12-04',692438.35,625000,58561.64,6148.97,878.42,1849.32,0],
[23,'2027-01-04',671457.54,625000,40342.47,4235.96,605.14,1273.97,0],
[24,'2027-02-04',648228.77,625000,20171.23,2117.98,302.57,636.99,0],
]
const G11=[
[1,'2026-06-29',881748.58,479166.67,348308.22,36572.36,5224.62,12476.71,1],
[2,'2026-07-28',818209.77,479166.67,293335.33,30800.21,4400.03,10507.53,0],
[3,'2026-08-28',825834.44,479166.67,299932.08,31492.87,4498.98,10743.84,0],
[4,'2026-09-28',810076.80,479166.67,286298.80,30061.37,4294.48,10255.48,0],
[5,'2026-10-28',784152.97,479166.67,263869.86,27706.34,3958.05,9452.05,0],
[6,'2026-11-30',797877.36,479166.67,275744.01,28953.12,4136.16,9877.40,0],
[7,'2026-12-28',735355.16,479166.67,221650.68,23273.32,3324.76,7939.73,0],
[8,'2027-01-28',747046.31,479166.67,231765.70,24335.40,3476.49,8302.05,0],
[9,'2027-03-01',739421.64,479166.67,225168.95,23642.74,3377.53,8065.75,0],
[10,'2027-03-29',692657.07,479166.67,184708.90,19394.43,2770.63,6616.44,0],
[11,'2027-04-28',692657.07,479166.67,184708.90,19394.43,2770.63,6616.44,0],
[12,'2027-05-28',677407.77,479166.67,171515.41,18009.12,2572.73,6143.84,0],
[13,'2027-06-28',668258.17,479166.67,163599.31,17177.93,2453.99,5860.27,0],
[14,'2027-07-28',646909.13,479166.67,145128.42,15238.48,2176.93,5198.63,0],
[15,'2027-08-30',646909.13,479166.67,145128.42,15238.48,2176.93,5198.63,0],
[16,'2027-09-28',611835.71,479166.67,114783.39,12052.26,1721.75,4111.64,0],
[17,'2027-10-28',601161.18,479166.67,105547.94,11082.53,1583.22,3780.82,0],
[18,'2027-11-29',593028.22,479166.67,98511.41,10343.70,1477.67,3528.77,0],
[19,'2027-12-28',567612.70,479166.67,76522.26,8034.84,1147.83,2741.10,0],
[20,'2028-01-28',557954.80,479166.67,68166.38,7157.47,1022.50,2441.78,0],
[21,'2028-02-28',542197.17,479166.67,54533.10,5725.98,818.00,1953.42,0],
[22,'2028-03-28',523389.69,479166.67,38261.13,4017.42,573.92,1370.55,0],
[23,'2028-04-28',510681.92,479166.67,27266.55,2862.99,409.00,976.71,0],
[24,'2028-05-29',494924.21,479166.59,13633.27,1431.49,204.50,488.36,0],
]

const PRESTAMOS=[
  {nombre:'Galicia SGR $15M', op:'808086618966', cuadro:G15, cuenta:'Galicia Sofi'},
  {nombre:'Galicia SGR $11,5M', op:'808133400301', cuadro:G11, cuenta:'Galicia Sofi'},
]

// ── validar cada cuota ──
let errores=[]
PRESTAMOS.forEach(p=>p.cuadro.forEach(c=>{
  const [n,vto,total,cap,int,iva,per,sel]=c
  const suma=cap+int+iva+per+sel
  if(Math.abs(suma-total)>1) errores.push(`${p.nombre} cuota ${n}: suma ${suma.toFixed(2)} ≠ total ${total}`)
}))
if(errores.length){ console.log('❌ NO cuadran (error de transcripción):'); errores.forEach(e=>console.log('   '+e)); process.exit(1) }

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESTAMOS'})
const P=r.data.values||[], H=P[0]
const col=n=>H.findIndex(h=>txt(h).toLowerCase()===n.toLowerCase())
const C={pre:col('Prestamo'),cn:col('Cuota nro'),ct:col('Cuotas total'),vto:col('Vencimiento'),monto:col('Monto cuota'),
  mon:col('Moneda'),pag:col('Pagado'),fp:col('Fecha pago'),cta:col('Cuenta pago'),nota:col('Notas'),tipo:col('Tipo'),
  deu:col('Deudor'),acr:col('Acreedor'),cap:col('Capital'),int:col('Interes'),imp:col('Impuestos')}

console.log(`\n${'='.repeat(66)}\n${GO?'APLICANDO':'PREVIEW — no escribe nada'}\n${'='.repeat(66)}`)

// filas viejas a borrar
const aBorrar=[]
P.forEach((row,i)=>{ if(i===0)return; if(PRESTAMOS.some(p=>txt(row[C.pre])===p.nombre)) aBorrar.push(i+1) })
console.log(`\n▸ Filas parciales a reemplazar: ${aBorrar.length} (${aBorrar.join(', ')||'ninguna'})`)

// filas nuevas
const ancho=Math.max(18,H.length)
const nuevas=[]
PRESTAMOS.forEach(p=>{
  const pagadas=p.cuadro.filter(c=>c[8]).length
  const totCap=p.cuadro.reduce((s,c)=>s+c[3],0), totInt=p.cuadro.reduce((s,c)=>s+c[4],0)
  const totImp=p.cuadro.reduce((s,c)=>s+c[5]+c[6]+c[7],0)
  console.log(`\n▸ ${p.nombre} (#${p.op}) — 24 cuotas · ${pagadas} pagadas · ${24-pagadas} pendientes`)
  console.log(`   capital ${money(totCap)} · interés ${money(totInt)} · impuestos ${money(totImp)} · total ${money(totCap+totInt+totImp)}`)
  const pend=p.cuadro.filter(c=>!c[8])
  console.log(`   pendiente de caja: ${money(pend.reduce((s,c)=>s+c[2],0))} · de eso gasto (int+imp): ${money(pend.reduce((s,c)=>s+c[4]+c[5]+c[6]+c[7],0))}`)
  p.cuadro.forEach(c=>{
    const [n,vto,total,cap,int,iva,per,sel,ab]=c
    const f=new Array(ancho).fill('')
    f[C.pre]=p.nombre; f[C.cn]=`cuota ${n}/24`; f[C.ct]=24; f[C.vto]=dmy(vto); f[C.monto]=total
    f[C.mon]='ARS'; f[C.pag]=ab?'SI':'NO'; if(ab)f[C.fp]=dmy(vto); f[C.cta]=p.cuenta
    f[C.nota]=`Préstamo #${p.op} · a nombre de Sofía (financia a Magma)`; f[C.tipo]='Banco'
    f[C.deu]='Sofía Grenier'; f[C.acr]='Banco Galicia (SGR Garantizar)'
    f[C.cap]=cap; f[C.int]=int; f[C.imp]=iva+per+sel
    nuevas.push(f)
  })
})

// comisión Garantizar a GASTOS_FIJOS
const gr=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'GASTOS_FIJOS!1:1'})
const GH=gr.data.values[0]; const gc=n=>GH.findIndex(h=>txt(h).toLowerCase()===n.toLowerCase())
const gcom=new Array(GH.length).fill('')
const setG=(n,v)=>{const c=gc(n);if(c>=0)gcom[c]=v}
setG('Categoria','Financieros'); setG('Concepto','Comisión Garantizar (SGR) - préstamos Galicia'); setG('Monto',460000)
setG('Moneda','ARS'); setG('Frecuencia','único'); setG('Persona/Cuenta','Galicia Sofi'); setG('Activo','SI')
setG('Pagado','SI'); setG('Fecha pago','18/5/2026'); setG('Observacion','Comisión única por las garantías SGR de los 2 préstamos Galicia. Pagada 18/5/2026.')
console.log(`\n▸ GASTOS_FIJOS: + Comisión Garantizar $460.000 (único, pagado 18/5/2026)`)

console.log(`\n${'─'.repeat(66)}\n   ${aBorrar.length} filas viejas → ${nuevas.length} filas nuevas + 1 gasto único`)
if(!GO){ console.log(`\nPara aplicar:  node scripts/prestamos-galicia-cargar.mjs --go\n`); process.exit(0) }

// borrar viejas (de abajo hacia arriba)
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId))'})
const sheetId=meta.data.sheets.find(s=>s.properties.title==='PRESTAMOS').properties.sheetId
if(aBorrar.length){
  const reqs=aBorrar.sort((a,b)=>b-a).map(f=>({deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:f-1,endIndex:f}}}))
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:reqs}})
  console.log(`\n✓ ${aBorrar.length} filas viejas borradas`)
}
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'PRESTAMOS!A:T',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:nuevas}})
console.log(`✓ ${nuevas.length} cuotas cargadas`)
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'GASTOS_FIJOS!A:Z',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[gcom]}})
console.log(`✓ comisión Garantizar cargada`)

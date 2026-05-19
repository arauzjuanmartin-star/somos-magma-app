// Genera PDF de muestra del nuevo diseño usando un presu real
import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'
import { jsPDF } from 'jspdf'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})

const parseMonto = v => { const s=String(v||'').replace(/[\s$]/g,''); if(s.includes(',')&&s.includes('.'))return s.lastIndexOf(',')>s.lastIndexOf('.')?Number(s.replace(/\./g,'').replace(',','.'))||0:Number(s.replace(/,/g,''))||0; if(s.includes(','))return Number(s.replace(',','.'))||0; return Number(s)||0 }
const fmt$ = n => parseMonto(n).toLocaleString('es-AR')
const toDisplay = iso => { if(!iso)return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}` }
const cleanSvc = s => String(s||'')
  .replace(/[\u{1F300}-\u{1FAFF}]/gu,'')
  .replace(/[☀-➿]/g,'')
  .replace(/[︀-️]/g,'')
  .replace(/[​-‏‪-‮]/g,'')
  .replace(/[ -⁯]/g,'')
  .replace(/^[\s!'"`þÞ]+/,'')
  .trim()

const PEDIDO_KEYS = ['Pedido 1','Pedido 2','Pedido3 ','Pedido 4','Pedido 5','Pedido 6','Pedido 7','Pedido 8','Pedido 9','Pedido 10','Pedido 11','Pedido 12']

// Leer presupuesto target del sheet
const NRO_TARGET = process.argv[2] || '1791'
const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:AX' })
const headers = r.data.values[0]
const presus = r.data.values.slice(1).map(row => {
  const o = {}; headers.forEach((h,i)=>{ const k=h||`col${i}`; if(o[k]!==undefined)o[`${k}_${i}`]=row[i]||''; else o[k]=row[i]||'' }); return o
})
const p = presus.find(x => String(x['Columna 1']||x['col0']||'').trim() === String(NRO_TARGET))
if (!p) { console.error('No encontré presu', NRO_TARGET); process.exit(1) }

const presuN = p['Columna 1'] || p['col0']
console.log(`Generando PDF de #${presuN}: ${p['Cliente']} / ${p['Proyecto']}`)

const form = {
  nro: String(presuN),
  fechaEmision: new Date().toISOString().slice(0,10),
  cliente: p['Cliente']||'',
  agencia: p['Agencia']||'',
  proyecto: p['Proyecto']||'',
  fechaEvento: p['Fecha Evento']||'',
  precioTotal: String(Math.round(parseMonto(p['Precio Final']))),
  servicios: PEDIDO_KEYS.map(k=>p[k]).filter(Boolean).map(cleanSvc),
  observaciones: 'Material crudo no incluido. Edición y entrega final según términos abajo.',
  pagoAlt: true, pagoAltDias: '30', pagoAltMonto: String(Math.round(parseMonto(p['Precio Final'])*1.15)),
  plazo: '7',
}
const validez = (()=>{ const d=new Date(form.fechaEmision); d.setDate(d.getDate()+20); return d.toISOString().slice(0,10) })()
const clausulas = [
  'No se entregan crudos ni archivos editables salvo acuerdo expreso por escrito.',
  'Se incluyen hasta dos rondas de correcciones sin costo. Cambios adicionales tendrán un costo a convenir. Las revisiones deben solicitarse dentro de los 7 días posteriores a la primera entrega.',
  'El pago debe realizarse dentro del plazo indicado. En caso de demora, Somos Magma se reserva el derecho de pausar la entrega hasta regularizar el pago.',
  `Este presupuesto tiene validez hasta el ${toDisplay(validez)}. Pasada esa fecha los precios podrán ser revisados.`,
  'El material es para uso exclusivo del cliente indicado. Somos Magma se reserva el derecho de utilizarlo con fines de portfolio, salvo acuerdo en contrario.',
]

// === Renderizar PDF (mismo código que pages/presupuesto.js) ===
const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
const W=210, H=297, M=20
let y=0
doc.setFillColor(9,9,9); doc.rect(0,0,W,H,'F')

y=28
doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(140,140,140)
doc.text('somos', M, y-7)
doc.setFont('helvetica','bold'); doc.setFontSize(24); doc.setTextColor(206,38,55)
doc.text('MAGMA', M, y)
doc.setFontSize(18); doc.setTextColor(21,67,248)
doc.text('//', M+44, y)

const rX = W-M
doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(150,150,150)
doc.text('Somos Magma', rX, y-10, {align:'right'})
doc.text('Buenos Aires', rX, y-5, {align:'right'})
doc.text(toDisplay(form.fechaEmision), rX, y, {align:'right'})
doc.setTextColor(206,38,55); doc.setFont('helvetica','bold'); doc.setFontSize(9)
doc.text('Presu. N° '+(form.nro||'___'), rX, y+5, {align:'right'})

y+=14
const lineW = W-M*2
for(let i=0;i<=120;i++){
  const t = i/120
  const rr=Math.round(21+(206-21)*t), gg=Math.round(67+(38-67)*t), bb=Math.round(248+(55-248)*t)
  doc.setDrawColor(rr,gg,bb); doc.setLineWidth(0.5)
  doc.line(M+lineW*t, y, M+lineW*((i+1)/120), y)
}

y+=15
doc.setFont('helvetica','bold'); doc.setFontSize(32); doc.setTextColor(255,255,255)
doc.text('Presupuesto', M, y)
y+=10; doc.setFontSize(15); doc.setTextColor(206,38,55); doc.setFont('helvetica','normal')
doc.text('Cobertura Audiovisual', M, y)

y+=16
const filas = [
  ['Cliente', form.cliente],
  form.agencia ? ['Agencia', form.agencia] : null,
  form.fechaEvento ? ['Evento', form.fechaEvento] : null,
  form.proyecto ? ['Proyecto', form.proyecto] : null,
].filter(Boolean)
for(const [k,v] of filas){
  doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(21,67,248)
  doc.text(k, M, y)
  doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(230,230,230)
  doc.text(String(v), M+30, y)
  y+=7
}

y+=4; doc.setDrawColor(40,40,40); doc.setLineWidth(0.3); doc.line(M,y,W-M,y)

y+=12
doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(206,38,55)
doc.text('SERVICIOS', M, y); y+=8

const svcsLimpios = form.servicios.filter(Boolean)
const svcsMap = {}
const ordenInsercion = []
for(const s of svcsLimpios){
  if (!svcsMap[s]) { svcsMap[s] = 0; ordenInsercion.push(s) }
  svcsMap[s]++
}
for(const s of ordenInsercion){
  const cant = svcsMap[s]
  doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(220,220,220)
  const label = cant > 1 ? `${cant}x ${s}` : s
  doc.setFillColor(206,38,55); doc.circle(M+2, y-1.3, 0.9, 'F')
  const lines = doc.splitTextToSize(label, W-M*2-10)
  doc.text(lines, M+7, y)
  y += lines.length * 5.8
}

if(form.observaciones){
  y+=6
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(150,150,150)
  doc.text('OBSERVACIONES', M, y); y+=6
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(180,180,180)
  const obs = doc.splitTextToSize(form.observaciones, W-M*2)
  doc.text(obs, M, y); y+=obs.length*5.2
}

y+=10; doc.setDrawColor(40,40,40); doc.setLineWidth(0.3); doc.line(M,y,W-M,y); y+=12

if(form.pagoAlt && parseFloat(form.pagoAltMonto) > 0){
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(155,155,155)
  doc.text('Pago a '+form.pagoAltDias+' días', M, y)
  doc.setLineDashPattern([1,1.5],0); doc.setDrawColor(60,60,60)
  doc.line(M+34, y-0.8, W-M-44, y-0.8)
  doc.setLineDashPattern([],0)
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(190,190,190)
  doc.text('$'+fmt$(form.pagoAltMonto)+' + IVA', W-M, y, {align:'right'}); y+=10
}

doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(255,255,255)
doc.text('Valor total', M, y)
doc.setLineDashPattern([1,1.5],0); doc.setDrawColor(70,70,70)
doc.line(M+28, y-1, W-M-50, y-1)
doc.setLineDashPattern([],0)
doc.setFontSize(16); doc.setTextColor(206,38,55)
doc.text('$'+fmt$(form.precioTotal)+' + IVA', W-M, y, {align:'right'})

y+=14
for(let i=0;i<=120;i++){
  const t = i/120
  const rr=Math.round(21+(206-21)*t), gg=Math.round(67+(38-67)*t), bb=Math.round(248+(55-248)*t)
  doc.setDrawColor(rr,gg,bb); doc.setLineWidth(0.5)
  doc.line(M+lineW*t, y, M+lineW*((i+1)/120), y)
}

y+=12
doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(105,105,105)
doc.text('TÉRMINOS Y CONDICIONES', M, y); y+=8

const tcTitulos = ['1. Entrega de material','2. Revisiones','3. Pago','4. Validez','5. Derechos de uso']
const tc = tcTitulos.map((t,i) => [t, clausulas[i] || ''])
doc.setFontSize(7.5)
for(const [titulo, texto] of tc){
  doc.setFont('helvetica','bold'); doc.setTextColor(160,160,160)
  doc.text(titulo+': ', M, y)
  const tw = doc.getTextWidth(titulo+': ')
  doc.setFont('helvetica','normal'); doc.setTextColor(110,110,110)
  const ls = doc.splitTextToSize(texto, W-M*2-tw)
  if(ls[0]) doc.text(ls[0], M+tw, y)
  for(let i=1;i<ls.length;i++){ y+=4.2; doc.text(ls[i], M, y) }
  y+=7
}

const fY = 287
doc.setFontSize(7.5)
doc.setFont('helvetica','normal'); doc.setTextColor(60,60,60); doc.text('somos ', M, fY)
const sw=doc.getTextWidth('somos ')
doc.setFont('helvetica','bold'); doc.setTextColor(206,38,55); doc.text('MAGMA', M+sw, fY)
const mw=doc.getTextWidth('MAGMA')
doc.setTextColor(21,67,248); doc.text(' //', M+sw+mw, fY)
doc.setFont('helvetica','normal'); doc.setTextColor(50,50,50); doc.text('  Buenos Aires', M+sw+mw+5, fY)
doc.setTextColor(21,67,248); doc.text('somosmagma.com', W-M, fY, {align:'right'})

const buffer = Buffer.from(doc.output('arraybuffer'))
const outPath = `/tmp/presu-muestra-${presuN}.pdf`
writeFileSync(outPath, buffer)
console.log(`✓ PDF generado: ${outPath} (${buffer.length} bytes)`)
console.log(`Servicios renderizados: ${ordenInsercion.length}`)
ordenInsercion.forEach(s => console.log(`  • ${svcsMap[s]>1?svcsMap[s]+'x ':''}${s}`))

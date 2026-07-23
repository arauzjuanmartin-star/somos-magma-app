/**
 * Lee los PDFs de factura cargados en Drive y saca el N° de factura para cargarlo al sheet.
 * Las filas SIN PDF quedan aparte: pueden ser cobros en efectivo (no llevan número).
 *
 *   node scripts/facturas-leer-numero.mjs        -> preview
 *   node scripts/facturas-leer-numero.mjs --go   -> escribe los números al sheet
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
// pdf-parse nuevo exporta la clase PDFParse (CommonJS), no una función por defecto
const { PDFParse } = createRequire(import.meta.url)('pdf-parse')

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive.readonly']})
const sheets=google.sheets({version:'v4',auth})
const drive=google.drive({version:'v3',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const GO=process.argv.includes('--go')
const ERR=/^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const txt=v=>{const s=String(v??'').trim();return ERR.test(s)?'':s}
const num=v=>{const s=txt(v).replace(/\s/g,'');if(!s)return 0;return parseFloat(s.replace(/[^\d.]/g,''))||0}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const esTrue=v=>/^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(v))
const colL=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s}
const fileId=u=>{const m=String(u||'').match(/\/d\/([A-Za-z0-9_-]{20,})/)||String(u||'').match(/id=([A-Za-z0-9_-]{20,})/);return m?m[1]:null}

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'FACTURACION',valueRenderOption:'FORMATTED_VALUE'})
const F=r.data.values||[], H=F[0], i=n=>H.indexOf(n)

const sin=F.slice(1).map((x,n)=>({x,fila:n+2}))
  .filter(({x})=>!esTrue(x[i('Cobrado')]) && num(x[i('Precio FINAL')])>0 && !txt(x[i('Nro de Factura')]))
  .sort((a,b)=>num(b.x[i('Precio FINAL')])-num(a.x[i('Precio FINAL')]))

const conPDF=sin.filter(({x})=>fileId(x[i('Factura')]))
const sinPDF=sin.filter(({x})=>!fileId(x[i('Factura')]))

console.log(`\n${sin.length} filas sin N° · ${conPDF.length} con PDF en Drive · ${sinPDF.length} sin PDF\n`)
console.log('Leyendo los PDFs…\n')

// Números ya cargados en el sheet: si el PDF devuelve uno que ya existe en otra fila,
// algo no cierra (PDF equivocado o fila duplicada). No se escribe: se reporta.
const yaUsados={}
F.slice(1).forEach((x,n)=>{ const v=txt(x[i('Nro de Factura')]); if(v) (yaUsados[v]=yaUsados[v]||[]).push(n+2) })

const updates=[], noLeidos=[], choques=[]
for(const {x,fila} of conPDF){
  const id=fileId(x[i('Factura')])
  const etiqueta=`#${txt(x[i('N° Presupuesto')])} ${txt(x[i('Cliente')])||txt(x[i('Agencia')])} — ${txt(x[i('Proyecto')]).slice(0,30)}`
  try{
    const res=await drive.files.get({fileId:id, alt:'media', supportsAllDrives:true},{responseType:'arraybuffer'})
    const parser=new PDFParse({data:Buffer.from(res.data)})
    const data=await parser.getText()
    await parser.destroy()
    const t=String(data.text||'').replace(/\s+/g,' ')
    // En las facturas de AFIP los rótulos van juntos y después los valores:
    //   "Punto de Venta: Comp. Nro:  00002 00000023"
    let pv=null, cn=null
    let m=t.match(/Punto de Venta:\s*Comp\.?\s*Nro\.?:?\s*(\d{1,5})\s+(\d{1,8})/i)
    if(m){ pv=m[1]; cn=m[2] }
    // variante con cada rótulo seguido de su valor
    if(!pv){ const a=t.match(/Punto de Venta:?\s*(\d{1,5})\b/i), b=t.match(/Comp\.?\s*Nro\.?:?\s*(\d{1,8})\b/i)
      if(a&&b){ pv=a[1]; cn=b[1] } }
    // variante ya formateada: 0001-00000058
    if(!pv){ const c=t.match(/\b(\d{4,5})\s*-\s*(\d{8})\b/); if(c){ pv=c[1]; cn=c[2] } }
    if(!pv||!cn){ noLeidos.push({etiqueta, fila, motivo:'no encontré el número en el PDF'}); continue }
    const nro=`${String(parseInt(pv,10)).padStart(4,'0')}-${String(parseInt(cn,10)).padStart(8,'0')}`
    const tipo=(t.match(/FACTURA\s+([ABCEM])\b/i)||[])[1]||''
    if(yaUsados[nro]){ choques.push({etiqueta, fila, nro, otras:yaUsados[nro]}); continue }
    console.log(`  ✓ ${nro}  ${tipo?`(Factura ${tipo.toUpperCase()}) `:''}${etiqueta}`)
    updates.push({range:`FACTURACION!${colL(i('Nro de Factura'))}${fila}`, values:[[nro]], etiqueta, nro})
  }catch(e){
    noLeidos.push({etiqueta, fila, motivo:e.message.slice(0,70)})
  }
}

if(choques.length){
  console.log(`\n🔴 ${choques.length} NO se escriben — el número leído YA existe en otra fila:`)
  choques.forEach(c=>console.log(`     fila ${c.fila} · ${c.etiqueta}\n        el PDF dice ${c.nro}, que ya está en la fila ${c.otras.join(', ')}\n        → o la fila está duplicada, o el PDF adjunto es de otra factura`))
}

if(noLeidos.length){
  console.log(`\n⚠️  ${noLeidos.length} PDF que no pude leer:`)
  noLeidos.forEach(n=>console.log(`     ${n.etiqueta} — ${n.motivo}`))
}

if(sinPDF.length){
  console.log(`\n═══ SIN PDF — ¿son las de EFECTIVO? ═══`)
  console.log(`   Estas no tienen factura cargada. Si se cobran en efectivo NO llevan número:`)
  console.log(`   hay que marcarlas para que la app deje de pedirlas.\n`)
  sinPDF.forEach(({x,fila})=>console.log(`   fila ${fila} · ${money(num(x[i('Precio FINAL')])).padStart(13)} · #${txt(x[i('N° Presupuesto')])} · ${txt(x[i('Cliente')])||txt(x[i('Agencia')])} — ${txt(x[i('Proyecto')]).slice(0,34)}`))
}

console.log(`\n═══ RESUMEN ═══`)
console.log(`   ${updates.length} números leídos del PDF, listos para cargar`)
console.log(`   ${noLeidos.length} PDF ilegibles · ${choques.length} con número repetido (a revisar) · ${sinPDF.length} sin PDF (posible efectivo)`)

if(!GO){ console.log(`\nPara cargar los números:  node scripts/facturas-leer-numero.mjs --go\n`); process.exit(0) }

if(updates.length){
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'RAW',data:updates.map(({range,values})=>({range,values}))}})
  console.log(`\n✅ ${updates.length} números de factura cargados`)
  await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
    requestBody:{values:[[new Date().toISOString(),'script:facturas-leer-numero','nro-factura-desde-pdf','FACTURACION','',`${updates.length} números leídos de los PDF de Drive`]]}})
}

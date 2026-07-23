/**
 * Carga los 2 préstamos Santander (a nombre de Sofía) reconstruyendo el cuadro de marcha
 * francés (TNA 63%, IVA 21% s/interés). No había PDF cuota-por-cuota, solo el resumen;
 * la reconstrucción se validó contra la próxima cuota real: dif 0,7% y 0,1%.
 *
 * PROPIEDAD (dato de Juan): el $7,5M es 50% Magma / 50% Sofía; el $2,5M es 100% Sofía personal.
 *
 *   node scripts/prestamos-santander-cargar.mjs        -> preview
 *   node scripts/prestamos-santander-cargar.mjs --go   -> aplica
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
const r2=n=>Math.round(n*100)/100

// Reconstrucción francesa: capital + interés + IVA(21%) por cuota
function cuadro(P,n,tna,dia,mes1,anio1){
  const i=tna/12, base=P*i/(1-Math.pow(1+i,-n))
  let saldo=P, filas=[]
  for(let k=1;k<=n;k++){
    const interes=saldo*i, capital=base-interes; saldo=Math.max(0,saldo-capital)
    const iva=interes*0.21
    const fecha=new Date(anio1,(mes1-1)+(k-1),dia)
    filas.push({k, vto:`${fecha.getDate()}/${fecha.getMonth()+1}/${fecha.getFullYear()}`,
      capital:r2(capital), interes:r2(interes), imp:r2(iva), total:r2(base+iva)})
  }
  return filas
}

const PRESTAMOS=[
  {nombre:'Santander #810-03510008128/6', op:'810-03510008128/6', P:7500000, n:18, dia:4, mes1:10, anio1:2025,
   pagadas:10, cuenta:'Santander Sofi', prop:'50% Magma / 50% Sofía', matchViejo:/santander.*081286|810.*08128/i, valida:{cuota:11,real:695812.24}},
  {nombre:'Santander #810-03510008035/1', op:'810-03510008035/1', P:2500000, n:12, dia:10, mes1:9, anio1:2025,
   pagadas:11, cuenta:'Santander Sofi', prop:'100% Sofía (personal)', matchViejo:/santander.*080351|810.*08035/i, valida:{cuota:12,real:288757.16}},
]

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESTAMOS'})
const P=r.data.values||[], H=P[0]
const col=n=>H.findIndex(h=>txt(h).toLowerCase()===n.toLowerCase())
const C={pre:col('Prestamo'),cn:col('Cuota nro'),ct:col('Cuotas total'),vto:col('Vencimiento'),monto:col('Monto cuota'),
  mon:col('Moneda'),pag:col('Pagado'),fp:col('Fecha pago'),cta:col('Cuenta pago'),nota:col('Notas'),tipo:col('Tipo'),
  deu:col('Deudor'),acr:col('Acreedor'),cap:col('Capital'),int:col('Interes'),imp:col('Impuestos')}
const ancho=Math.max(18,H.length)

console.log(`\n${'='.repeat(66)}\n${GO?'APLICANDO':'PREVIEW — no escribe nada'}\n${'='.repeat(66)}`)

const aBorrar=[]
P.forEach((row,i)=>{ if(i===0)return; if(PRESTAMOS.some(p=>p.matchViejo.test(txt(row[C.pre])))) aBorrar.push(i+1) })
console.log(`\n▸ Filas viejas a reemplazar: ${aBorrar.length} (${aBorrar.join(', ')||'ninguna'})`)

const nuevas=[]
PRESTAMOS.forEach(p=>{
  const filas=cuadro(p.P,p.n,0.63,p.dia,p.mes1,p.anio1)
  const v=filas[p.valida.cuota-1]
  const dif=((v.total/p.valida.real-1)*100).toFixed(1)
  const pend=filas.slice(p.pagadas)
  console.log(`\n▸ ${p.nombre} — ${money(p.P)} · 18? ${p.n}c · ${p.pagadas} pagas · ${p.n-p.pagadas} pendientes · ${p.prop}`)
  console.log(`   validación cuota ${p.valida.cuota}: reconstruida ${money(v.total)} vs real ${money(p.valida.real)} → dif ${dif}%`)
  console.log(`   pendiente de caja: ${money(pend.reduce((s,f)=>s+f.total,0))} · de eso gasto (int+iva): ${money(pend.reduce((s,f)=>s+f.interes+f.imp,0))}`)
  filas.forEach(f=>{
    const row=new Array(ancho).fill('')
    row[C.pre]=p.nombre; row[C.cn]=`cuota ${f.k}/${p.n}`; row[C.ct]=p.n; row[C.vto]=f.vto; row[C.monto]=f.total
    row[C.mon]='ARS'; const pagada=f.k<=p.pagadas; row[C.pag]=pagada?'SI':'NO'; if(pagada)row[C.fp]=f.vto
    row[C.cta]=p.cuenta; row[C.tipo]='Banco'; row[C.deu]=p.prop; row[C.acr]='Banco Santander'
    row[C.nota]=`Préstamo #${p.op} · a nombre de Sofía · RECONSTRUIDO (francés TNA 63%, validado dif ${dif}%)`
    row[C.cap]=f.capital; row[C.int]=f.interes; row[C.imp]=f.imp
    nuevas.push(row)
  })
})

console.log(`\n${'─'.repeat(66)}\n   ${aBorrar.length} filas viejas → ${nuevas.length} filas nuevas`)
if(!GO){ console.log(`\nPara aplicar:  node scripts/prestamos-santander-cargar.mjs --go\n`); process.exit(0) }

const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId))'})
const sheetId=meta.data.sheets.find(s=>s.properties.title==='PRESTAMOS').properties.sheetId
if(aBorrar.length){
  const reqs=aBorrar.sort((a,b)=>b-a).map(f=>({deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:f-1,endIndex:f}}}))
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:reqs}})
  console.log(`\n✓ ${aBorrar.length} filas viejas borradas`)
}
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'PRESTAMOS!A:R',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:nuevas}})
console.log(`✓ ${nuevas.length} cuotas cargadas`)

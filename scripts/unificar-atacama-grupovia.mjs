/**
 * Unifica la agencia duplicada Grupo Via -> Atacama (mismo CUIT 30-50259063-0).
 *
 * REGLA CLAVE: "Grupo Via" también se usa como CLIENTE de la agencia Stadium
 * (#1975, #2064, #2072). Esas filas NO se tocan — ahí Grupo Via es la marca, no la agencia.
 * Solo se renombra donde Grupo Via figura como AGENCIA.
 *
 *   node scripts/unificar-atacama-grupovia.mjs        -> preview, no escribe nada
 *   node scripts/unificar-atacama-grupovia.mjs --go   -> aplica
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const GO=process.argv.includes('--go')

const txt=v=>String(v??'').trim()
const nrm=v=>txt(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
const colL=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s}
const VIEJO='grupo via', NUEVO='Atacama'

const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId))'})
const sheetIdDe=t=>meta.data.sheets.find(s=>s.properties.title===t)?.properties.sheetId

const TABS=['AGENCIAS','PRESUPUESTOS','PROYECTOS','FACTURACION','Contactos/agencias','CLIENTES']
const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:TABS,valueRenderOption:'FORMATTED_VALUE'})
const D=Object.fromEntries(TABS.map((t,i)=>[t,r.data.valueRanges[i].values||[]]))

const updates=[]   // {range, values, desc}
const borrar=[]    // {tab, sheetId, fila, desc}
const intactas=[]

// ---- 1. PRESUPUESTOS: col E[4]=Agencia, F[5]=Cliente, A[0]=nro ----
D['PRESUPUESTOS'].forEach((row,i)=>{
  if(i===0) return
  const fila=i+1, nro=txt(row[0]), ag=nrm(row[4]), cl=nrm(row[5])
  if(ag===VIEJO){
    updates.push({range:`PRESUPUESTOS!${colL(4)}${fila}`,values:[[NUEVO]],desc:`PRESUPUESTOS fila ${fila} #${nro} · Agencia "${txt(row[4])}" -> ${NUEVO}`})
    if(cl===VIEJO) updates.push({range:`PRESUPUESTOS!${colL(5)}${fila}`,values:[[NUEVO]],desc:`PRESUPUESTOS fila ${fila} #${nro} · Cliente "${txt(row[5])}" -> ${NUEVO}`})
  } else if(cl===VIEJO){
    intactas.push(`PRESUPUESTOS #${nro} · ${txt(row[4])} / ${txt(row[5])} — Grupo Via es CLIENTE, se respeta`)
  }
})
// ---- 2. PROYECTOS: E[4]=Agencia, F[5]=Cliente, C[2]=nro ----
D['PROYECTOS'].forEach((row,i)=>{
  if(i===0) return
  const fila=i+1, nro=txt(row[2]), ag=nrm(row[4]), cl=nrm(row[5])
  if(ag===VIEJO){
    updates.push({range:`PROYECTOS!${colL(4)}${fila}`,values:[[NUEVO]],desc:`PROYECTOS fila ${fila} #${nro} · Agencia -> ${NUEVO}`})
    if(cl===VIEJO) updates.push({range:`PROYECTOS!${colL(5)}${fila}`,values:[[NUEVO]],desc:`PROYECTOS fila ${fila} #${nro} · Cliente -> ${NUEVO}`})
  } else if(cl===VIEJO){
    intactas.push(`PROYECTOS #${nro} · ${txt(row[4])} / ${txt(row[5])} — Grupo Via es CLIENTE, se respeta`)
  }
})
// ---- 3. FACTURACION: H[7]=Agencia, I[8]=Cliente, B[1]=nro ----
D['FACTURACION'].forEach((row,i)=>{
  if(i===0) return
  const fila=i+1, nro=txt(row[1]), ag=nrm(row[7]), cl=nrm(row[8])
  if(ag===VIEJO){
    updates.push({range:`FACTURACION!${colL(7)}${fila}`,values:[[NUEVO]],desc:`FACTURACION fila ${fila} #${nro} · Agencia -> ${NUEVO}`})
    if(cl===VIEJO) updates.push({range:`FACTURACION!${colL(8)}${fila}`,values:[[NUEVO]],desc:`FACTURACION fila ${fila} #${nro} · Cliente -> ${NUEVO}`})
  } else if(cl===VIEJO){
    intactas.push(`FACTURACION #${nro} · ${txt(row[7])} / ${txt(row[8])} — Grupo Via es CLIENTE, se respeta`)
  }
})
// ---- 4. Contactos/agencias: C[2]=Agencia ----
D['Contactos/agencias'].forEach((row,i)=>{
  if(i===0) return
  if(nrm(row[2])===VIEJO)
    updates.push({range:`Contactos/agencias!${colL(2)}${i+1}`,values:[[NUEVO]],desc:`Contactos fila ${i+1} · "${txt(row[0])}" · Agencia -> ${NUEVO}`})
})
// ---- 5. AGENCIAS: borrar la fila duplicada ----
D['AGENCIAS'].forEach((row,i)=>{
  if(i===0) return
  if(nrm(row[0])===VIEJO) borrar.push({tab:'AGENCIAS',sheetId:sheetIdDe('AGENCIAS'),fila:i+1,desc:`AGENCIAS fila ${i+1}: "${txt(row[0])}" (CUIT ${txt(row[1])}) — duplicada de Atacama`})
})
// ---- 6. CLIENTES: Grupo Via SIGUE siendo cliente real de Stadium -> se conserva ----
D['CLIENTES'].forEach((row,i)=>{
  if(i===0) return
  if(nrm(row[0])===VIEJO) intactas.push(`CLIENTES fila ${i+1}: "${txt(row[0])}" — se conserva: sigue siendo cliente de Stadium`)
})

// ================= PREVIEW =================
console.log(`\n${'='.repeat(70)}`)
console.log(GO?'APLICANDO CAMBIOS':'PREVIEW — no se escribe nada')
console.log(`${'='.repeat(70)}`)
console.log(`\n▸ ${updates.length} celda(s) a renombrar (Grupo Via -> Atacama):\n`)
updates.forEach(u=>console.log(`    ${u.desc}`))
console.log(`\n▸ ${borrar.length} fila(s) a BORRAR:\n`)
borrar.forEach(b=>console.log(`    ⚠️  ${b.desc}`))
console.log(`\n▸ ${intactas.length} referencia(s) que NO se tocan:\n`)
intactas.forEach(s=>console.log(`    ✓ ${s}`))

if(!GO){ console.log(`\n${'='.repeat(70)}\nPara aplicar:  node scripts/unificar-atacama-grupovia.mjs --go\n`); process.exit(0) }

// ================= APLICAR =================
if(updates.length){
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,
    requestBody:{valueInputOption:'RAW',data:updates.map(({range,values})=>({range,values}))}})
  console.log(`\n✓ ${updates.length} celdas renombradas`)
}
// borrar de abajo hacia arriba para que no se corran los índices
for(const b of borrar.sort((a,z)=>z.fila-a.fila)){
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
    {deleteDimension:{range:{sheetId:b.sheetId,dimension:'ROWS',startIndex:b.fila-1,endIndex:b.fila}}}
  ]}})
  console.log(`✓ borrada ${b.tab} fila ${b.fila}`)
}

// ================= VERIFICAR =================
await new Promise(r=>setTimeout(r,1500))
const v=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:TABS,valueRenderOption:'FORMATTED_VALUE'})
const V=Object.fromEntries(TABS.map((t,i)=>[t,v.data.valueRanges[i].values||[]]))
console.log(`\n${'='.repeat(70)}\nVERIFICACIÓN\n${'='.repeat(70)}`)
const quedanAg=[
  ...V['PRESUPUESTOS'].slice(1).filter(r=>nrm(r[4])===VIEJO).map(r=>`PRESUPUESTOS #${txt(r[0])}`),
  ...V['PROYECTOS'].slice(1).filter(r=>nrm(r[4])===VIEJO).map(r=>`PROYECTOS #${txt(r[2])}`),
  ...V['FACTURACION'].slice(1).filter(r=>nrm(r[7])===VIEJO).map(r=>`FACTURACION #${txt(r[1])}`),
  ...V['AGENCIAS'].slice(1).filter(r=>nrm(r[0])===VIEJO).map(()=>`AGENCIAS fila`),
  ...V['Contactos/agencias'].slice(1).filter(r=>nrm(r[2])===VIEJO).map(r=>`Contactos "${txt(r[0])}"`),
]
console.log(quedanAg.length ? `❌ Todavía hay Grupo Via como AGENCIA en: ${quedanAg.join(', ')}`
                            : `✅ No queda ninguna referencia a "Grupo Via" como agencia.`)
const comoCliente=[
  ...V['PRESUPUESTOS'].slice(1).filter(r=>nrm(r[5])===VIEJO).map(r=>`presu #${txt(r[0])} (ag: ${txt(r[4])})`),
  ...V['PROYECTOS'].slice(1).filter(r=>nrm(r[5])===VIEJO).map(r=>`proy #${txt(r[2])} (ag: ${txt(r[4])})`),
  ...V['FACTURACION'].slice(1).filter(r=>nrm(r[8])===VIEJO).map(r=>`fact #${txt(r[1])} (ag: ${txt(r[7])})`),
]
console.log(`✅ "Grupo Via" se conserva como CLIENTE en ${comoCliente.length}: ${comoCliente.join(', ')}`)
const at=V['AGENCIAS'].slice(1).filter(r=>nrm(r[0])==='atacama')
console.log(`✅ AGENCIAS: ${at.length} fila "Atacama"${at[0]?` · CUIT ${txt(at[0][1])} · ${txt(at[0][3])}`:''}`)

/**
 * Cierra los tres cabos sueltos de los gastos de tarjeta para el estado de
 * resultados de Mariana:
 *
 *  1. ADOBE está cargado por una licencia ($59.035) y son tres (Juan, Dani,
 *     Sofi). Se corrige con lo que realmente se pagó en el mes de referencia.
 *  2. GOOGLE WORKSPACE (el que mantiene las cuentas @somosmagma.com) no está
 *     en ningún lado: se paga con Santander Amex y ese resumen no se carga
 *     desde junio. Se agrega leyendo el último importe real del sheet.
 *  3. La fila ancla "AGREGAR GASTOS TARJETA" queda con Categoria="Tarjeta"
 *     para que la app deje de contarla como un gasto pendiente de $0.
 *
 * Uso:  node scripts/mariana-cerrar-gastos-tarjeta.mjs             (preview)
 *       node scripts/mariana-cerrar-gastos-tarjeta.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim(); if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
  return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR=process.argv.includes('--escribir')
const MESREF=7, ANIO=2026
const M=['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['MOVIMIENTOS_TARJETA!A:N','GASTOS_FIJOS!A:Q'],valueRenderOption:'FORMATTED_VALUE'})
const obj=v=>{const [h,...f]=v.values||[];return f.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
const [MOV,GF]=R.data.valueRanges.map(obj)
const H=R.data.valueRanges[1].values[0]
const num=v=>{const n=parseFloat(String(v).replace(/[^0-9.-]/g,''));return isNaN(n)?0:n}
const fmt=n=>'$'+Math.round(n).toLocaleString('es-AR')
const colLetra=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26}return s}
const cel=(fila,campo)=>`GASTOS_FIJOS!${colLetra(H.indexOf(campo))}${fila}`

const ups=[], resumen=[]

// ── 1) ADOBE: lo que realmente se pagó en el mes de referencia ──
const adobes=MOV.filter(m=>/adobe/i.test(String(m['Comercio']))&&String(m['Mes']).trim()===String(MESREF)&&String(m['Año']).includes(String(ANIO)))
const adobeReal=adobes.reduce((s,m)=>s+num(m['Monto']),0)
const iAdobe=GF.findIndex(g=>/^adobe$/i.test(String(g['Concepto']||'').trim()))
if(iAdobe>=0 && adobeReal>0){
  const filaAdobe=iAdobe+2, actual=num(GF[iAdobe]['Monto'])
  const detalle=adobes.map(m=>fmt(num(m['Monto']))).join(' + ')
  console.log(`1) ADOBE — cargado ${fmt(actual)} · real en ${M[MESREF]}-${ANIO} ${fmt(adobeReal)} (${adobes.length} licencias: ${detalle})`)
  console.log(`   fila ${filaAdobe} · diferencia ${fmt(adobeReal-actual)}`)
  ups.push({range:cel(filaAdobe,'Monto'),values:[[adobeReal]]})
  ups.push({range:cel(filaAdobe,'Observacion'),values:[[`${adobes.length} licencias (Juan, Dani, Sofi): ${detalle}. Valor de ${M[MESREF]}-${ANIO}, se paga con tarjeta.`]]})
  resumen.push(['ADOBE', actual, adobeReal, adobeReal-actual])
} else console.log(`1) ADOBE — sin cargos en ${M[MESREF]}-${ANIO}, no se toca`)

// ── 2) GOOGLE WORKSPACE: el importe real más reciente que haya en el sheet ──
const ws=MOV.filter(m=>/workspace/i.test(String(m['Comercio'])+' '+String(m['Descripcion'])))
  .sort((a,b)=>(Number(a['Año'])-Number(b['Año']))||(Number(a['Mes'])-Number(b['Mes']))).at(-1)
const yaWs=GF.some(g=>/workspace/i.test(String(g['Concepto']||'')))
let filaWs=null
if(!ws) console.log(`\n2) GOOGLE WORKSPACE — no encuentro ningún movimiento, no se agrega`)
else if(yaWs) console.log(`\n2) GOOGLE WORKSPACE — ya está en GASTOS_FIJOS, no se duplica`)
else {
  console.log(`\n2) GOOGLE WORKSPACE — último cargo real: ${ws['Moneda']} ${num(ws['Monto'])} · ${ws['Tarjeta']} · ${M[Number(ws['Mes'])]}-${ws['Año']}`)
  console.log(`   se agrega como fila nueva (el resumen de ${ws['Tarjeta']} no se carga desde jun-2026)`)
  filaWs=ws
}

// ── 3) la fila ancla de Mariana ──
const iAncla=GF.findIndex(g=>/agregar gastos tarjeta/i.test(String(g['Concepto']||'')))
if(iAncla>=0){
  const filaAncla=iAncla+2, catActual=String(GF[iAncla]['Categoria']||'').trim()
  if(catActual.toLowerCase()!=='tarjeta'){
    console.log(`\n3) Fila ${filaAncla} "AGREGAR GASTOS TARJETA" — Categoria "${catActual||'(vacía)'}" → "Tarjeta"`)
    console.log(`   así la app deja de mostrarla como gasto pendiente de $0 en "Otros"`)
    ups.push({range:cel(filaAncla,'Categoria'),values:[['Tarjeta']]})
    ups.push({range:cel(filaAncla,'Observacion'),values:[['Los gastos de tarjeta están en las filas de abajo (Categoria=Tarjeta) y en la solapa FIJOS_TARJETA.']]})
  } else console.log(`\n3) Fila ancla ya está en Categoria="Tarjeta"`)
}

if(!ups.length && !filaWs){ console.log('\nNada para cambiar.'); process.exit(0) }
if(!ESCRIBIR){ console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir. ---'); process.exit(0) }

if(ups.length) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,
  requestBody:{valueInputOption:'USER_ENTERED',data:ups}})

if(filaWs){
  const set=o=>{const f=new Array(H.length).fill(''); Object.entries(o).forEach(([k,v])=>{const i=H.indexOf(k); if(i>=0)f[i]=v}); return f}
  const fila=set({'Categoria':'Tarjeta','Concepto':'GOOGLE WORKSPACE','Monto':num(filaWs['Monto']),
    'Moneda':String(filaWs['Moneda']).toUpperCase(),'Frecuencia':'mensual','Persona/Cuenta':filaWs['Tarjeta'],'Activo':'SI',
    'Tipo':'Software · Suscripciones',
    'Observacion':`Mantiene las cuentas @somosmagma.com. Se paga con ${filaWs['Tarjeta']}; ese resumen no se carga desde jun-2026, por eso no aparecía. Último importe real: ${M[Number(filaWs['Mes'])]}-${filaWs['Año']}.`})
  const iAncla2=GF.findIndex(g=>/agregar gastos tarjeta/i.test(String(g['Concepto']||'')))
  const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId))'})
  const sid=meta.data.sheets.find(s=>s.properties.title==='GASTOS_FIJOS').properties.sheetId
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
    {insertDimension:{range:{sheetId:sid,dimension:'ROWS',startIndex:iAncla2+2,endIndex:iAncla2+3},inheritFromBefore:false}}]}})
  await sheets.spreadsheets.values.update({spreadsheetId:ID,range:`GASTOS_FIJOS!A${iAncla2+3}`,
    valueInputOption:'USER_ENTERED',requestBody:{values:[fila]}})
}

// ── verificar releyendo ──
const v=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'GASTOS_FIJOS!A:Q'})
const V=v.data.values||[], H2=V[0]
const iC=H2.indexOf('Categoria'), iCo=H2.indexOf('Concepto'), iMo=H2.indexOf('Monto')
const buscar=re=>V.slice(1).find(f=>re.test(String(f[iCo]||'')))
console.log('\n── verificación ──')
const a=buscar(/^adobe$/i); console.log(`✓ ADOBE = ${fmt(num(a?.[iMo]))}`)
const w=buscar(/workspace/i); console.log(w? `✓ GOOGLE WORKSPACE = ${w[iMo]} ${V[0]&&''}${String(w[H2.indexOf('Moneda')])} · Categoria="${w[iC]}"` : '✗ no se agregó Workspace')
const an=buscar(/agregar gastos tarjeta/i); console.log(`✓ fila ancla · Categoria="${an?.[iC]}"`)
console.log(`✓ filas con Categoria="Tarjeta": ${V.slice(1).filter(f=>/^tarjeta$/i.test(String(f[iC]||'').trim())).length}`)
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan (script)','mariana-cerrar-gastos-tarjeta','GASTOS_FIJOS','',`adobe+workspace+ancla`]]}}) }catch(e){}

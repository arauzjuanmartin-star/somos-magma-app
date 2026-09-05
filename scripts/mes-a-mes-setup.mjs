/**
 * Solapa MES A MES — facturación, producción y gasto en freelancers, mes por mes,
 * para que Mariana (que trabaja en el sheet, no en la app) lo saque sola.
 *
 * El problema que resuelve: hoy no hay dónde mirarlo.
 *   · BALANCE está a mano, con #REF! en marzo y $0 en mayo/junio, y muere en junio.
 *   · FACTURACION!Mes está MEZCLADA: ene-may son texto ("07 - JULIO"), jun-ago son
 *     fechas con formato "MM - mmmm". Ningún SUMIF le pega a las dos cosas.
 *   · Pagos_Staff!"Mes Referencia" son fechas cuyo AÑO es siempre 2026, aunque la
 *     fila sea de 2025 (el desplegable se armó con fechas de un solo año).
 *
 * La solución: una columna "Período" (texto "2026-07") derivada por fórmula en cada
 * solapa, y la tabla MES A MES que suma con SUMIFS contra ella.
 *   · FACTURACION: período = Fecha emision, y si está vacía, Fecha Evento.
 *   · PROYECTOS:   período = Fecha Evento (cuándo se PRODUJO, no cuándo se facturó).
 *   · Pagos_Staff: mes = Mes Referencia; año = el del evento del proyecto
 *     (N° Presupuesto -> PROYECTOS) y si no cruza, el de la Fecha Pago.
 *
 * La columna "Juan + Sofi" separa, dentro del gasto de freelancers, las jornadas que
 * hacen los socios de lo que se le paga a gente de afuera. En Pagos_Staff figuran como
 * "Juan Martin Arauz" y "Sofia Maria Grenier Basavilbaso" (nombres únicos: ojo que hay
 * un "Juan Mountford" y un "Juan Montani", y que Lulu también es Grenier Basavilbaso).
 *
 * Va la producción del mes al lado de la facturación a propósito: Magma factura tarde
 * (el trabajo de mayo se facturó en junio), así que "freelancers / facturado" da 161%
 * en mayo y no significa nada. El % que sirve es freelancers sobre PRODUCCIÓN.
 *
 * Las columnas "Período" van AL FINAL de cada solapa a propósito: los endpoints de la
 * app leen FACTURACION hasta AG y Pagos_Staff hasta N por posición. Meterlas en el
 * medio corre todo y rompe la carga de facturas y el marcado de pagos.
 *
 * Uso:  node scripts/mes-a-mes-setup.mjs              (preview, no escribe)
 *       node scripts/mes-a-mes-setup.mjs --escribir
 * Después:  node scripts/mes-a-mes-verificar.mjs
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR=process.argv.includes('--escribir')
const TAB='MES A MES', ANIO=2026
const txt=v=>String(v??'').trim()
const col=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26}return s}
const rgb=h=>({red:parseInt(h.slice(0,2),16)/255,green:parseInt(h.slice(2,4),16)/255,blue:parseInt(h.slice(4,6),16)/255})
const NEGRO=rgb('090909'), MAGMA=rgb('CE2637'), AZUL=rgb('1543F8'), AZULITO=rgb('EEF2FF'), BLANCO=rgb('FFFFFF'), GRIS=rgb('F4F4F5'), GRISTXT=rgb('6B7280'), AMARILLO=rgb('FEF3C7'), LINEA=rgb('D4D4D8')

const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId,gridProperties),basicFilter)'})
const hoja=t=>meta.data.sheets.find(s=>s.properties.title===t)
const FACh=hoja('FACTURACION'), PSh=hoja('Pagos_Staff'), PROh=hoja('PROYECTOS'), MMh=hoja(TAB)
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['FACTURACION!A1:BZ1','Pagos_Staff!A1:BZ1','PROYECTOS!A1:FZ1','FACTURACION!K1:K400','Pagos_Staff!G1:G1500','PROYECTOS!H1:H1300']})
const [fH,pH,rH,fK,pG,rHH]=R.data.valueRanges.map(v=>v.values||[])
const FH=fH[0]||[], PH=pH[0]||[], RH=rH[0]||[]

const buscaPer=H=>H.findIndex(h=>['período','periodo'].includes(txt(h).toLowerCase()))
const C_FAC=buscaPer(FH)===-1?FH.length:buscaPer(FH)
const C_PS =buscaPer(PH)===-1?PH.length:buscaPer(PH)
const C_PRO=buscaPer(RH)===-1?RH.length:buscaPer(RH)
const LF=col(C_FAC), LP=col(C_PS), LR=col(C_PRO)
const N_FAC=Math.max(FACh.properties.gridProperties.rowCount, fK.length+40)
const N_PS =Math.max(PSh.properties.gridProperties.rowCount, pG.length+60)
const N_PRO=Math.max(PROh.properties.gridProperties.rowCount, rHH.length+40)

// FACTURACION: P=Fecha emision · G=Fecha Evento
const fFac=r=>`=IFERROR(IF(AND($P${r}="",$G${r}=""),"",TEXT(IF($P${r}<>"",$P${r},$G${r}),"yyyy-mm")),"")`
// PROYECTOS: D=Fecha Evento
const fPro=r=>`=IFERROR(IF($D${r}="","",TEXT($D${r},"yyyy-mm")),"")`
// Pagos_Staff: C=Mes Referencia · D=N° Presupuesto · A=Fecha Pago
const fPs=r=>`=IF($C${r}="","",IFERROR(LET(ev,IFERROR(VLOOKUP($D${r},PROYECTOS!$C:$D,2,FALSE),0),a,IF(ev>1000,YEAR(ev),IF($A${r}="",YEAR(TODAY()),YEAR($A${r})-IF(AND(MONTH($C${r})=12,MONTH($A${r})=1),1,0))),TEXT(DATE(a,MONTH($C${r}),1),"yyyy-mm")),TEXT(DATE(YEAR(TODAY()),MONTH($C${r}),1),"yyyy-mm")))`

console.log('\n'+'█'.repeat(84))
console.log('  PREVIEW — solapa "MES A MES" + columna Período en 3 solapas')
console.log('█'.repeat(84))
console.log(`\n1) FACTURACION → ${LF} "Período" ${buscaPer(FH)===-1?'(NUEVA)':'(existe, se reescribe)'} · filas 2:${N_FAC}`)
console.log(`   ${LF}2 = ${fFac(2)}`)
console.log(`\n2) PROYECTOS   → ${LR} "Período" ${buscaPer(RH)===-1?'(NUEVA)':'(existe, se reescribe)'} · filas 2:${N_PRO}`)
console.log(`   ${LR}2 = ${fPro(2)}`)
console.log(`\n3) Pagos_Staff → ${LP} "Período" ${buscaPer(PH)===-1?'(NUEVA)':'(existe, se reescribe)'} · filas 2:${N_PS}`)
console.log(`   ${LP}2 = ${fPs(2)}`)
console.log(`\n4) Solapa "${TAB}" ${MMh?'(existe, se reescribe entera)':'(NUEVA, primera pestaña del libro)'}`)
console.log(`   ${ANIO}: 12 meses + TOTAL · facturado / cobrado / producción / freelancers (Juan+Sofi vs externos) / %`)
console.log(`\n   NO se toca ninguna celda de datos. Solo columnas AL FINAL y una solapa nueva.`)
if(!ESCRIBIR){ console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }

// ── columnas Período ─────────────────────────────────────────────────────────
const grow=[]
for(const [h,c] of [[FACh,C_FAC],[PSh,C_PS],[PROh,C_PRO]])
  if(h.properties.gridProperties.columnCount<c+1)
    grow.push({appendDimension:{sheetId:h.properties.sheetId,dimension:'COLUMNS',length:c+1-h.properties.gridProperties.columnCount}})
if(grow.length) await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:grow}})

await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:[
  {range:`FACTURACION!${LF}1:${LF}${N_FAC}`,values:[['Período'],...Array.from({length:N_FAC-1},(_,k)=>[fFac(k+2)])]},
  {range:`PROYECTOS!${LR}1:${LR}${N_PRO}`,  values:[['Período'],...Array.from({length:N_PRO-1},(_,k)=>[fPro(k+2)])]},
  {range:`Pagos_Staff!${LP}1:${LP}${N_PS}`, values:[['Período'],...Array.from({length:N_PS-1},(_,k)=>[fPs(k+2)])]},
]}})
console.log(`✓ Período escrito en FACTURACION!${LF} · PROYECTOS!${LR} · Pagos_Staff!${LP}`)

// ── la solapa ────────────────────────────────────────────────────────────────
let mmId=MMh?.properties.sheetId
if(!mmId){
  const res=await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
    {addSheet:{properties:{title:TAB,index:0,gridProperties:{rowCount:40,columnCount:15,frozenRowCount:4}}}}]}})
  mmId=res.data.replies[0].addSheet.properties.sheetId
}else{
  if(MMh.properties.gridProperties.columnCount<15)
    await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[{appendDimension:{sheetId:mmId,dimension:'COLUMNS',length:15-MMh.properties.gridProperties.columnCount}}]}})
  await sheets.spreadsheets.values.clear({spreadsheetId:ID,range:`${TAB}!A1:Z40`})
}

const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const F=`FACTURACION!$${LF}:$${LF}`, P=`Pagos_Staff!$${LP}:$${LP}`, PR=`PROYECTOS!$${LR}:$${LR}`
const SOCIOS=['*Arauz*','Sofia*Grenier*']   // Juan Martin Arauz · Sofia Maria Grenier Basavilbaso
const filas=[]
filas.push(['SOMOS MAGMA · MES A MES','','','','','','','','','','','','AÑO →',ANIO,''])
filas.push(['Cuánto se facturó, cuánto se produjo y cuánto se gastó en freelancers, mes por mes. Se actualiza solo: sale de FACTURACION, PROYECTOS y Pagos_Staff.','','','','','','','','','','','','','',''])
filas.push(new Array(15).fill(''))
filas.push(['Mes','Período','Facturas','FACTURADO (neto)','IVA','Facturado c/ IVA','Ya cobrado','Falta cobrar','PRODUCCIÓN del mes','FREELANCERS','de eso: JUAN + SOFI','de eso: externos','% s/ producción','Ya pagado','Falta pagar'])
for(let m=1;m<=12;m++){
  const r=4+m
  filas.push([MESES[m-1],
    `=TEXT(DATE($N$1,${m},1),"yyyy-mm")`,
    `=COUNTIFS(${F},$B${r},FACTURACION!$K:$K,">0")`,
    `=SUMIFS(FACTURACION!$K:$K,${F},$B${r})`,
    `=SUMIFS(FACTURACION!$L:$L,${F},$B${r})`,
    `=SUMIFS(FACTURACION!$M:$M,${F},$B${r})`,
    `=SUMIFS(FACTURACION!$K:$K,${F},$B${r},FACTURACION!$E:$E,TRUE)`,
    `=$D${r}-$G${r}`,
    `=SUMIFS(PROYECTOS!$H:$H,${PR},$B${r})`,
    `=SUMIFS(Pagos_Staff!$G:$G,${P},$B${r})`,
    SOCIOS.map(s=>`SUMIFS(Pagos_Staff!$G:$G,${P},$B${r},Pagos_Staff!$B:$B,"${s}")`).join('+').replace(/^/,'='),
    `=$J${r}-$K${r}`,
    `=IFERROR(IF($I${r}=0,"",$J${r}/$I${r}),"")`,
    `=SUMIFS(Pagos_Staff!$H:$H,${P},$B${r})`,
    `=$J${r}-$N${r}`])
}
filas.push(['TOTAL '+ANIO,'','=SUM(C5:C16)','=SUM(D5:D16)','=SUM(E5:E16)','=SUM(F5:F16)','=SUM(G5:G16)','=SUM(H5:H16)','=SUM(I5:I16)','=SUM(J5:J16)','=SUM(K5:K16)','=SUM(L5:L16)','=IFERROR(IF($I$17=0,"",$J$17/$I$17),"")','=SUM(N5:N16)','=SUM(O5:O16)'])
filas.push(new Array(15).fill(''))
const nota=(a,b)=>[a,b,'','','','','','','','','','','','','']
filas.push(nota('CÓMO SE LEE',''))
filas.push(nota('FACTURADO (neto)','sin IVA. Cada factura cae en el mes de su Fecha emisión (si no la tiene, el de la Fecha Evento).'))
filas.push(nota('PRODUCCIÓN del mes','lo vendido en los eventos DE ESE MES (solapa PROYECTOS). Se factura después, por eso no coincide con FACTURADO.'))
filas.push(nota('FREELANCERS','lo que se le debe al staff por el trabajo DE ESE MES (Monto Adeudado de Pagos_Staff, por Mes Referencia).'))
filas.push(nota('Falta pagar','el pago sale el 15 del mes siguiente. Un mes recién cerrado siempre muestra casi todo acá: es normal, no es deuda atrasada.'))
filas.push(nota('JUAN + SOFI','las jornadas que hacen los socios, ya incluidas en FREELANCERS. "externos" es el resto: lo que sale de la empresa hacia afuera.'))
filas.push(nota('% s/ producción','cuánto de lo producido se va en freelancers. Va contra PRODUCCIÓN y no contra FACTURADO porque se factura tarde.'))
filas.push(nota('Ver el detalle','en FACTURACION, PROYECTOS y Pagos_Staff filtrá por la columna "Período" con el valor de la columna B (ej: '+ANIO+'-07).'))
filas.push(nota('','En Pagos_Staff, Juan y Sofi figuran como "Juan Martin Arauz" y "Sofia Maria Grenier Basavilbaso".'))
await sheets.spreadsheets.values.update({spreadsheetId:ID,range:`${TAB}!A1`,valueInputOption:'USER_ENTERED',requestBody:{values:filas}})

// ── formato ──────────────────────────────────────────────────────────────────
const rng=(r1,r2,c1,c2)=>({sheetId:mmId,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2})
const rc=(r1,r2,c1,c2,f,fields)=>({repeatCell:{range:rng(r1,r2,c1,c2),cell:{userEnteredFormat:f},fields:'userEnteredFormat('+fields+')'}})
const fmt=[]
fmt.push({mergeCells:{range:rng(0,1,0,12),mergeType:'MERGE_ALL'}})
fmt.push({mergeCells:{range:rng(1,2,0,15),mergeType:'MERGE_ALL'}})
fmt.push(rc(0,1,0,15,{backgroundColor:NEGRO,textFormat:{foregroundColor:BLANCO,bold:true,fontSize:14},verticalAlignment:'MIDDLE',padding:{left:10}},'backgroundColor,textFormat,verticalAlignment,padding'))
fmt.push(rc(0,1,12,13,{horizontalAlignment:'RIGHT',textFormat:{foregroundColor:BLANCO,bold:true,fontSize:10}},'horizontalAlignment,textFormat'))
fmt.push(rc(0,1,13,14,{backgroundColor:AMARILLO,horizontalAlignment:'CENTER',textFormat:{foregroundColor:NEGRO,bold:true,fontSize:12},numberFormat:{type:'NUMBER',pattern:'0'}},'backgroundColor,horizontalAlignment,textFormat,numberFormat'))
fmt.push(rc(1,2,0,15,{textFormat:{foregroundColor:GRISTXT,fontSize:9,italic:true},wrapStrategy:'CLIP'},'textFormat,wrapStrategy'))
fmt.push(rc(3,4,0,15,{backgroundColor:NEGRO,textFormat:{foregroundColor:BLANCO,bold:true,fontSize:10},horizontalAlignment:'CENTER',verticalAlignment:'MIDDLE',wrapStrategy:'WRAP'},'backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy'))
fmt.push(rc(4,16,0,1,{textFormat:{bold:true},horizontalAlignment:'LEFT'},'textFormat,horizontalAlignment'))
fmt.push(rc(4,17,1,2,{textFormat:{foregroundColor:GRISTXT,fontSize:9},horizontalAlignment:'CENTER'},'textFormat,horizontalAlignment'))
fmt.push(rc(4,17,2,3,{horizontalAlignment:'CENTER',numberFormat:{type:'NUMBER',pattern:'0'}},'horizontalAlignment,numberFormat'))
fmt.push(rc(4,17,3,12,{numberFormat:{type:'CURRENCY',pattern:'$#,##0'}},'numberFormat'))
fmt.push(rc(4,17,13,15,{numberFormat:{type:'CURRENCY',pattern:'$#,##0'}},'numberFormat'))
fmt.push(rc(4,17,12,13,{numberFormat:{type:'PERCENT',pattern:'0.0%'},horizontalAlignment:'CENTER'},'numberFormat,horizontalAlignment'))
for(const c of [3,8,9]) fmt.push(rc(4,17,c,c+1,{backgroundColor:GRIS,textFormat:{bold:true}},'backgroundColor,textFormat'))
fmt.push(rc(4,17,10,12,{backgroundColor:AZULITO},'backgroundColor'))
fmt.push(rc(4,17,10,11,{textFormat:{bold:true,foregroundColor:AZUL}},'textFormat'))
fmt.push(rc(16,17,0,15,{textFormat:{bold:true,fontSize:11},borders:{top:{style:'SOLID_MEDIUM',color:NEGRO}}},'textFormat,borders'))
fmt.push(rc(18,19,0,15,{textFormat:{bold:true,fontSize:10,foregroundColor:MAGMA}},'textFormat'))
fmt.push(rc(19,27,0,1,{textFormat:{bold:true,fontSize:9}},'textFormat'))
fmt.push(rc(19,27,1,15,{textFormat:{fontSize:9,foregroundColor:GRISTXT},wrapStrategy:'CLIP'},'textFormat,wrapStrategy'))
fmt.push({updateBorders:{range:rng(3,17,0,15),top:{style:'SOLID',color:LINEA},bottom:{style:'SOLID',color:LINEA},left:{style:'SOLID',color:LINEA},right:{style:'SOLID',color:LINEA},innerHorizontal:{style:'SOLID',color:LINEA},innerVertical:{style:'SOLID',color:LINEA}}})
const anchos=[110,74,66,132,104,124,118,112,132,132,138,124,98,118,118]
anchos.forEach((w,i)=>fmt.push({updateDimensionProperties:{range:{sheetId:mmId,dimension:'COLUMNS',startIndex:i,endIndex:i+1},properties:{pixelSize:w},fields:'pixelSize'}}))
for(const [i,h] of [[0,38],[3,40]]) fmt.push({updateDimensionProperties:{range:{sheetId:mmId,dimension:'ROWS',startIndex:i,endIndex:i+1},properties:{pixelSize:h},fields:'pixelSize'}})
fmt.push({updateSheetProperties:{properties:{sheetId:mmId,gridProperties:{frozenRowCount:4}},fields:'gridProperties.frozenRowCount'}})
const mesHoy=new Date().getMonth()+1
fmt.push(rc(3+mesHoy,4+mesHoy,0,1,{textFormat:{bold:true,foregroundColor:MAGMA}},'textFormat'))
// El filtro de FACTURACION/PROYECTOS no se toca: son Tables de Sheets y se extienden solas.
await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:fmt}})
console.log(`✓ solapa "${TAB}" armada y formateada`)
console.log('\nAhora corré:  node scripts/mes-a-mes-verificar.mjs\n')

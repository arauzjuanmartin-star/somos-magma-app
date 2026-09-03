/**
 * Solapa ACUERDOS — los términos vigentes de cada acuerdo con el equipo.
 * Preview por default. `--escribir` para aplicar.
 *
 * Por qué existe: RRHH guarda la persona y su tarifa de lista, SUELDOS el fijo mensual,
 * Pagos_Staff lo que se pagó. Ninguna guarda las CONDICIONES del acuerdo (vigencia,
 * mínimo garantizado, hora extra, cancelación, quién paga el monotributo, el doc firmado).
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR=process.argv.includes('--escribir')

const HEADERS=['Persona','Alcance','Modalidad','Desde','Hasta','Estado','Unidad','Precio unidad',
  'Duración','Hora adicional','Mínimo x mes','Monto del mínimo','Precio extra','Monotributo',
  'Viáticos','Cancelación','Entrega','Equipos','Cuándo cobra','Doc','Lo que quedó abierto']

const ANCHOS=[190,230,150,90,90,90,180,110,110,120,100,130,110,180,260,170,300,240,260,300,320]

const FILAS=[
  ['Jorge Luis Chavez (Lucho)','Cámara para toda Magma — SIN Austral','Banco de jornadas','01/09/2026','31/12/2026','Vigente',
   'Jornada (media o entera cuentan igual)',190000,'Hasta 9 hs',20000,10,1900000,180000,
   'Magma — categoría C, $66.020,12/mes',
   'Fuera de Capital cubiertos. Comida a criterio de él. De 12 hs: Magma paga ida y vuelta',
   'Menos de 24 hs = 30% de la jornada',
   'Solo cámara — la edición quedó fuera del acuerdo',
   'Usa los suyos (seguro por su cuenta). Los de Magma los cubre Magma',
   'El mínimo del 1 al 5 mes vencido. Las jornadas extra el 15 del mes siguiente',
   'https://claude.ai/code/artifact/a8e2ab70-be02-4c60-a2db-b8f0fc2ae4bd',
   'El preaviso para cortar antes de diciembre. Sin cláusula de no-solicitación ni confidencialidad. En diciembre se revisa aumento y recategorización de monotributo.'],

  ['Juan Gugliottella (Juani)','Universidad Austral — toda la cuenta','Por cobertura','01/09/2026','','Vigente',
   'Cobertura (foto + video, media jornada)',130000,'Hasta 5 hs',20000,'','','',
   'A su cargo',
   'Solo el viático de Pilar ($68.400–$73.000). Ni viaje, ni comida, ni estadía',
   'Menos de 24 hs = 30% ($39.000)',
   'Crudos el MISMO DÍA. Fotos editadas: las que se puedan, tienen que contar lo que pasó. El video lo edita Magma',
   'Los suyos y asegurados. Magma NO cubre rotura ni pérdida',
   'El 15 del mes siguiente, el mes completo junto. Días antes le llega el mail de administración',
   'https://claude.ai/code/artifact/b96c2de3-e618-4335-b801-9c8abee563b0',
   'Falta la fecha de fin del acuerdo. Dos eventos distintos el mismo día = dos coberturas; si se superponen lo resuelve Magma.'],
]

const meta=await sheets.spreadsheets.get({spreadsheetId:ID})
const existe=meta.data.sheets.find(s=>s.properties.title==='ACUERDOS')

const PLATA=new Set([7,9,11,12])  // H, J, L, M — las únicas columnas en pesos
const M=(v,i)=>typeof v==='number' ? (PLATA.has(i)?'$':'')+v.toLocaleString('es-AR') : v
console.log('\n'+'█'.repeat(78))
console.log('  SOLAPA "ACUERDOS" — '+(ESCRIBIR?'ESCRIBIENDO':'PREVIEW (nada se toca)'))
console.log('█'.repeat(78))
console.log(existe?'\n  ⚠ La solapa ACUERDOS YA EXISTE — este script no la pisa. Salgo.\n':'\n  La solapa NO existe. Se crea con 21 columnas y 2 filas.\n')
console.log('  COLUMNAS: '+HEADERS.map((h,i)=>String.fromCharCode(65+i)+'='+h).join(' · ')+'\n')
for(const f of FILAS){
  console.log('  '+'─'.repeat(74))
  HEADERS.forEach((h,i)=>{ const v=f[i]; if(v==='')return
    console.log(`  ${h.padEnd(22)} ${String(M(v,i)).slice(0,90)}`) })
}
console.log('  '+'─'.repeat(74))
console.log('\n  Formato: header negro con texto blanco, fila 1 congelada, filtro en A1:U3,')
console.log('  anchos por columna, montos en $ argentino y fechas como fecha.\n')

if(!ESCRIBIR){ console.log('  → Nada se escribió. Para aplicar: node scripts/acuerdos-setup.mjs --escribir\n'); process.exit(0) }
if(existe){ console.log('  → No hago nada porque ya existe.\n'); process.exit(0) }

const add=await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
  {addSheet:{properties:{title:'ACUERDOS',gridProperties:{rowCount:200,columnCount:HEADERS.length,frozenRowCount:1}}}}]}})
const sid=add.data.replies[0].addSheet.properties.sheetId

await sheets.spreadsheets.values.update({spreadsheetId:ID,range:'ACUERDOS!A1',valueInputOption:'USER_ENTERED',
  requestBody:{values:[HEADERS,...FILAS]}})

await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
  {repeatCell:{range:{sheetId:sid,startRowIndex:0,endRowIndex:1},
    cell:{userEnteredFormat:{backgroundColor:{red:.035,green:.035,blue:.035},
      textFormat:{foregroundColor:{red:1,green:1,blue:1},bold:true,fontSize:10},
      verticalAlignment:'MIDDLE',wrapStrategy:'WRAP'}},
    fields:'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)'}},
  {repeatCell:{range:{sheetId:sid,startRowIndex:1,endRowIndex:1+FILAS.length},
    cell:{userEnteredFormat:{verticalAlignment:'TOP',wrapStrategy:'WRAP',textFormat:{fontSize:10}}},
    fields:'userEnteredFormat(verticalAlignment,wrapStrategy,textFormat)'}},
  ...[7,9,11,12].map(c=>({repeatCell:{range:{sheetId:sid,startRowIndex:1,startColumnIndex:c,endColumnIndex:c+1},
    cell:{userEnteredFormat:{numberFormat:{type:'CURRENCY',pattern:'"$"#,##0'}}},fields:'userEnteredFormat.numberFormat'}})),
  ...[3,4].map(c=>({repeatCell:{range:{sheetId:sid,startRowIndex:1,startColumnIndex:c,endColumnIndex:c+1},
    cell:{userEnteredFormat:{numberFormat:{type:'DATE',pattern:'dd/mm/yyyy'}}},fields:'userEnteredFormat.numberFormat'}})),
  ...ANCHOS.map((w,i)=>({updateDimensionProperties:{range:{sheetId:sid,dimension:'COLUMNS',startIndex:i,endIndex:i+1},
    properties:{pixelSize:w},fields:'pixelSize'}})),
  {setBasicFilter:{filter:{range:{sheetId:sid,startRowIndex:0,endRowIndex:1+FILAS.length,startColumnIndex:0,endColumnIndex:HEADERS.length}}}},
  {addConditionalFormatRule:{rule:{ranges:[{sheetId:sid,startRowIndex:1,startColumnIndex:5,endColumnIndex:6}],
    booleanRule:{condition:{type:'TEXT_EQ',values:[{userEnteredValue:'Vigente'}]},
      format:{backgroundColor:{red:.85,green:.94,blue:.87},textFormat:{bold:true}}}},index:0}},
  {addConditionalFormatRule:{rule:{ranges:[{sheetId:sid,startRowIndex:1,startColumnIndex:5,endColumnIndex:6}],
    booleanRule:{condition:{type:'TEXT_EQ',values:[{userEnteredValue:'Vencido'}]},
      format:{backgroundColor:{red:.98,green:.87,blue:.88}}}},index:1}},
]}})
console.log('  ✓ Solapa ACUERDOS creada con 2 filas.\n')

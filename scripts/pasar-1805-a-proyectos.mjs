import { google } from 'googleapis'
import { readFileSync } from 'fs'

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

// Llamar al mismo endpoint que usa la app cuando aprueba: cambiar estado a APROBADO
// dispara el flow automático presu → PROYECTOS
const r = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PRESUPUESTOS!A:AX'})
const headers = r.data.values[0]
const rows = r.data.values

let target = -1
for(let i=1;i<rows.length;i++) if(String(rows[i][0]||'').trim()==='1805') { target=i; break }
if (target===-1) { console.log('No encontré 1805'); process.exit(1) }

const p = rows[target]
console.log(`Encontrado #1805 en fila ${target+1}: ${p[5]} / ${p[6]}, evento ${p[1]}, total ${p[8]}`)

// Verificar que esté APROBADO
console.log(`Estado actual: ${p[3]}`)

// Verificar si ya está en proyectos
const rProy = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PROYECTOS!A:C'})
const yaExiste = (rProy.data.values||[]).some((row,i)=>i>0 && String(row[2]||'').trim()==='1805')
if (yaExiste) { console.log('Ya existe en PROYECTOS'); process.exit(0) }

// Construir fila completa (60 cols A:BH) - misma lógica que /api/presupuesto-estado
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
let mesStr = ''
const partsFE = String(p[1]||'').split('/')
if (partsFE.length >= 2) {
  const mesNum = parseInt(partsFE[1])
  if (mesNum >= 1 && mesNum <= 12) mesStr = String(mesNum).padStart(2,'0') + ' - ' + MESES[mesNum-1]
}

const proyRow = new Array(60).fill('')
proyRow[0]=mesStr; proyRow[1]=false; proyRow[2]=p[0]; proyRow[3]=p[1]; proyRow[4]=p[4]; proyRow[5]=p[5]; proyRow[6]=p[6]
proyRow[7]=p[8]; proyRow[8]=p[39]||''; proyRow[9]=''; proyRow[10]=p[39]||''
for(let j=0;j<12;j++){
  proyRow[11+j*3]=p[11+j*2]||''
  proyRow[11+j*3+1]=p[12+j*2]||''
  proyRow[11+j*3+2]=''
}
proyRow[47]=p[35]||''; proyRow[48]=p[36]||''; proyRow[49]=''
proyRow[50]=p[9]||''; proyRow[51]=p[2]||''
proyRow[52]=p[38]||''; proyRow[53]=p[40]||''; proyRow[54]=p[41]||''; proyRow[55]=p[42]||''
proyRow[56]=p[43]||''; proyRow[57]=p[44]||''; proyRow[58]=p[8]||''; proyRow[59]=p[46]||''

await sheets.spreadsheets.values.append({
  spreadsheetId: SHEET_ID,
  range: 'PROYECTOS!A:BH',
  valueInputOption: 'USER_ENTERED',
  insertDataOption: 'INSERT_ROWS',
  requestBody: { values: [proyRow] }
})
console.log(`✓ #1805 ${p[5]} / ${p[6]} agregado a PROYECTOS`)

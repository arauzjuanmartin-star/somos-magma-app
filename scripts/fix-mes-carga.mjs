/**
 * FIX "Mes carga" de GASTOS_FIJOS.
 * La columna tiene formato de FECHA: al escribir el número 8 (agosto), Sheets lo lee como
 * 8/1/1900 y devuelve "01-1900". La app hace parseInt() → mes 1 → el gasto aparece en enero.
 * Este script: (1) pasa la columna a texto plano, (2) reescribe los meses rotos como texto.
 * Sin --escribir solo muestra el preview.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('='); let v=l.slice(i+1).trim(); if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1); return [l.slice(0,i).trim(),v]}))
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

const meta = await sheets.spreadsheets.get({spreadsheetId:ID})
const hoja = meta.data.sheets.find(s=>s.properties.title==='GASTOS_FIJOS')
const gid = hoja.properties.sheetId

const fmt = await sheets.spreadsheets.values.get({spreadsheetId:ID, range:'GASTOS_FIJOS!A:Q'})
const raw = await sheets.spreadsheets.values.get({spreadsheetId:ID, range:'GASTOS_FIJOS!A:Q', valueRenderOption:'UNFORMATTED_VALUE'})
const F=fmt.data.values, R=raw.data.values, H=F[0]
const iM=H.indexOf('Mes carga'), iC=H.indexOf('Concepto'), iF=H.indexOf('Frecuencia')
const col=n=>String.fromCharCode(65+n)

const rotas=[]
F.forEach((f,i)=>{ if(!i) return
  const visto=String(f[iM]||'').trim(), real=R[i]?.[iM]
  if(!visto) return
  // roto = lo que la app lee (parseInt) no coincide con el mes real guardado
  const leeApp=parseInt(visto), esMes=typeof real==='number'&&real>=1&&real<=12
  if(esMes && leeApp!==real) rotas.push({fila:i+1, con:f[iC], frec:f[iF], visto, real, leeApp})
})

console.log(`\n=== ${ESCRIBIR?'ESCRIBIENDO':'PREVIEW'} — ${rotas.length} filas con el mes roto ===`)
rotas.forEach(r=>console.log(`  fila ${String(r.fila).padEnd(3)} ${String(r.con).padEnd(30)} la app lo muestra en el mes ${r.leeApp} → debe ser ${r.real}  (celda dice "${r.visto}")`))
console.log(`\n+ la columna "${H[iM]}" (${col(iM)}) pasa a formato TEXTO para que no vuelva a pasar`)
if(!ESCRIBIR){ console.log('\n(nada escrito — correr con --escribir)'); process.exit(0) }

// 1) columna a texto plano
await sheets.spreadsheets.batchUpdate({spreadsheetId:ID, requestBody:{requests:[{repeatCell:{
  range:{sheetId:gid, startColumnIndex:iM, endColumnIndex:iM+1, startRowIndex:1},
  cell:{userEnteredFormat:{numberFormat:{type:'TEXT'}}}, fields:'userEnteredFormat.numberFormat'}}]}})

// 2) reescribir los meses como texto (RAW: Sheets no los reinterpreta como fecha)
if(rotas.length) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID, requestBody:{valueInputOption:'RAW',
  data: rotas.map(r=>({range:`GASTOS_FIJOS!${col(iM)}${r.fila}`, values:[[String(r.real)]]}))}})

const v = await sheets.spreadsheets.values.get({spreadsheetId:ID, range:'GASTOS_FIJOS!A:Q'})
console.log('\n=== VERIFICACIÓN (releído del sheet) ===')
rotas.forEach(r=>{ const f=v.data.values[r.fila-1]; const ok=parseInt(f[iM])===r.real
  console.log(`  ${ok?'✓':'✗'} fila ${r.fila}  ${f[iC]}  Mes carga="${f[iM]}" → la app lo muestra en el mes ${parseInt(f[iM])}`) })

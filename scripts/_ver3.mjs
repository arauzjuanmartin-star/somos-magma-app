import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
// FORMULA para ver si son fórmulas o valores pegados
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI','PRESUPUESTOS!A:AR'],valueRenderOption:'FORMULA'})
const R2=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI','PRESUPUESTOS!A:AR'],valueRenderOption:'FORMATTED_VALUE'})
const [PROf,PREf]=R.data.valueRanges.map(v=>v.values||[])
const [PRO,PRE]=R2.data.valueRanges.map(v=>v.values||[])
const H=PRO[0], PH=PRE[0]
for(const nro of ['2078','1910','1871']){
  const i=PRO.findIndex((r,k)=>k>0&&txt(r[2])===nro); if(i<0){console.log('no encontrado',nro);continue}
  const r=PRO[i], rf=PROf[i]
  console.log(`\n\x1b[1m════ #${nro} · ${txt(r[4])} · ${txt(r[6])} (fila ${i+1}) ════\x1b[0m`)
  ;[[7,'Total'],[8,'Fee Final'],[9,'Diferencia'],[10,'Fee Agencia'],[52,'Subtotal'],[53,'Imp. Ganancias'],[54,'IIBB'],[59,'Ajuste']].forEach(([c,l])=>{
    const val=txt(r[c]), form=txt(rf[c])
    console.log(`   ${l.padEnd(16)} ${val.padStart(14)}   ${form.startsWith('=')?'\x1b[36m'+form.slice(0,52)+'\x1b[0m':'\x1b[33m(valor pegado a mano)\x1b[0m'}`)})
  const ped=[]
  ;[11,14,17,20,23,26,29,32,35,38,41,44,47].forEach(c=>{ if(txt(r[c])) ped.push(`${txt(r[c])} · ${M(num(r[c+1]))} · ${txt(r[c+2])||'\x1b[31mSIN STAFF\x1b[0m'}`)})
  console.log(`   pedidos (${ped.length}):`); ped.forEach(x=>console.log(`      ${x}`))
  const pr=PRE.find((x,k)=>k>0&&txt(x[0])===nro)
  if(pr){ console.log(`   \x1b[36mPRESUPUESTO: estado=${pr[3]} · Precio Final=${pr[8]} · Subtotal=${pr[PH.indexOf('Subtotal')]} · Fee=${pr[PH.indexOf('Fee Agencia')]} · Gan=${pr[PH.indexOf('Impuesto a las ganancias')]} · IIBB=${pr[PH.indexOf('IIBB')]}\x1b[0m`) }
}

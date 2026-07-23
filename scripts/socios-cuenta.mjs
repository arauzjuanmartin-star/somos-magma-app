/**
 * Cuenta corriente de socios (Juan y Sofi) con Magma. Modelo confirmado por Juan:
 *   - Sueldo de gerente $3.200.000/mes cada uno + extras (trabajo en proyectos)
 *   - Ventana: desde el 1 de ABRIL 2026 (marzo fue el mes sin cobrar extras)
 *   - NETO = (sueldo + extras) − (haberes + tarjeta personal) + (VEPs que pagó)
 * Atribución de tarjeta: columna Descripción (Juan/Sofi/Magma). Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ERR=/^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const txt=v=>{const s=String(v??'').trim();return ERR.test(s)?'':s}
const num=v=>{const s=txt(v).replace(/\s/g,'');if(!s)return 0;const n=parseFloat(s.replace(/[^\d.]/g,''))||0;return /^-/.test(s)?-n:n}
const fecha=v=>{const m=txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const money=n=>(n<0?'-$':'$')+Math.abs(Math.round(n)).toLocaleString('es-AR')
const MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const SUELDO=3200000, DESDE=3 // mes 3 = abril (0-index). Ventana desde 1/4/2026
const hoy=new Date();hoy.setHours(0,0,0,0)
const mesesTranscurridos=[]  // meses completos/en curso desde abril
for(let m=DESDE;m<=hoy.getMonth();m++) mesesTranscurridos.push(m)

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['SOCIOS_MOVIMIENTOS','PROYECTOS','PAGOS_STAFF','MOVIMIENTOS_TARJETA'],valueRenderOption:'FORMATTED_VALUE'})
const [SOC,PRO,PAG,MOV]=r.data.valueRanges.map(v=>v.values||[])
const SH=SOC[0], si=n=>SH.findIndex(h=>txt(h).toLowerCase()===n.toLowerCase())
const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]
const STF=[13,16,19,22,25,28,31,34,37,40,43,46,49,62,65,68,71,74,77,80,83]
const SOCIOS={ Juan:{re:/arauz/i, card:/juan/i, soc:/^juan$/i}, Sofi:{re:/sofia\s+maria\s+grenier/i, card:/sofi/i, soc:/^sofi$/i} }

console.log(`\n${'█'.repeat(66)}\n  CUENTA DE SOCIOS · desde 1/4/2026 · sueldo $3,2M + extras\n${'█'.repeat(66)}`)
console.log(`  Meses en la ventana: ${mesesTranscurridos.map(m=>MES[m]).join(', ')} (${mesesTranscurridos.length})`)

for(const [nombre,cfg] of Object.entries(SOCIOS)){
  console.log(`\n\n${'═'.repeat(66)}\n  ${nombre.toUpperCase()}\n${'═'.repeat(66)}`)
  const enVentana=f=>f&&f.getFullYear()===2026&&f.getMonth()>=DESDE

  // DEBE: sueldo + extras
  const sueldoDebe=SUELDO*mesesTranscurridos.length
  let extrasDebe=0
  PRO.slice(1).forEach(row=>{const f=fecha(row[3]);if(!txt(row[2])||!enVentana(f))return
    STF.forEach((sc,k)=>{if(cfg.re.test(txt(row[sc])))extrasDebe+=num(row[PRC[k]])})})

  // RECIBIÓ: haberes/transferencias + tarjeta personal
  const haberes=SOC.slice(1).filter(x=>cfg.soc.test(txt(x[si('Socio')]))&&txt(x[si('Dirección')])==='Magma→Socio'&&enVentana(fecha(x[si('Fecha')]))).reduce((s,x)=>s+num(x[si('Monto')]),0)
  let tarjeta=0
  MOV.slice(1).forEach(x=>{if(!/personal/i.test(txt(x[8]))||!cfg.card.test(txt(x[4])))return
    const m=+txt(x[1]),a=txt(x[2]);if(a==='2026'&&m-1>=DESDE)tarjeta+=num(x[7])})

  // PUSO: VEPs
  const veps=SOC.slice(1).filter(x=>cfg.soc.test(txt(x[si('Socio')]))&&txt(x[si('Dirección')])==='Socio→Magma'&&enVentana(fecha(x[si('Fecha')]))).reduce((s,x)=>s+num(x[si('Monto')]),0)

  const debe=sueldoDebe+extrasDebe, recibio=haberes+tarjeta
  const neto=debe-recibio+veps

  console.log(`\n  MAGMA LE DEBE:`)
  console.log(`     Sueldo gerente ($3,2M × ${mesesTranscurridos.length} meses)   ${money(sueldoDebe).padStart(15)}`)
  console.log(`     Extras (trabajo en proyectos)         ${money(extrasDebe).padStart(15)}`)
  console.log(`     ${'─'.repeat(40)}`)
  console.log(`     TOTAL QUE MAGMA LE DEBE               ${money(debe).padStart(15)}`)
  console.log(`\n  EL SOCIO RETIRÓ / RECIBIÓ:`)
  console.log(`     Haberes / transferencias de Magma     ${money(haberes).padStart(15)}`)
  console.log(`     Tarjeta personal (Magma pagó lo suyo) ${money(tarjeta).padStart(15)}`)
  console.log(`     ${'─'.repeat(40)}`)
  console.log(`     TOTAL RETIRADO                        ${money(recibio).padStart(15)}`)
  console.log(`\n  EL SOCIO PUSO (aportó a Magma):`)
  console.log(`     VEPs de impuestos de Magma            ${money(veps).padStart(15)}`)
  console.log(`\n  ${'━'.repeat(50)}`)
  console.log(`  NETO: ${money(neto)}  ${neto>0?'← MAGMA LE DEBE a '+nombre:'← '+nombre+' LE DEBE a Magma'}`)
  console.log(`  ${'━'.repeat(50)}`)
}

console.log(`\n\n  Nota: tarjeta ene-mar quedó fuera (ventana desde abril). Los "Retiros en`)
console.log(`  efectivo" (ej: 2× $666.667 de Juan en abril) están contados como tarjeta`)
console.log(`  personal; si en realidad son sueldo en efectivo, decime y los muevo.`)

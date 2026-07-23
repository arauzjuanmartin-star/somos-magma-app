/**
 * Convierte RRHH en el registro completo de freelancers: agrega columnas nuevas
 * e importa las tarifas que los freelancers declararon en el formulario de feb-2025.
 *
 *   node scripts/rrhh-registro-setup.mjs        -> preview, no escribe nada
 *   node scripts/rrhh-registro-setup.mjs --go   -> aplica
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const GO=process.argv.includes('--go')
const txt=v=>String(v??'').trim()
const nrm=v=>txt(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ')
const colL=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s}

// Columnas nuevas del registro
const NUEVAS=['Tarifa media jornada','Tarifa jornada','Zona','Estado','Notas']

// Tarifas declaradas en el form de freelancers (feb-2025).
// media = activación ~4hs · jornada = evento jornada completa. Paquete integral (foto+video)
// cuando lo declararon; si no, el servicio único que ofrecen.
// [nombre, media, jornada, zona, mail, celular, rubro]
const TARIFAS=[
  ['Giuliana Reyna',700000,1200000,'Rosario','greynaphoto@gmail.com','3413708515','Fotógrafo, Filmmaker'],
  ['Pedro Maddonni Curia',145000,290000,'CABA','maddonnipedro@gmail.com','+5491140567711','Fotógrafo, Filmmaker'],
  ['Seba Maruzzi',210000,367500,'Buenos Aires','seba.maruzzi@gmail.com','541130448095','Filmmaker, Editor'],
  ['Lucas Godoy',500000,900000,'Pilar','lucasgodoyignacio@gmail.com','1122659398','Filmmaker, Fotógrafo, Drone'],
  ['Ivan Aranda',500000,700000,'Tigre','fotografia.ivanaranda@gmail.com','+54 1165461820','Fotógrafo, Filmmaker'],
  ['Justina Damia y Franco Otero',700000,900000,'La Plata','Hola@wach.prod','+542214095334','Fotógrafo, Filmmaker'],
  ['Felipe Martinez',190000,370000,'CABA','felipemartinez31contacto@gmail.com','+54 2494344131','Fotógrafo, Filmmaker, Editor'],
  ['Martín Yone',220000,null,'Rosario','Ttincaaa@gmail.com','+54 3436614270','Fotógrafo, Filmmaker'],
  ['Giovanni Beltramello',340000,530000,'CABA','giovannipbeltramello@gmail.com','+5493834553282','Filmmaker, Editor'],
  ['Gaspar Peñalba',450000,600000,'Buenos Aires','gxaspar@gmail.com','+542966406754','Fotógrafo, Filmmaker, Drone'],
  ['Franco Solano',320000,450000,'Córdoba','francoj.solano@gmail.com','+54 3516972121','Fotógrafo, Filmmaker'],
  ['Luciano Chanas Scigliotti',300000,400000,'Haedo','lnscigliotti@hotmail.com','1151848754','Filmmaker, Productor'],
  ['Iván Iszczyk',550000,1050000,'GBA','Ivaniszcz@gmail.com','+54 9 1133922668','Filmmaker, DirFoto, Drone'],
  ['Jeronimo Baliña',500000,600000,'Pilar','jerobalinia@gmail.com','5491155860312','Fotógrafo, Filmmaker, Drone'],
  ['Sabrina Insaurralde',300000,500000,'Lomas de Zamora','sabrinainsau00@gmail.com','+5401124088343','Fotógrafo, Filmmaker'],
  ['Santino Dangelo',320000,420000,'Buenos Aires','santinodangelo996@gmail.com','+542966224662','Filmmaker, Fotógrafo, Drone, FPV'],
  ['Rodrigo Nahuel Lopez',190000,350000,'CABA','audiovisualesrnph@gmail.com','+541157577852','Fotógrafo, Filmmaker'],
]

// Match tolerante: los nombres en RRHH están escritos distinto ("Lucas Godoy" vs
// "Lucas Ignacio Godoy", "Santino Dangelo" vs "Santino D' Angelo"). Compara por tokens.
const tokens=s=>nrm(s).replace(/[^a-z0-9 ]/g,'').split(' ').filter(t=>t.length>2)
const plano=s=>nrm(s).replace(/[^a-z0-9]/g,'')   // "Santino D' Angelo" -> "santinodangelo"
const mismaPersona=(a,b)=>{
  const pa=plano(a), pb=plano(b)
  if(!pa||!pb) return false
  if(pa===pb||pa.includes(pb)||pb.includes(pa)) return true
  const ta=tokens(a), tb=tokens(b)
  return ta.filter(t=>tb.includes(t)).length>=2
}

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'RRHH!A:Z',valueRenderOption:'FORMATTED_VALUE'})
const rows=r.data.values||[], head=rows[0]||[]
console.log(`\nRRHH hoy: ${rows.length-1} personas · ${head.filter(h=>txt(h)).length} columnas`)
console.log(`Columnas actuales: ${head.filter(h=>txt(h)).join(' · ')}\n`)

// 1) columnas a agregar
const faltan=NUEVAS.filter(n=>!head.some(h=>nrm(h)===nrm(n)))
let colIdx={}
let siguiente=head.length
console.log(`═══ 1. COLUMNAS NUEVAS ═══`)
if(!faltan.length) console.log(`   Ya están todas ✓`)
faltan.forEach(n=>{ colIdx[n]=siguiente; console.log(`   + ${colL(siguiente)} → "${n}"`); siguiente++ })
NUEVAS.forEach(n=>{ if(colIdx[n]===undefined) colIdx[n]=head.findIndex(h=>nrm(h)===nrm(n)) })

// 2) match de tarifas contra el roster
console.log(`\n═══ 2. TARIFAS A IMPORTAR (form feb-2025) ═══`)
const iNom=head.findIndex(h=>/nombre/i.test(txt(h)))
const updates=[]
let ok=0
const nuevos=[]
TARIFAS.forEach(t=>{
  const [nombre,media,jornada,zona,mail,cel,rubro]=t
  const fila=rows.findIndex((row,i)=>i>0&&mismaPersona(row[iNom],nombre))
  if(fila<1){ nuevos.push(t); return }
  ok++
  const set=(campo,val)=>{ if(val==null||val==='')return
    const c=colIdx[campo]; if(c===undefined||c<0)return
    const yaTiene=txt((rows[fila]||[])[c]); if(yaTiene)return   // no pisar lo ya cargado
    updates.push({range:`RRHH!${colL(c)}${fila+1}`,values:[[val]]}) }
  set('Tarifa media jornada',media); set('Tarifa jornada',jornada); set('Zona',zona); set('Estado','Activo')
  const enRRHH=txt(rows[fila][iNom])
  console.log(`   ✓ ${enRRHH.padEnd(30)} media ${media?('$'+media.toLocaleString('es-AR')).padStart(12):'—'.padStart(12)} · jornada ${jornada?('$'+jornada.toLocaleString('es-AR')).padStart(12):'—'.padStart(12)} · ${zona}`)
  if(nrm(enRRHH)!==nrm(nombre)) console.log(`      (en el form figura como "${nombre}")`)
})
console.log(`\n   ${ok} de ${TARIFAS.length} ya están en el roster`)

console.log(`\n═══ 3. SE POSTULARON Y NUNCA SE CARGARON (${nuevos.length}) ═══`)
if(nuevos.length){
  console.log(`   Completaron el formulario con su tarifa y nunca entraron al roster:\n`)
  nuevos.forEach(([n,m,j,z,mail,cel])=>console.log(`   ${n.padEnd(28)} ${z.padEnd(16)} media ${m?('$'+m.toLocaleString('es-AR')).padStart(11):'—'.padStart(11)} · ${mail}`))
  console.log(`\n   Con --con-nuevos se agregan como filas nuevas (Estado = "Candidato").`)
}

console.log(`\n═══ RESUMEN ═══`)
console.log(`   ${faltan.length} columnas nuevas`)
console.log(`   ${updates.length} celdas a completar en gente que YA está`)
console.log(`   ${nuevos.length} personas nuevas ${process.argv.includes('--con-nuevos')?'SE AGREGAN':'(no se agregan salvo --con-nuevos)'}`)
console.log(`   NO se pisa ningún dato ya cargado. NO se toca ninguna columna existente.`)

if(!GO){ console.log(`\nPara aplicar:  node scripts/rrhh-registro-setup.mjs --go [--con-nuevos]\n`); process.exit(0) }

// aplicar
if(faltan.length){
  await sheets.spreadsheets.values.update({spreadsheetId:ID,range:`RRHH!${colL(head.length)}1:${colL(head.length+faltan.length-1)}1`,
    valueInputOption:'RAW',requestBody:{values:[faltan]}})
  console.log(`\n✓ ${faltan.length} columnas agregadas`)
}
if(updates.length){
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'RAW',data:updates}})
  console.log(`✓ ${updates.length} celdas completadas`)
}
if(process.argv.includes('--con-nuevos') && nuevos.length){
  const ancho=head.length+faltan.length
  const filas=nuevos.map(([n,m,j,z,mail,cel,rubro])=>{
    const f=new Array(ancho).fill('')
    f[iNom]=n
    const set=(campo,val)=>{ const c=colIdx[campo]; if(c>=0&&val!=null&&val!=='') f[c]=val }
    const iRub=head.findIndex(h=>/rubro/i.test(txt(h))); if(iRub>=0) f[iRub]=rubro
    const iCel=head.findIndex(h=>/celular/i.test(txt(h))); if(iCel>=0) f[iCel]=cel
    const iMail=head.findIndex(h=>/^mail$/i.test(txt(h))); if(iMail>=0) f[iMail]=mail
    set('Tarifa media jornada',m); set('Tarifa jornada',j); set('Zona',z); set('Estado','Candidato')
    set('Notas','Se postuló por el formulario feb-2025. Tarifa declarada por él/ella.')
    return f })
  await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'RRHH!A:Z',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:filas}})
  console.log(`✓ ${filas.length} personas nuevas agregadas como "Candidato"`)
}
await new Promise(r=>setTimeout(r,1200))
const v=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'RRHH!A1:Z1'})
console.log(`\n✅ Columnas ahora: ${(v.data.values?.[0]||[]).filter(h=>txt(h)).join(' · ')}`)

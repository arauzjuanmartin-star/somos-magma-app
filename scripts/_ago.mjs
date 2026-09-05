import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { esJornada } from '../lib/acuerdos.js'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const s=google.sheets({version:'v4',auth})
const R=await s.spreadsheets.values.get({spreadsheetId:'1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc',range:'PROYECTOS!A:ET'})
const V=R.data.values, h=V[0]
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const fecha=v=>{const m=String(v??'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
console.log('  LUCHO — todo lo cargado en agosto 2026:')
let j=0
V.slice(1).forEach(r=>{ const f=fecha(r[3]); if(!f||f.getMonth()!==7||f.getFullYear()!==2026) return
  PED.forEach(i=>{ if(!/jorge\s*luis\s*chav/i.test(String(r[i+2]||''))) return
    const sv=String(r[i]||''); const cuenta=esJornada(sv); if(cuenta)j++
    console.log(`    ${cuenta?'jornada  ':'NO cuenta'}  ${String(r[3]).padEnd(11)} ${sv.padEnd(26)} ${String(r[i+1]||'').padStart(12)}  ${String(r[4]||r[5]).slice(0,22)}`) }) })
console.log(`\n  → ${j} jornadas`)

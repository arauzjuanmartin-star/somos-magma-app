import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const s=google.sheets({version:'v4',auth})
const R=await s.spreadsheets.values.get({spreadsheetId:'1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc',range:'PROYECTOS!A:ET'})
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const c={}
R.data.values.slice(1).forEach(r=>PED.forEach(i=>{const v=String(r[i+2]||'').trim()
  if(/lucho|chav|gugliot|cuglio|juani/i.test(v)) c[v]=(c[v]||0)+1 }))
console.log('  Cómo aparece escrito en PROYECTOS:')
Object.entries(c).sort((a,b)=>b[1]-a[1]).forEach(([n,x])=>console.log(`    ${String(x).padStart(4)}  "${n}"`))

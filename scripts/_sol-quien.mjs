import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['RRHH!A:Z']})
const V=R.data.valueRanges[0].values||[]
console.log('headers:',V[0].slice(0,12).join(' | '))
V.slice(1).forEach((r,i)=>{const s=r.join(' ');if(/\bsol\b|solci|soledad|sol[íi]/i.test(s))console.log(i+2, r.slice(0,10).join(' | '))})

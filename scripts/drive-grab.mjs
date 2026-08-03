// Baja/lista archivos de Drive con la cuenta de servicio (drive.readonly).
// Uso: node scripts/drive-grab.mjs list <folderId>
//      node scripts/drive-grab.mjs get  <fileId> <destPath>
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

// cargar .env.local a mano (sin dependencias)
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}

const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  undefined,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/drive.readonly']
);
const drive = google.drive({ version: 'v3', auth });

const [,, cmd, a, b] = process.argv;

if (cmd === 'list') {
  const res = await drive.files.list({
    q: `'${a}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,size,videoMediaMetadata(durationMillis,width,height))',
    pageSize: 200,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  for (const f of res.data.files) {
    const mb = f.size ? (f.size/1e6).toFixed(1)+'MB' : '';
    const dur = f.videoMediaMetadata?.durationMillis ? (f.videoMediaMetadata.durationMillis/1000).toFixed(0)+'s' : '';
    const dim = f.videoMediaMetadata ? `${f.videoMediaMetadata.width}x${f.videoMediaMetadata.height}` : '';
    console.log([f.id, f.mimeType.replace('application/','').replace('video/','vid/'), mb, dur, dim, f.name].filter(Boolean).join('  |  '));
  }
} else if (cmd === 'get') {
  const dest = path.resolve(b);
  const out = fs.createWriteStream(dest);
  const res = await drive.files.get(
    { fileId: a, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );
  await new Promise((resolve, reject) => {
    res.data.on('end', resolve).on('error', reject).pipe(out);
  });
  console.log('OK ->', dest, fs.statSync(dest).size, 'bytes');
} else {
  console.log('uso: list <folderId> | get <fileId> <destPath>');
}

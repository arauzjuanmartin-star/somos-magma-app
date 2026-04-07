import { getSheetsClient, SHEET_ID } from '../../lib/sheets';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Presupuestos!A1:Z500',
    });
    const rows = response.data.values || [];
    if (rows.length === 0) return res.status(200).json({ presupuestos: [] });
    const headers = rows[0];
    const presupuestos = rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((header, i) => { obj[header] = row[i] || ''; });
      return obj;
    });
    return res.status(200).json({ presupuestos });
  } catch (error) {
    console.error('Error leyendo Sheets:', error);
    return res.status(500).json({ error: 'Error conectando con Google Sheets' });
  }
}

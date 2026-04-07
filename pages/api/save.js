import { getSheetsClient, SHEET_ID } from '../../lib/sheets';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const sheets = await getSheetsClient();
    const data = req.body;
    const nuevaFila = [
      data.fecha || new Date().toLocaleDateString('es-AR'),
      data.cliente || '',
      data.proyecto || '',
      data.tipo || '',
      data.monto || '',
      data.estado || 'Pendiente',
      data.responsable || '',
      data.notas || '',
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Presupuestos!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [nuevaFila] },
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error guardando en Sheets:', error);
    return res.status(500).json({ error: 'Error guardando en Google Sheets' });
  }
}

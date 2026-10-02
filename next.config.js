/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // El aviso de la diaria lee los VEP del contador (PDF) con pdf-parse, que carga su motor (pdf.worker.mjs) por un
    // camino que Vercel no detecta solo: sin esto el archivo no viaja y la lectura falla en producción.
    outputFileTracingIncludes: { '/api/cron/**': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'] },
  },
}
module.exports = nextConfig

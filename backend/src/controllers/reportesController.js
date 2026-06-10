/**
 * CorteAlum — Reportes técnicos → PDF
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoint genérico que recibe el HTML ya armado de un reporte (consolidado o por
 * ventana) y lo convierte en un PDF real usando el MISMO motor Puppeteer que la
 * cotización (services/pdfRenderer). Antes estos reportes se descargaban como
 * archivos .html desde el navegador; ahora salen en PDF nítido, con los márgenes
 * y saltos de página definidos en el `@page`/`@media print` de cada plantilla.
 *
 * El renderer respeta el tamaño y márgenes del CSS `@page` (preferCSSPageSize),
 * así que NO se altera el diseño de las plantillas: solo cambia el contenedor
 * de salida (HTML → PDF).
 */

const { htmlToPDF } = require('../services/pdfRenderer');

// Límite defensivo de tamaño del HTML (el body global ya es 10mb; esto evita
// que un payload anómalo intente tumbar el render).
const MAX_HTML_BYTES = 9 * 1024 * 1024;

const renderPDF = async (req, res) => {
  try {
    const { html, filename } = req.body || {};

    if (!html || typeof html !== 'string' || html.length < 50) {
      return res.status(400).json({ error: 'HTML inválido o vacío para generar el PDF' });
    }
    if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
      return res.status(413).json({ error: 'El contenido del reporte es demasiado grande' });
    }

    // El motor respeta @page del CSS de la plantilla (size + margin), por eso
    // no forzamos formato ni márgenes aquí: cada reporte trae los suyos.
    const pdf = await htmlToPDF(html);

    // Nombre de archivo seguro (sin rutas ni caracteres raros).
    const safeName = String(filename || 'reporte')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
      .replace(/[^a-zA-Z0-9_\-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'reporte';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.end(pdf, 'binary');
  } catch (err) {
    console.error('[reportes/pdf]', err.message);
    return res.status(500).json({
      error: 'No se pudo generar el PDF del reporte',
      detalle: err.message,
    });
  }
};

module.exports = { renderPDF };

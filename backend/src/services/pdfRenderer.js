/**
 * CorteAlum — PDF Renderer
 * ─────────────────────────────────────────────────────────────────────────────
 * Genera un PDF a partir de un HTML usando Puppeteer.
 *
 * Diseño:
 *   - Browser singleton (evita levantar Chromium en cada request → ~3s ahorrados)
 *   - Reuso de browser, page nueva por request (aislamiento)
 *   - Manejo de timeouts y errores
 *   - Auto-recovery si el browser muere
 *
 * Variables de entorno opcionales:
 *   - PUPPETEER_EXECUTABLE_PATH  → ruta a Chrome/Chromium del sistema
 *   - PDF_FONT_TIMEOUT_MS        → ms para esperar que cargue Google Fonts (default 3000)
 */

const puppeteer = require('puppeteer');

let browserPromise = null;

async function getBrowser() {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      if (b && b.isConnected()) return b;
    } catch { /* fall through */ }
  }
  browserPromise = puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  });
  return browserPromise;
}

/**
 * Renderiza HTML → Buffer PDF.
 *
 * Si Puppeteer no está disponible (Chrome no instalado, sandbox bloqueado),
 * o si el buffer resultante está vacío/corrupto, LANZA un error claro para
 * que el caller pueda devolver 500 con detalle — en lugar de mandar al
 * navegador un blob inválido que dispara "Error al cargar el documento PDF".
 */
async function htmlToPDF(html, opts = {}) {
  const fontTimeout = parseInt(opts.fontTimeoutMs || process.env.PDF_FONT_TIMEOUT_MS || 800);

  if (!html || typeof html !== 'string' || html.length < 50) {
    throw new Error(`HTML inválido para PDF (longitud=${html?.length || 0})`);
  }

  let browser, page;
  try {
    browser = await getBrowser();
    if (!browser || !browser.isConnected()) {
      throw new Error('Puppeteer no pudo iniciar Chromium. Verifica la instalación del navegador.');
    }
    page = await browser.newPage();

    // Optimización: bloquear recursos no esenciales (imágenes externas, tracking)
    // El template usa CSS embebido + SVG inline, no necesita esperar nada externo.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      // Permitir: data:, about:, y fuentes de Google (necesarias para tipografía)
      // Bloquear: imágenes externas, analytics, etc. (no se usan en el PDF)
      if (url.startsWith('data:') || url.startsWith('about:')) return req.continue();
      const rt = req.resourceType();
      if (rt === 'image' && !url.startsWith('data:')) return req.abort();
      if (rt === 'media' || rt === 'websocket') return req.abort();
      req.continue();
    });

    // Capturar errores de página para detectar HTML inválido
    page.on('pageerror', (err) => {
      console.warn('[pdfRenderer page error]', err.message);
    });

    // CAMBIO CLAVE: domcontentloaded (no networkidle0).
    // networkidle0 espera 500ms de silencio de red DESPUÉS de la última
    // request — eso suma 2-4s por PDF. Con CSS+SVG embebidos, basta con
    // que el DOM esté listo. Las fuentes web se manejan abajo con timeout corto.
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Esperar a que las fuentes web estén listas (con timeout MUY corto:
    // si no llegaron en 800ms, usamos las del sistema y seguimos).
    try {
      await page.evaluate(async (timeout) => {
        if (document.fonts && document.fonts.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise(res => setTimeout(res, timeout)),
          ]);
        }
      }, fontTimeout);
    } catch { /* best effort */ }

    // Auto-ajuste de reportes de UNA sola hoja (marcados con .page.fit-one):
    // rellena el espacio en blanco si sobra, o encoge si el contenido se pasa.
    // Se ejecuta aquí (no en el HTML) para garantizar que corre tras cargar
    // las fuentes y antes de generar el PDF.
    try {
      await page.evaluate(() => {
        const pg = document.querySelector('.page.fit-one');
        if (!pg) return;
        document.body.style.zoom = '';
        pg.classList.remove('fill');
        pg.style.minHeight = '0px';
        const avail = 722;
        let h = Math.ceil(pg.getBoundingClientRect().height);
        let z = 1;
        if (h > avail) { z = Math.max(0.5, avail / h); document.body.style.zoom = String(z); }
        // Rellenar SIEMPRE: estira el contenido para llenar la hoja completa
        // (en el espacio ya escalado por el zoom), sin dejar blanco.
        pg.style.minHeight = (avail / z) + 'px';
        pg.classList.add('fill');
      });
    } catch { /* best effort */ }

    const pdfRaw = await page.pdf({
      format: opts.format || 'A4',
      printBackground: opts.printBackground !== false,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    // ── FIX BUG PLAN-PDF "no abre en el navegador" ────────────────────────
    // Puppeteer 22+ devuelve Uint8Array (no Buffer) desde page.pdf().
    // Express 4 res.send() chequea Buffer.isBuffer(chunk): para Uint8Array
    // da FALSE → cae a res.json() → serializa los bytes como
    // {"0":37,"1":80,...} con Content-Type application/json. El navegador
    // recibe JSON disfrazado de PDF y muestra "Error al cargar el documento".
    // Convertimos a Buffer real para que res.send/res.end lo traten como binario.
    const pdf = Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw);

    // Validación del buffer: un PDF válido empieza con "%PDF-" (bytes 0x25 0x50 0x44 0x46 0x2D).
    // Si el buffer está vacío, es muy corto, o no empieza con la firma → algo falló en Puppeteer
    // y devolverlo al cliente solo causa "Error al cargar el documento PDF" en el visor.
    if (!pdf || pdf.length < 100) {
      throw new Error(`PDF generado está vacío o corrupto (longitud=${pdf?.length || 0})`);
    }
    const firma = pdf.slice(0, 5).toString('ascii');
    if (firma !== '%PDF-') {
      throw new Error(`Buffer no es un PDF válido (firma="${firma}")`);
    }

    return pdf;
  } catch (err) {
    if (err.message && (err.message.includes('disconnected') || err.message.includes('Target closed'))) {
      try { const b = await browserPromise; if (b) await b.close(); } catch {}
      browserPromise = null;
    }
    // Reenvolvemos para que el log del backend siempre tenga contexto
    console.error('[pdfRenderer ERROR]', { message: err.message, htmlSize: html.length });
    throw err;
  } finally {
    if (page) {
      try { await page.close(); } catch {}
    }
  }
}

async function shutdown() {
  if (browserPromise) {
    try { const b = await browserPromise; if (b) await b.close(); } catch {}
    browserPromise = null;
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

module.exports = { htmlToPDF, shutdown };

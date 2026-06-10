/**
 * CorteAlum — Visualización SVG de una barra cortada
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderiza una barra de aluminio con sus cortes y sobrante.
 * 100% SVG, sin dependencias externas.
 *
 * Props:
 *   longitudTotalCm  número — longitud total de la barra
 *   cortes           [{ longitud_cm, etiqueta, ventana_label? }]
 *   kerfCm           espesor del corte (default 0.3)
 *   esResiduo        boolean — estilo distinto (borde naranja punteado)
 *   altura           altura en px del SVG (default 60)
 *   mostrarRegla     boolean — muestra regla 0..N en la base
 */

import { fmtCmAdapt } from '../../utils/unidades';

// Paleta estable por hash de etiqueta (mismo nombre = mismo color)
const PALETTE = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f43f5e','#84cc16'];
const colorDeEtiqueta = (etiqueta = '') => {
  let h = 0;
  for (const ch of String(etiqueta)) h = (h * 31 + ch.charCodeAt(0)) % PALETTE.length;
  return PALETTE[h];
};

export default function BarraCortada({
  longitudTotalCm = 600,
  cortes = [],
  kerfCm = 0.3,
  esResiduo = false,
  altura = 60,
  mostrarRegla = true,
}) {
  const W = 800, padX = 12;
  const H = altura + (mostrarRegla ? 24 : 0);
  const escalaX = (W - padX * 2) / longitudTotalCm;

  // Calcular cursor y sobrante
  let cursor = padX;
  const cortesRender = [];
  let totalUsado = 0;

  for (let i = 0; i < cortes.length; i++) {
    const c = cortes[i];
    const long = parseFloat(c.longitud_cm) || 0;
    const w = long * escalaX;
    const color = colorDeEtiqueta(c.etiqueta || `c${i}`);
    cortesRender.push({ x: cursor, w, color, ...c, longitud_cm: long });
    cursor += w + kerfCm * escalaX;
    totalUsado += long + kerfCm;
  }
  totalUsado -= kerfCm; // sin kerf al final
  const sobrante = Math.max(0, longitudTotalCm - totalUsado);
  const sobranteW = sobrante * escalaX;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <pattern id="hatch-sobra" patternUnits="userSpaceOnUse" width="6" height="6">
          <rect width="6" height="6" fill="#fef3c7"/>
          <path d="M 0 6 L 6 0" stroke="#f59e0b" strokeWidth="1"/>
        </pattern>
      </defs>

      {/* Marco de la barra */}
      <rect
        x={padX} y={6} width={W - padX * 2} height={altura}
        fill="#f1f5f9"
        stroke={esResiduo ? '#f59e0b' : '#0f2942'}
        strokeWidth={esResiduo ? 2.5 : 2}
        strokeDasharray={esResiduo ? '6 3' : 'none'}
        rx={4}
      />

      {/* Cortes */}
      {cortesRender.map((c, i) => (
        <g key={i}>
          <rect
            x={c.x} y={6} width={c.w} height={altura}
            fill={c.color} opacity={0.88}
          />
          <line
            x1={c.x + c.w} y1={6} x2={c.x + c.w} y2={6 + altura}
            stroke="#0f2942" strokeWidth="1.4"
          />
          {/* Etiquetas (solo si hay espacio) */}
          {c.w > 50 && (
            <>
              <text
                x={c.x + c.w / 2} y={6 + altura / 2 - 4}
                fill="#fff" fontSize="10.5" fontWeight="800"
                textAnchor="middle"
              >
                {c.etiqueta || `Corte ${i + 1}`}
              </text>
              <text
                x={c.x + c.w / 2} y={6 + altura / 2 + 11}
                fill="#fff" fontSize="9.5" textAnchor="middle"
                opacity="0.95"
              >
                {fmtCmAdapt(c.longitud_cm)} cm
                {c.ventana_label ? ` · ${c.ventana_label}` : ''}
              </text>
            </>
          )}
          {c.w <= 50 && c.w > 18 && (
            <text
              x={c.x + c.w / 2} y={6 + altura / 2 + 3}
              fill="#fff" fontSize="9" textAnchor="middle" fontWeight="700"
            >
              {fmtCmAdapt(c.longitud_cm, 0)}
            </text>
          )}
        </g>
      ))}

      {/* Sobrante */}
      {sobrante > 0.5 && (
        <g>
          <rect
            x={cursor} y={6} width={sobranteW} height={altura}
            fill="url(#hatch-sobra)"
          />
          {sobranteW > 50 && (
            <text
              x={cursor + sobranteW / 2} y={6 + altura / 2 + 4}
              fill="#92400e" fontSize="10.5" fontWeight="800"
              textAnchor="middle"
            >
              sobra {fmtCmAdapt(sobrante)} cm
            </text>
          )}
        </g>
      )}

      {/* Regla inferior */}
      {mostrarRegla && (
        <g>
          <line
            x1={padX} y1={altura + 14} x2={W - padX} y2={altura + 14}
            stroke="#94a3b8" strokeWidth="1"
          />
          {/* Marcas cada 100cm */}
          {Array.from({ length: Math.floor(longitudTotalCm / 100) + 1 }, (_, i) => {
            const cm = i * 100;
            const x = padX + cm * escalaX;
            return (
              <g key={cm}>
                <line x1={x} y1={altura + 11} x2={x} y2={altura + 17}
                      stroke="#94a3b8" strokeWidth="1"/>
                <text x={x} y={altura + 24} fontSize="8" fill="#64748b" textAnchor="middle">
                  {cm}
                </text>
              </g>
            );
          })}
          <text x={W - padX} y={altura + 24} fontSize="8" fill="#64748b" textAnchor="end" fontWeight="700">
            {longitudTotalCm} cm
          </text>
        </g>
      )}
    </svg>
  );
}

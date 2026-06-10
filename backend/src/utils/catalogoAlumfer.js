/**
 * catalogoAlumfer.js
 *
 * Catálogo Alumfer Feb 2026 portado del frontend (CotizacionModal.jsx).
 *
 * Mapea (UBICACION + id_perfil + id_sistema) → { ref: 'ALNA XXX', precios por color }
 *
 * IMPORTANCIA CRÍTICA (regla del instructor Marcel):
 * La referencia ALN identifica una EXTRUSIÓN FÍSICA concreta. Dos perfiles
 * con la misma ALN son LA MISMA BARRA físicamente, aunque pertenezcan a
 * "sistemas" distintos en la BD. Por ejemplo:
 *
 *   CABEZAL-1-1 (744 Tradicional)        → ALNA 392
 *   CABEZAL-2-3 (Híbrida 5020 marco 744) → ALNA 392
 *   ↑ MISMA barra de aluminio, mismo precio, mismo proveedor.
 *
 * Por eso el optimizador debe agrupar por referencia ALN (no por id_perfil)
 * para que cortes que físicamente pueden compartir barra, la compartan. Y
 * por eso los residuos también se buscan por ALN, no por id_perfil.
 *
 * Convención de claves:
 *   `${UBICACION}-${id_perfil}-${id_sistema}`
 *   id_perfil:  1=744, 2=5020, 3=8025
 *   id_sistema: 1=Tradicional, 2=Línea90, 3=Híbrida
 */

const CATALOGO = {
  // SISTEMA 50-20 TRADICIONAL (perfil 2, sistema 1)
  'CABEZAL-2-1':        { ref:'ALNA 144', Natural:71400,  Champagne:74400,  Anolock:73200,  Blanco:55200,  Negro:null   },
  'TRASLAPE-2-1':       { ref:'ALNA 192', Natural:34200,  Champagne:48000,  Anolock:46800,  Blanco:34200,  Negro:null   },
  'JAMBA-2-1':          { ref:'ALNA 193', Natural:70200,  Champagne:72600,  Anolock:72000,  Blanco:70800,  Negro:null   },
  'SILLAR-2-1':         { ref:'ALNA 194', Natural:77400,  Champagne:79800,  Anolock:79200,  Blanco:63000,  Negro:null   },
  'HORIZONTAL INF-2-1': { ref:'ALNA 349', Natural:72000,  Champagne:74400,  Anolock:73800,  Blanco:72600,  Negro:null   },
  'ENGANCHE-2-1':       { ref:'ALNB 147', Natural:60600,  Champagne:63000,  Anolock:62400,  Blanco:50400,  Negro:null   },

  // SISTEMA 50-20 HIBRIDA con MARCO 7-44 (perfil 2, sistema 3)
  // "Hibrida" = MARCO del 744 (cabezal, sillar, jamba) + NAVE MÓVIL del 5020
  // (traslape, enganche, horizontales). Por eso CABEZAL, SILLAR y JAMBA usan
  // las MISMAS referencias ALN que el sistema 744 — son físicamente la misma
  // extrusión. Solo las piezas de nave móvil son específicas de Hibrida.
  'ENGANCHE-2-3':       { ref:'ALN 634',  Natural:58200,  Champagne:null,   Anolock:null,   Blanco:73200,  Negro:null   },
  'TRASLAPE-2-3':       { ref:'ALN 632',  Natural:95400,  Champagne:null,   Anolock:null,   Blanco:78000,  Negro:null   },
  'JAMBA-2-3':          { ref:'ALNB 393', Natural:66000,  Champagne:69000,  Anolock:69000,  Blanco:66000,  Negro:69000  },
  'CABEZAL-2-3':        { ref:'ALNA 392', Natural:81000,  Champagne:84000,  Anolock:84000,  Blanco:81000,  Negro:84000  },
  'SILLAR-2-3':         { ref:'ALNA 387', Natural:76800,  Champagne:79800,  Anolock:79800,  Blanco:76800,  Negro:79800  },
  'HORIZONTAL INF-2-3': { ref:'ALNA 349', Natural:72000,  Champagne:74400,  Anolock:73800,  Blanco:72600,  Negro:null   },

  // SISTEMA 744 TRADICIONAL (perfil 1, sistema 1)
  'ADAPTADOR-1-1':      { ref:'ALN 403',  Natural:36600,  Champagne:38400,  Anolock:38400,  Blanco:36600,  Negro:38400  },
  'SILLAR-1-1':         { ref:'ALNA 387', Natural:76800,  Champagne:79800,  Anolock:79800,  Blanco:76800,  Negro:79800  },
  'TRASLAPE-1-1':       { ref:'ALNA 388', Natural:76800,  Champagne:79800,  Anolock:79800,  Blanco:76800,  Negro:79800  },
  'HORIZONTAL SUP-1-1': { ref:'ALNA 389', Natural:53400,  Champagne:55800,  Anolock:55800,  Blanco:53400,  Negro:55800  },
  'ENGANCHE-1-1':       { ref:'ALNA 391', Natural:69000,  Champagne:72000,  Anolock:72000,  Blanco:69000,  Negro:72000  },
  'CABEZAL-1-1':        { ref:'ALNA 392', Natural:81000,  Champagne:84000,  Anolock:84000,  Blanco:81000,  Negro:84000  },
  'HORIZONTAL INF-1-1': { ref:'ALNB 390', Natural:68400,  Champagne:71400,  Anolock:71400,  Blanco:68400,  Negro:71400  },
  'JAMBA-1-1':          { ref:'ALNB 393', Natural:66000,  Champagne:69000,  Anolock:69000,  Blanco:66000,  Negro:69000  },

  // SISTEMA 744 LINEA 90 (perfil 1, sistema 2)
  'TRASLAPE-1-2':       { ref:'ALN 1766', Natural:62400,  Champagne:78600,  Anolock:78600,  Blanco:75600,  Negro:78600  },
  'ENGANCHE-1-2':       { ref:'ALN 1767', Natural:67200,  Champagne:84000,  Anolock:84000,  Blanco:80400,  Negro:84000  },
  'ADAPTADOR-1-2':      { ref:'ALN 1785', Natural:58200,  Champagne:null,   Anolock:null,   Blanco:null,   Negro:null   },

  // SISTEMA 8025 TRADICIONAL (perfil 3, sistema 1)
  'HORIZONTAL SUP-3-1': { ref:'ALN 156',  Natural:83400,  Champagne:108000, Anolock:106800, Blanco:105000, Negro:107400 },
  'ADAPTADOR-3-1':      { ref:'ALN 158',  Natural:45600,  Champagne:48000,  Anolock:null,   Blanco:46200,  Negro:47400  },
  'TRASLAPE-3-1':       { ref:'ALN 190',  Natural:94200,  Champagne:131000, Anolock:118200, Blanco:126400, Negro:130200 },
  'SILLAR-3-1':         { ref:'ALNA 150', Natural:115800, Champagne:120000, Anolock:118800, Blanco:116400, Negro:119400 },
  'CABEZAL-3-1':        { ref:'ALNA 151', Natural:116400, Champagne:120600, Anolock:108000, Blanco:117000, Negro:120000 },
  'HORIZONTAL INF-3-1': { ref:'ALNA 157', Natural:102000, Champagne:140400, Anolock:139200, Blanco:136200, Negro:139800 },
  'ENGANCHE-3-1':       { ref:'ALNA 191', Natural:97800,  Champagne:129600, Anolock:114000, Blanco:118800, Negro:121800 },
  'JAMBA-3-1':          { ref:'ALNA 841', Natural:112200, Champagne:116400, Anolock:107400, Blanco:116400, Negro:115800 },

  // SISTEMA 8025 LINEA 90 (perfil 3, sistema 2)
  'ENGANCHE-3-2':       { ref:'ALN 631',  Natural:150000, Champagne:154800, Anolock:153600, Blanco:153600, Negro:153000 },
  'TRASLAPE-3-2':       { ref:'ALN 633',  Natural:100200, Champagne:136800, Anolock:132600, Blanco:100200, Negro:92400  },
  'ADAPTADOR-3-2':      { ref:'ALN 827',  Natural:60000,  Champagne:null,   Anolock:64200,  Blanco:null,   Negro:null   },
  'HORIZONTAL SUP-3-2': { ref:'ALN 874',  Natural:78000,  Champagne:105000, Anolock:103800, Blanco:78000,  Negro:104400 },
  'HORIZONTAL INF-3-2': { ref:'ALN 875',  Natural:142800, Champagne:147600, Anolock:146400, Blanco:97200,  Negro:100200 },
};

/**
 * Busca en el catálogo por (ubicacion + id_perfil + id_sistema).
 * Fallback: prueba con sistema 1, luego 2, luego 3 (por si el dato real
 * tiene un sistema distinto pero la pieza es la misma).
 */
function buscarEnCatalogo(ubicacion, id_perfil, id_sistema) {
  if (!ubicacion || !id_perfil) return null;
  const n = String(ubicacion).trim().toUpperCase()
    .replace('HORIZONTAL SUPERIOR', 'HORIZONTAL SUP')
    .replace('HORIZONTAL INFERIOR', 'HORIZONTAL INF');

  return CATALOGO[`${n}-${id_perfil}-${id_sistema}`]
      || CATALOGO[`${n}-${id_perfil}-1`]
      || CATALOGO[`${n}-${id_perfil}-2`]
      || CATALOGO[`${n}-${id_perfil}-3`]
      || null;
}

/**
 * Solo la referencia ALN (string corto). Si no se encuentra, devuelve null.
 */
function obtenerReferenciaAln(ubicacion, id_perfil, id_sistema) {
  const entry = buscarEnCatalogo(ubicacion, id_perfil, id_sistema);
  return entry ? entry.ref : null;
}

/**
 * Precio por barra de 6m según ubicación, perfil, sistema y color.
 * Devuelve null si no se encuentra (el caller puede caer a la BD de materiales).
 */
function obtenerPrecioBarra(ubicacion, id_perfil, id_sistema, color) {
  const entry = buscarEnCatalogo(ubicacion, id_perfil, id_sistema);
  if (!entry) return null;
  const c = String(color || 'Natural').trim();
  return entry[c] != null ? entry[c] : null;
}

module.exports = {
  CATALOGO,
  buscarEnCatalogo,
  obtenerReferenciaAln,
  obtenerPrecioBarra,
};

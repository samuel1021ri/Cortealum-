import axios from 'axios';

// En local usa el proxy de CRA ('/api' → localhost:5000).
// En producción (Vercel) se define REACT_APP_API_URL con la URL de Render,
// p. ej. https://cortealum-backend.onrender.com/api
const api = axios.create({ baseURL: process.env.REACT_APP_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── INTERCEPTOR GLOBAL DE CONFIRMACIÓN POR CONTRASEÑA ─────────────────────
// Cuando un DELETE devuelve PASSWORD_REQUIRED (porque el middleware
// requirePassword del backend lo exige), abrimos un modal global pidiendo
// la contraseña, y reintentamos automáticamente la petición.
//
// IMPORTANTE: si el usuario escribe MAL la contraseña (401 PASSWORD_MISMATCH),
// el modal debe volver a abrirse para permitir un nuevo intento, en lugar
// de fallar silenciosamente.
//
// El modal global se monta una sola vez en App.jsx con un dispatcher.
let passwordResolver = null;
export function showGlobalPasswordPrompt(detalle, errorMsg) {
  return new Promise((resolve) => {
    passwordResolver = resolve;
    // Disparar evento global que el modal escucha
    window.dispatchEvent(new CustomEvent('global-password-prompt', {
      detail: { detalle, errorMsg }
    }));
  });
}
export function resolveGlobalPasswordPrompt(password) {
  if (passwordResolver) {
    passwordResolver(password);
    passwordResolver = null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    // 401 que NO sea PASSWORD_MISMATCH → sesión expirada
    if (err.response?.status === 401 && err.response?.data?.code !== 'PASSWORD_MISMATCH') {
      localStorage.clear();
      window.location.href = '/login';
      return Promise.reject(err);
    }

    // 400 PASSWORD_REQUIRED → primer intento (no se envió contraseña)
    // 401 PASSWORD_MISMATCH → reintento (contraseña incorrecta)
    const code = err.response?.data?.code;
    const status = err.response?.status;

    // BUG FIX: si la petición YA trae contraseña en el body, significa que un
    // modal local (ConfirmDeleteModal) está manejando la confirmación. En ese
    // caso NO interceptamos — dejamos que el error suba al modal, que muestra
    // "contraseña incorrecta" y permite reintentar con la nueva clave en el body.
    // Antes, el interceptor global se metía encima (doble modal) y el reintento
    // se enredaba: metías la mala, luego la buena, y seguía dando error.
    let bodyTienePassword = false;
    try {
      const d = typeof err.config?.data === 'string' ? JSON.parse(err.config.data) : err.config?.data;
      bodyTienePassword = !!(d && typeof d === 'object' && 'password' in d);
    } catch { /* body no-JSON → no aplica */ }

    const necesitaPassword =
      !bodyTienePassword &&
      ((status === 400 && code === 'PASSWORD_REQUIRED') ||
       (status === 401 && code === 'PASSWORD_MISMATCH'));

    if (necesitaPassword && err.config && !err.config.__passwordAbort) {
      try {
        // Si vino PASSWORD_MISMATCH, mostrar el error inline; si vino REQUIRED,
        // solo el detalle informativo. El modal usa esto para feedback claro.
        const errorMsg = code === 'PASSWORD_MISMATCH'
          ? 'Contraseña incorrecta. Inténtalo de nuevo.'
          : null;
        const password = await showGlobalPasswordPrompt(
          err.response?.data?.detalle || null,
          errorMsg,
        );
        // Si el usuario canceló (password === null), abortar definitivamente.
        if (!password) {
          return Promise.reject({
            ...err,
            __cancelled: true,
            message: 'Acción cancelada por el usuario',
          });
        }
        // Reintentar con la contraseña actualizada.
        // BUG FIX: algunas eliminaciones (ej. ConfirmDeleteModal) mandan la
        // contraseña en el BODY ({ data:{ password } }), y el backend lee el
        // body con prioridad sobre el header. Si solo poníamos la nueva clave en
        // el header, el reintento seguía usando la clave VIEJA (mala) del body y
        // SIEMPRE decía "incorrecta". Por eso aquí actualizamos el body también.
        let retryData = err.config.data;
        try {
          if (typeof retryData === 'string' && retryData.includes('password')) {
            const obj = JSON.parse(retryData);
            if (obj && typeof obj === 'object' && 'password' in obj) {
              obj.password = password;
              retryData = JSON.stringify(obj);
            }
          } else if (retryData && typeof retryData === 'object' && 'password' in retryData) {
            retryData = { ...retryData, password };
          }
        } catch { /* si no se puede parsear, se usa el header */ }

        return api({
          ...err.config,
          data: retryData,
          __passwordRetry: true,
          headers: {
            ...(err.config.headers || {}),
            'x-confirm-password': password,
          },
        });
      } catch (e) {
        return Promise.reject(err);
      }
    }

    return Promise.reject(err);
  }
);

export default api;

// ── Descargar un reporte (HTML armado en el front) como PDF real ──────────────
// Manda el HTML al backend, que lo renderiza con Puppeteer (mismo motor de la
// cotización) y devuelve un PDF. Reemplaza la antigua descarga de archivos .html.
export async function descargarReportePdf(html, filename = 'reporte') {
  const { data } = await api.post(
    '/reportes/pdf',
    { html, filename },
    { responseType: 'blob' },
  );
  const blob = new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${String(filename).replace(/[^a-zA-Z0-9_-]+/g, '_') || 'reporte'}.pdf`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

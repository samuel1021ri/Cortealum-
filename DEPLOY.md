# 🚀 Deploy de CorteAlum — Backend en Render + Frontend en Vercel

Todo el código ya quedó preparado. Solo sigue estos pasos en orden.

---

## 0. Subir el repo a GitHub (una sola vez)

```bash
cd cortealum
git init
git add .
git commit -m "CorteAlum listo para deploy"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/cortealum.git
git push -u origin main
```

> El `.gitignore` ya excluye los `.env` (secretos) y `node_modules`. No los subas nunca.

---

## 1. Backend en Render

1. Entra a https://render.com → **New → Blueprint** → conecta el repo `cortealum`.
   Render detecta el `render.yaml` y crea el servicio `cortealum-backend` solo.
   *(Si prefieres manual: New → Web Service → Root Directory: `backend`,
   Build: `npm install && npx puppeteer browsers install chrome`, Start: `npm start`.)*

2. En **Environment** pega estos 3 valores (los demás ya vienen del blueprint):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | La URI de Supabase (Settings → Database → Connection string → URI). Usa la del **pooler** puerto `6543` si la directa falla. |
   | `JWT_SECRET` | Un texto largo y aleatorio (mínimo 32 caracteres) |
   | `FRONTEND_URL` | Por ahora `http://localhost:3000` — la cambias en el paso 3 |

3. Deploy. Cuando termine, copia la URL que te da Render, ej:
   `https://cortealum-backend.onrender.com`
   Ábrela en el navegador: debe responder `{"message":"CorteAlu API v1.0"}` ✅
   Las migraciones de la base corren solas al arrancar.

---

## 2. Frontend en Vercel

1. Entra a https://vercel.com → **Add New → Project** → importa el repo `cortealum`.
2. En la configuración del proyecto:
   - **Root Directory**: `frontend`  ← importante
   - Framework: Create React App (lo detecta solo)
3. En **Environment Variables** agrega:

   | Variable | Valor |
   |---|---|
   | `REACT_APP_API_URL` | `https://cortealum-backend.onrender.com/api` ← tu URL de Render **+ /api** |

4. Deploy. Copia la URL final, ej: `https://cortealum.vercel.app`

---

## 3. Cerrar el círculo (CORS)

Vuelve a Render → `cortealum-backend` → **Environment** → edita:

```
FRONTEND_URL=https://cortealum.vercel.app
```

(Se pueden poner varias separadas por coma: `https://cortealum.vercel.app,http://localhost:3000`)

Render redeploya solo. **Listo, ya funciona todo.** 🎉

---

## ⚠️ Cosas a saber

- **Plan free de Render**: el backend "se duerme" tras 15 min sin uso; la primera
  petición tarda ~50 seg en despertar. Es normal.
- **Fotos de materiales**: el disco de Render es efímero — las imágenes subidas a
  `/uploads` se borran en cada redeploy. Para la demo está bien; si las necesitas
  permanentes, lo ideal es moverlas a Supabase Storage (avísame y lo hago).
- **PDFs**: Chrome se instala en el build (`npx puppeteer browsers install chrome`),
  ya queda configurado en el `render.yaml`. Si un PDF da error 500 la primera vez,
  revisa los logs de Render — casi siempre es que el servicio estaba despertando.
- **Cambios futuros**: cada `git push` a `main` redeploya automático en ambos lados.

## Qué se modificó en el código para esto

- `frontend/src/api/client.js`: la URL del API ahora sale de `REACT_APP_API_URL`
  (en local sigue usando el proxy como siempre).
- `backend/src/index.js`: CORS acepta varias URLs separadas por coma, y helmet deja
  pasar las imágenes de `/uploads` entre dominios.
- Nuevos archivos: `render.yaml`, `frontend/vercel.json`,
  `frontend/.env.production.example`, `.gitignore`.

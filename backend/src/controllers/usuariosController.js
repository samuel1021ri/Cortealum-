const pool    = require('../config/db');
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const XLSX    = require('xlsx');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

async function auditar(accion, id_usuario_obj, realizado_por, detalle = null, cantidad = null, errores = null) {
  try {
    await pool.query(
      `INSERT INTO auditoria_usuarios (accion, id_usuario_obj, realizado_por, detalle, cantidad, errores)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [accion, id_usuario_obj || null, realizado_por || null, detalle, cantidad, errores]
    );
  } catch (_) {}
}

// LISTAR con filtros, búsqueda y paginación
const listar = async (req, res) => {
  try {
    const { search = '', estado = '', rol = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conds  = [];

    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conds.push(`(u.nombre_completo ILIKE $${n} OR u.nombre_usuario ILIKE $${n} OR u.correo_electronico ILIKE $${n} OR COALESCE(u.telefono,'') ILIKE $${n} OR COALESCE(u.documento,'') ILIKE $${n})`);
    }
    if (estado) { params.push(estado); conds.push(`u.estado = $${params.length}`); }
    if (rol)    { params.push(`%${rol}%`); conds.push(`r.nombre ILIKE $${params.length}`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const countParams = [...params];
    params.push(parseInt(limit)); params.push(offset);

    const { rows } = await pool.query(
      `SELECT u.id_usuario, u.nombre_completo, u.nombre_usuario, u.correo_electronico,
              u.telefono, u.documento, u.estado, u.avatar_color, u.avatar_letra, u.avatar_url,
              u.id_rol, u.primer_ingreso, u.fecha_creacion, u.fecha_edicion,
              r.nombre AS rol,
              c.nombre_completo AS creado_por_nombre,
              e.nombre_completo AS editado_por_nombre
       FROM usuarios u
       JOIN roles r ON u.id_rol = r.id_rol
       LEFT JOIN usuarios c ON u.creado_por  = c.id_usuario
       LEFT JOIN usuarios e ON u.editado_por = e.id_usuario
       ${where}
       ORDER BY u.fecha_creacion DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM usuarios u JOIN roles r ON u.id_rol=r.id_rol ${where}`,
      countParams
    );

    res.json({ data: rows, total: parseInt(countRows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[listar usuarios]', err.message);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
};

// CREAR
const crear = async (req, res) => {
  const { nombre_completo, nombre_usuario, correo_electronico, telefono, documento, contrasena, contraseña, id_rol } = req.body;
  const pass = contraseña || contrasena;
  if (!nombre_completo || !nombre_usuario || !correo_electronico || !pass || !id_rol)
    return res.status(400).json({ error: 'nombre_completo, nombre_usuario, correo, contraseña e id_rol son requeridos' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo_electronico))
    return res.status(400).json({ error: 'Correo electrónico inválido' });
  try {
    const hash = await bcrypt.hash(pass, 10);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre_completo, nombre_usuario, correo_electronico, telefono, documento, contraseña, id_rol, estado, primer_ingreso, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'activo',TRUE,$8) RETURNING id_usuario`,
      [nombre_completo, nombre_usuario.toLowerCase().trim(), correo_electronico.toLowerCase().trim(),
       telefono||null, documento||null, hash, id_rol, req.user.id]
    );
    await auditar('crear', rows[0].id_usuario, req.user.id, `Creado: ${nombre_completo}`);
    res.status(201).json({ id_usuario: rows[0].id_usuario, message: 'Usuario creado exitosamente' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'El usuario, correo o documento ya existe' });
    console.error('[crear usuario]', err.message);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
};

// ACTUALIZAR
const actualizar = async (req, res) => {
  const { id } = req.params;
  const { nombre_completo, correo_electronico, telefono, documento, id_rol, contrasena, contraseña } = req.body;
  const pass = contraseña || contrasena;
  try {
    if (pass && pass.trim().length < 6)
      return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });
    const sets = []; const vals = [];
    const add = (col, val) => { vals.push(val); sets.push(`${col}=$${vals.length}`); };
    if (nombre_completo !== undefined)    add('nombre_completo', nombre_completo);
    if (correo_electronico !== undefined) add('correo_electronico', correo_electronico.toLowerCase().trim());
    if (telefono !== undefined)           add('telefono', telefono || null);
    if (documento !== undefined)          add('documento', documento || null);
    if (id_rol !== undefined)             add('id_rol', id_rol);
    if (pass && pass.trim())              add('contraseña', await bcrypt.hash(pass.trim(), 10));
    add('editado_por', req.user.id);
    add('fecha_edicion', new Date());
    vals.push(id);
    await pool.query(`UPDATE usuarios SET ${sets.join(',')} WHERE id_usuario=$${vals.length}`, vals);
    await auditar('editar', parseInt(id), req.user.id, `Editado por ${req.user.nombre}`);
    res.json({ message: 'Usuario actualizado' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'El correo o documento ya existe en otro usuario' });
    console.error('[actualizar usuario]', err.message);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

// TOGGLE activo/inactivo (retrocompatible)
const toggleEstado = async (req, res) => {
  const { id } = req.params;
  try {
    if (parseInt(id) === req.user.id)
      return res.status(400).json({ error: 'No puedes cambiar tu propio estado' });
    const { rows } = await pool.query('SELECT estado FROM usuarios WHERE id_usuario=$1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const nuevo = rows[0].estado === 'activo' ? 'inactivo' : 'activo';
    await pool.query('UPDATE usuarios SET estado=$1, editado_por=$2, fecha_edicion=NOW() WHERE id_usuario=$3', [nuevo, req.user.id, id]);
    await auditar('cambiar_estado', parseInt(id), req.user.id, `Toggle → ${nuevo}`);
    res.json({ ok: true, estado: nuevo });
  } catch (err) {
    console.error('[toggleEstado]', err.message);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
};

// CAMBIAR ESTADO directo (activo/inactivo)
const cambiarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  if (!['activo','inactivo'].includes(estado))
    return res.status(400).json({ error: 'Estado inválido. Valores: activo, inactivo' });
  try {
    if (parseInt(id) === req.user.id && estado === 'inactivo')
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
    await pool.query('UPDATE usuarios SET estado=$1, editado_por=$2, fecha_edicion=NOW() WHERE id_usuario=$3', [estado, req.user.id, id]);
    await auditar('cambiar_estado', parseInt(id), req.user.id, `Estado → ${estado}`);
    res.json({ ok: true, estado });
  } catch (err) {
    console.error('[cambiarEstado]', err.message);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
};

// ELIMINAR
const eliminar = async (req, res) => {
  const { id } = req.params;
  try {
    if (parseInt(id) === req.user.id)
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });

    const { rows: usr } = await pool.query(
      `SELECT u.nombre_completo, r.nombre as rol FROM usuarios u JOIN roles r ON u.id_rol=r.id_rol WHERE u.id_usuario=$1`, [id]
    );
    if (!usr.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (usr[0].rol === 'Administrador') {
      const { rows: adm } = await pool.query(
        `SELECT COUNT(*) FROM usuarios u JOIN roles r ON u.id_rol=r.id_rol WHERE r.nombre='Administrador' AND u.estado='activo'`
      );
      if (parseInt(adm[0].count) <= 1)
        return res.status(400).json({ error: 'No puedes eliminar el último administrador activo' });
    }

    const { rows: proy } = await pool.query('SELECT 1 FROM proyectos WHERE id_usuario_creador=$1 LIMIT 1', [id]);
    if (proy.length > 0) {
      await pool.query('UPDATE usuarios SET estado=$1, editado_por=$2, fecha_edicion=NOW() WHERE id_usuario=$3', ['inactivo', req.user.id, id]);
      await auditar('eliminar', parseInt(id), req.user.id, `Desactivado (tiene proyectos): ${usr[0].nombre_completo}`);
      return res.json({ ok: true, accion: 'desactivado', message: `"${usr[0].nombre_completo}" tiene proyectos asociados, así que no se puede borrar físicamente (se perdería el historial). Se desactivó en su lugar.` });
    }

    // FIX v47: el usuario puede estar referenciado por OTRAS tablas además de
    // proyectos (residuos creados, auditoría, cotizaciones, historial, etc.).
    // Antes solo chequeábamos `proyectos`, así que un DELETE con esas otras FK
    // explotaba con error 23503 → 500 genérico "Error al eliminar usuario", y
    // el usuario quedaba sin poder borrar ni entender por qué. Ahora, si el
    // DELETE falla por una FK, caemos a desactivación con un mensaje claro.
    try {
      await pool.query('DELETE FROM usuarios WHERE id_usuario=$1', [id]);
      await auditar('eliminar', null, req.user.id, `Eliminado: ${usr[0].nombre_completo}`);
      res.json({ ok: true, accion: 'eliminado', message: 'Usuario eliminado' });
    } catch (errDel) {
      if (errDel.code === '23503') {
        // Foreign key violation: tiene registros vinculados en otra tabla.
        await pool.query('UPDATE usuarios SET estado=$1, editado_por=$2, fecha_edicion=NOW() WHERE id_usuario=$3', ['inactivo', req.user.id, id]);
        await auditar('eliminar', parseInt(id), req.user.id, `Desactivado (FK ${errDel.constraint || ''}): ${usr[0].nombre_completo}`);
        return res.json({
          ok: true,
          accion: 'desactivado',
          message: `"${usr[0].nombre_completo}" tiene registros vinculados en el sistema (residuos, cotizaciones o historial), así que no se puede borrar físicamente sin romper esos datos. Se desactivó en su lugar.`,
        });
      }
      throw errDel;
    }
  } catch (err) {
    console.error('[eliminar usuario]', err.message);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
};

// ACCIÓN MASIVA
const accionMasiva = async (req, res) => {
  const { action, ids } = req.body;
  const acciones = ['activate','deactivate','retired','delete'];
  if (!action || !acciones.includes(action))
    return res.status(400).json({ error: `Acción inválida. Válidas: ${acciones.join(', ')}` });
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ error: 'ids[] requerido' });

  // FIX v47: el borrado masivo es destructivo igual que el individual, así que
  // debe exigir contraseña. Antes la ruta /usuarios/bulk-action NO pasaba por
  // requirePassword (a diferencia de DELETE /usuarios/:id), entonces se podían
  // eliminar usuarios en lote SIN confirmar identidad. Verificamos la
  // contraseña aquí, pero SOLO para 'delete' (activar/desactivar no la piden,
  // para no entorpecer esas operaciones no destructivas).
  if (action === 'delete') {
    const password = (req.body && req.body.password) || req.headers['x-confirm-password'] || null;
    if (!password) {
      return res.status(400).json({ error: 'Confirmación requerida', code: 'PASSWORD_REQUIRED', detalle: 'El borrado masivo es destructivo. Reenvía tu contraseña en el campo "password".' });
    }
    try {
      const { rows } = await pool.query('SELECT "contraseña" AS hash FROM usuarios WHERE id_usuario=$1', [req.user.id]);
      const hash = rows[0]?.hash;
      let ok = false;
      if (typeof hash === 'string' && hash.startsWith('$2')) ok = await bcrypt.compare(String(password), String(hash));
      else ok = hash != null && String(password) === String(hash);
      if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta', code: 'PASSWORD_MISMATCH' });
    } catch (e) {
      return res.status(500).json({ error: 'Error al verificar contraseña: ' + e.message });
    }
    if (req.body && req.body.password) delete req.body.password;
  }

  const idsLimpios = ids.map(Number).filter(id => id !== req.user.id);
  if (idsLimpios.length === 0)
    return res.status(400).json({ error: 'No puedes aplicar acciones masivas a tu propia cuenta' });

  const resultado = { procesados: 0, exitosos: 0, errores: 0, detalle: [] };

  for (const id of idsLimpios) {
    resultado.procesados++;
    try {
      if (action === 'activate') {
        await pool.query('UPDATE usuarios SET estado=$1,editado_por=$2,fecha_edicion=NOW() WHERE id_usuario=$3',['activo',req.user.id,id]);
        resultado.exitosos++;
      } else if (action === 'deactivate') {
        await pool.query('UPDATE usuarios SET estado=$1,editado_por=$2,fecha_edicion=NOW() WHERE id_usuario=$3',['inactivo',req.user.id,id]);
        resultado.exitosos++;
      } else if (action === 'retired') {
        await pool.query('UPDATE usuarios SET estado=$1,editado_por=$2,fecha_edicion=NOW() WHERE id_usuario=$3',['inactivo',req.user.id,id]);
        resultado.exitosos++;
      } else if (action === 'delete') {
        const { rows: usr } = await pool.query(`SELECT r.nombre as rol FROM usuarios u JOIN roles r ON u.id_rol=r.id_rol WHERE u.id_usuario=$1`,[id]);
        if (usr[0]?.rol === 'Administrador') {
          const { rows: adm } = await pool.query(`SELECT COUNT(*) FROM usuarios u JOIN roles r ON u.id_rol=r.id_rol WHERE r.nombre='Administrador' AND u.estado='activo'`);
          if (parseInt(adm[0].count) <= 1) {
            resultado.errores++; resultado.detalle.push({ id, error: 'Último admin — omitido' }); continue;
          }
        }
        const { rows: proy } = await pool.query('SELECT 1 FROM proyectos WHERE id_usuario_creador=$1 LIMIT 1',[id]);
        if (proy.length > 0) {
          await pool.query('UPDATE usuarios SET estado=$1,editado_por=$2,fecha_edicion=NOW() WHERE id_usuario=$3',['inactivo',req.user.id,id]);
          resultado.detalle.push({ id, nota: 'Tenía proyectos → desactivado' });
        } else {
          // FIX v47: misma protección FK que el borrado individual.
          try {
            await pool.query('DELETE FROM usuarios WHERE id_usuario=$1',[id]);
          } catch (errDel) {
            if (errDel.code === '23503') {
              await pool.query('UPDATE usuarios SET estado=$1,editado_por=$2,fecha_edicion=NOW() WHERE id_usuario=$3',['inactivo',req.user.id,id]);
              resultado.detalle.push({ id, nota: 'Tenía registros vinculados → desactivado' });
            } else throw errDel;
          }
        }
        resultado.exitosos++;
      }
    } catch (err) {
      resultado.errores++;
      resultado.detalle.push({ id, error: err.message });
    }
  }

  await auditar('bulk_action', null, req.user.id,
    `Masivo: ${action} — ${resultado.exitosos} ok, ${resultado.errores} errores`,
    resultado.exitosos, resultado.errores
  );
  res.json({ ok: true, ...resultado });
};

// IMPORTAR EXCEL/CSV
const importar = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  let aoa = [];
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // Leer como matriz cruda (array de arrays) para detectar la fila de headers
    aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  } catch { return res.status(400).json({ error: 'Archivo inválido o corrupto' }); }

  if (aoa.length === 0) return res.status(400).json({ error: 'Archivo vacío' });

  // FIX raíz (clarificado por el usuario "no me coge el Excel"):
  // La plantilla puede tener filas de adorno antes de los headers reales:
  //   Fila 1: "PLANTILLA DE IMPORTACIÓN DE USUARIOS"  ← título
  //   Fila 2: "Completa los campos..."                 ← subtítulo
  //   Fila 3: "nombre *" | "apellido *" | "correo *"  ← HEADERS REALES
  //   Fila 4: "Nombre" | "Apellido" | "Correo elec."  ← etiquetas humanas
  //   Fila 5+: datos
  // Antes asumíamos que la fila 1 era el header → todo se rompía.
  // Ahora buscamos la primera fila que contenga al menos 2 palabras clave
  // de las columnas que esperamos (nombre, correo, etc.).
  const normKey = (s) => String(s || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quitar acentos
    .replace(/\*/g, '')                                 // quitar asterisco "nombre *" → "nombre"
    .replace(/[\s_\-\/]+/g, '');                        // quitar espacios, guiones, slashes

  const palabrasClave = ['nombre','nombres','correo','email','mail','apellido','documento','cedula'];
  const esFilaHeader = (fila) => {
    if (!Array.isArray(fila) || fila.length < 2) return false;
    const normalizadas = fila.map(normKey).filter(Boolean);
    const matches = normalizadas.filter(n => palabrasClave.some(p => n.includes(p)));
    return matches.length >= 2;   // al menos 2 columnas reconocidas
  };

  let headerIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    if (esFilaHeader(aoa[i])) { headerIdx = i; break; }
  }
  if (headerIdx === -1) {
    return res.status(400).json({
      error: 'No se encontraron las columnas obligatorias en el archivo. ' +
             'Asegúrate de que tenga al menos las columnas "nombre" y "correo" en alguna fila.',
    });
  }

  const headers = aoa[headerIdx].map(normKey);
  const dataRows = aoa.slice(headerIdx + 1)
    .filter(r => Array.isArray(r) && r.some(c => String(c || '').trim()))
    // FIX v43: ignorar filas que solo tienen UNA columna con contenido —
    // típicamente son texto descriptivo de la plantilla ("CONTRASEÑA INICIAL",
    // "Si se proporciona documento...", "ROLES DISPONIBLES..."). Estas filas
    // tienen contenido en la columna A pero el resto vacío. Una fila de usuario
    // válida tiene mínimo nombre + correo = 2 columnas con datos.
    .filter(r => r.filter(c => String(c || '').trim()).length >= 2);

  if (dataRows.length === 0) return res.status(400).json({ error: 'No hay filas de datos debajo del encabezado' });
  if (dataRows.length > 500) return res.status(400).json({ error: 'Máximo 500 usuarios por importación' });

  // Saltar la "fila de etiquetas humanas" si existe (ej. "Nombre", "Apellido")
  // — se reconoce porque sus celdas son palabras genéricas que coinciden con
  // los headers. Solo descartamos UNA fila adicional si claramente lo es.
  if (dataRows.length > 0) {
    const primeraFila = dataRows[0].map(normKey);
    const coincide = primeraFila.filter(c => palabrasClave.some(p => c === p || c === 'cedula' || c === 'telefono' || c === 'rol' || c.includes('correo'))).length;
    if (coincide >= 2) dataRows.shift();   // era otra fila de adorno
  }

  const { rows: rolesDB } = await pool.query('SELECT id_rol, nombre FROM roles');
  const rolesMap = {};
  rolesDB.forEach(r => { rolesMap[r.nombre.toLowerCase()] = r.id_rol; });

  const resultado = { procesados: 0, creados: 0, duplicados: 0, errores: 0, detalle: [] };

  // Mapa: claves aceptadas → índice en headers
  const campoMap = {
    nombre:         ['nombre','nombres','primernombre','firstname','name'],
    apellido:       ['apellido','apellidos','lastname','surname'],
    nombreCompleto: ['nombrecompleto','fullname'],
    correo:         ['correo','correoelectronico','email','mail','correoelec'],
    documento:      ['documento','cedula','cc','ci','dni','identificacion','numerodocumento','nrodocumento'],
    telefono:       ['telefono','celular','movil','phone','telefonomovil','contacto'],
    rol:            ['rol','role','tipousuario','perfil'],
  };

  // Pre-computar el índice de cada campo en la fila de headers
  const idxCampo = {};
  for (const [campo, claves] of Object.entries(campoMap)) {
    for (const k of claves) {
      const idx = headers.indexOf(k);
      if (idx !== -1) { idxCampo[campo] = idx; break; }
    }
  }

  const pickCelda = (fila, campo) => {
    const idx = idxCampo[campo];
    if (idx == null) return '';
    return String(fila[idx] == null ? '' : fila[idx]).trim();
  };

  for (const fila of dataRows) {
    resultado.procesados++;

    let nombre   = pickCelda(fila, 'nombre');
    let apellido = pickCelda(fila, 'apellido');
    const correo    = pickCelda(fila, 'correo').toLowerCase();
    const documento = pickCelda(fila, 'documento');
    const telefono  = pickCelda(fila, 'telefono');
    const rolNombre = (pickCelda(fila, 'rol') || 'usuario').toLowerCase();
    const completoDirecto = pickCelda(fila, 'nombreCompleto');

    if (completoDirecto && (!nombre || !apellido)) {
      const partes = completoDirecto.split(/\s+/);
      if (!nombre)   nombre   = partes[0] || '';
      if (!apellido) apellido = partes.slice(1).join(' ');
    }
    const nombre_completo = `${nombre} ${apellido}`.trim();
    const nombre_usuario  = correo.split('@')[0].replace(/[^a-z0-9._]/gi,'').toLowerCase().slice(0,60);

    if (!nombre_completo || !correo) {
      resultado.errores++;
      const colsDetectadas = headers.filter(Boolean).join(', ') || '(ninguna)';
      resultado.detalle.push({
        fila: resultado.procesados,
        error: !nombre_completo
          ? `Falta NOMBRE — headers detectados: ${colsDetectadas}`
          : `Falta CORREO — headers detectados: ${colsDetectadas}`,
      });
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      resultado.errores++;
      resultado.detalle.push({ fila: resultado.procesados, error: `Correo inválido: ${correo}` }); continue;
    }

    const id_rol = rolesMap[rolNombre] || rolesMap['usuario'] || 2;
    const passRaw = documento || correo.split('@')[0];
    const hash = await bcrypt.hash(passRaw, 10);

    try {
      await pool.query(
        `INSERT INTO usuarios (nombre_completo, nombre_usuario, correo_electronico, telefono, documento, contraseña, id_rol, estado, primer_ingreso, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'activo',TRUE,$8)`,
        [nombre_completo, nombre_usuario, correo, telefono||null, documento||null, hash, id_rol, req.user.id]
      );
      resultado.creados++;
    } catch (err) {
      if (err.code === '23505') { resultado.duplicados++; resultado.detalle.push({ fila: resultado.procesados, error: 'Duplicado', correo }); }
      else                      { resultado.errores++;    resultado.detalle.push({ fila: resultado.procesados, error: err.message, correo }); }
    }
  }

  await auditar('importar', null, req.user.id,
    `Importación: ${resultado.creados} creados, ${resultado.duplicados} dup, ${resultado.errores} errores`,
    resultado.creados, resultado.errores
  );
  res.json({ ok: true, ...resultado });
};

// DESCARGAR PLANTILLA — sirve el archivo Excel pre-generado con diseño completo
const descargarPlantilla = (req, res) => {
  const path = require('path');
  const fs   = require('fs');
  const filePath = path.join(__dirname, '../assets/plantilla_usuarios.xlsx');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Plantilla no encontrada' });
  }
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_usuarios.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.sendFile(filePath);
};

// AUDITORÍA
const getAuditoria = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows } = await pool.query(
      `SELECT a.*, u.nombre_completo AS realizado_por_nombre, uo.nombre_completo AS usuario_afectado
       FROM auditoria_usuarios a
       LEFT JOIN usuarios u  ON a.realizado_por  = u.id_usuario
       LEFT JOIN usuarios uo ON a.id_usuario_obj = uo.id_usuario
       ORDER BY a.fecha DESC LIMIT $1 OFFSET $2`,
      [parseInt(limit), offset]
    );
    const { rows: tot } = await pool.query('SELECT COUNT(*) FROM auditoria_usuarios');
    res.json({ data: rows, total: parseInt(tot[0].count) });
  } catch (err) { res.status(500).json({ error: 'Error al obtener auditoría' }); }
};

module.exports = { listar, crear, actualizar, eliminar, toggleEstado, cambiarEstado, accionMasiva, importar, descargarPlantilla, getAuditoria, upload };

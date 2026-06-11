import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Recycle, Search, BarChart2, Settings, CheckCircle,
  Clock, XCircle, AlertTriangle, ChevronLeft, ChevronRight,
  Trash2, Lock, Unlock, Layers, Info, TrendingUp, DollarSign
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConfirmDelete } from '../hooks/useConfirmDelete';

// ══════════════════════════════════════════════════════════════════════════════
// BancoResiduos.jsx — CorteAlu
// Panel de gestión de residuos reutilizables de aluminio
// Diseño integrado con el sistema de diseño oficial del proyecto
// ══════════════════════════════════════════════════════════════════════════════

const ESTADO = {
  disponible: { label: 'Disponible',  icon: CheckCircle, color: 'var(--success)',  bg: 'var(--success-light)' },
  reservado:  { label: 'Reservado',   icon: Clock,       color: 'var(--warning)',  bg: 'var(--warning-light)' },
  usado:      { label: 'Usado',       icon: Layers,      color: 'var(--info)',     bg: 'var(--info-light)'    },
  descartado: { label: 'Descartado',  icon: XCircle,     color: 'var(--danger)',   bg: 'var(--danger-light)'  },
  expirado:   { label: 'Expirado',    icon: AlertTriangle,color:'var(--text-muted)',bg:'var(--bg-deep)'       },
};

// ── Componentes reutilizables ─────────────────────────────────────────────────

function StatCard({ icon: Icon, label, valor, color, bg, small }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: small ? '14px 16px' : '18px 20px',
      display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: 'var(--shadow)', flex: 1, minWidth: 130,
    }}>
      <div style={{
        width: small ? 36 : 44, height: small ? 36 : 44, borderRadius: 10,
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={small ? 16 : 20} style={{ color }} />
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: small ? '1.1rem' : '1.4rem', color: 'var(--text-primary)', lineHeight: 1 }}>
          {valor}
        </div>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function EstadoBadge({ estado }) {
  const cfg = ESTADO[estado] || ESTADO.descartado;
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: cfg.bg, color: cfg.color,
      padding: '3px 10px', borderRadius: 999, fontSize: '.72rem', fontWeight: 700,
    }}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

function BarraVisual({ usadoCm, totalCm, sobrante }) {
  const pct = Math.min((usadoCm / totalCm) * 100, 100);
  const pctSob = Math.min((sobrante / totalCm) * 100, 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-deep)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${pct}%`, background: 'var(--primary)', borderRadius: '4px 0 0 4px', transition: 'width .4s' }} />
        <div style={{ width: `${pctSob}%`, background: 'var(--success)', transition: 'width .4s' }} />
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: '.68rem', color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--primary)' }}>■ Pieza: {usadoCm} cm</span>
        <span style={{ color: 'var(--success)' }}>■ Sobrante: {sobrante} cm</span>
      </div>
    </div>
  );
}

// ── Visualización Canvas 3D de la barra de aluminio ──────────────────────────
function SimuladorCortesCanvas({ barra_cm = 600, piezas = [], residuos = [] }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Fondo
    ctx.fillStyle = '#f4f2ef';
    ctx.fillRect(0, 0, W, H);

    const MARGIN_X = 40, BAR_Y = H / 2 - 18, BAR_H = 36;
    const BAR_W = W - MARGIN_X * 2;
    if (barra_cm <= 0 || !isFinite(barra_cm)) return;
    const scale = BAR_W / barra_cm;

    // Sombra de la barra
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    // Barra base (aluminio)
    if (!isFinite(MARGIN_X) || !isFinite(BAR_Y) || !isFinite(BAR_H)) return;
    const gradBar = ctx.createLinearGradient(MARGIN_X, BAR_Y, MARGIN_X, BAR_Y + BAR_H);
    gradBar.addColorStop(0, '#dde3ea');
    gradBar.addColorStop(0.4, '#f0f3f7');
    gradBar.addColorStop(1, '#b8c2cc');
    ctx.fillStyle = gradBar;
    ctx.beginPath();
    ctx.roundRect(MARGIN_X, BAR_Y, BAR_W, BAR_H, 6);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Borde de la barra
    ctx.strokeStyle = '#aab5c0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Dibujar piezas (azul)
    let cursor = 0;
    const coloresPieza = ['#1565C0', '#1976D2', '#1E88E5', '#2196F3'];
    piezas.forEach((p, i) => {
      const x = MARGIN_X + cursor * scale;
      const w = p.longitud * scale;
      if (!isFinite(x) || !isFinite(w) || w <= 0) { cursor += p.longitud; return; }
      const grad = ctx.createLinearGradient(x, BAR_Y + 4, x, BAR_Y + BAR_H - 4);
      grad.addColorStop(0, coloresPieza[i % coloresPieza.length] + 'ee');
      grad.addColorStop(1, coloresPieza[i % coloresPieza.length] + '99');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x + 1, BAR_Y + 4, Math.max(w - 2, 2), BAR_H - 8, 4);
      ctx.fill();

      // Etiqueta de la pieza
      if (w > 40) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.min(11, w / 8)}px Barlow, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.ubicacion ? p.ubicacion.substring(0, 8) : `${p.longitud}cm`, x + w / 2, BAR_Y + BAR_H / 2);
      }

      // Línea de corte
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x + w, BAR_Y + 2);
      ctx.lineTo(x + w, BAR_Y + BAR_H - 2);
      ctx.stroke();
      ctx.setLineDash([]);

      cursor += p.longitud;
    });

    // Dibujar residuos (verde = reutilizable, rojo = descartado)
    residuos.forEach((r) => {
      const x = MARGIN_X + cursor * scale;
      const w = r.longitud * scale;
      if (!isFinite(x) || !isFinite(w) || w <= 0) { cursor += r.longitud; return; }
      const esReutilizable = r.reutilizable !== false;
      const color = esReutilizable ? '#1E7B4B' : '#C0392B';
      const colorLight = esReutilizable ? '#E8F5EE' : '#FDECEA';

      const grad = ctx.createLinearGradient(x, BAR_Y + 4, x, BAR_Y + BAR_H - 4);
      grad.addColorStop(0, color + 'cc');
      grad.addColorStop(1, color + '66');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x + 1, BAR_Y + 4, Math.max(w - 2, 2), BAR_H - 8, 4);
      ctx.fill();

      // Ícono de residuo
      if (w > 30) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold 9px Barlow, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(esReutilizable ? '♻' : '✕', x + w / 2, BAR_Y + BAR_H / 2 - 5);
        ctx.font = `9px Barlow, sans-serif`;
        ctx.fillText(`${r.longitud}cm`, x + w / 2, BAR_Y + BAR_H / 2 + 6);
      }

      cursor += r.longitud;
    });

    // Escala inferior (marcas cada 100cm)
    ctx.fillStyle = 'var(--text-muted, #8C939B)';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    for (let mark = 0; mark <= barra_cm; mark += 100) {
      const x = MARGIN_X + mark * scale;
      ctx.strokeStyle = '#aab5c0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, BAR_Y + BAR_H + 2);
      ctx.lineTo(x, BAR_Y + BAR_H + 7);
      ctx.stroke();
      ctx.fillStyle = '#8C939B';
      ctx.fillText(`${mark}`, x, BAR_Y + BAR_H + 16);
    }

    // Longitud total
    ctx.font = 'bold 10px Barlow, sans-serif';
    ctx.fillStyle = '#52585F';
    ctx.textAlign = 'left';
    ctx.fillText(`Barra: ${barra_cm} cm`, MARGIN_X, BAR_Y - 10);

    // Leyenda
    const leyendaY = BAR_Y + BAR_H + 28;
    const items = [
      { color: '#1565C0', label: 'Piezas cortadas' },
      { color: '#1E7B4B', label: 'Residuo reutilizable' },
      { color: '#C0392B', label: 'Residuo descartado' },
    ];
    let lx = MARGIN_X;
    ctx.font = '10px Barlow, sans-serif';
    items.forEach(it => {
      ctx.fillStyle = it.color;
      ctx.fillRect(lx, leyendaY, 12, 12);
      ctx.fillStyle = '#52585F';
      ctx.textAlign = 'left';
      ctx.fillText(it.label, lx + 16, leyendaY + 9);
      lx += ctx.measureText(it.label).width + 36;
    });

  }, [barra_cm, piezas, residuos]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={100}
      style={{ width: '100%', height: 'auto', borderRadius: 8, display: 'block' }}
    />
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function BancoResiduos() {
  const { isAdmin } = useAuth();
  const [tab, setTab]                   = useState('banco');
  const [residuos, setResiduos]         = useState([]);
  const [metricas, setMetricas]         = useState(null);
  const [alertas, setAlertas]           = useState([]);
  const [config, setConfig]             = useState([]);
  const [editConfig, setEditConfig]     = useState({});
  const [filtro, setFiltro]             = useState({ estado: 'disponible', perfil: '', color: '', incluir_anulados: false });
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [busqueda, setBusqueda]         = useState({ perfil: '', longitud: '', color: '' });
  const [resultBusq, setResultBusq]     = useState(null);
  const [buscando, setBuscando]         = useState(false);
  const [guardandoCfg, setGuardandoCfg] = useState(false);
  // FIX v45: modal de detalle del residuo (datos + historial completo)
  const [detalle, setDetalle]           = useState(null);   // { residuo, historial }
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleOpenId, setDetalleOpenId]   = useState(null);

  // Abrir el modal de detalle de un residuo
  const abrirDetalle = useCallback(async (id) => {
    setDetalleOpenId(id);
    setDetalle(null);
    setDetalleLoading(true);
    try {
      const { data } = await api.get(`/residuos/${id}/detalle`);
      setDetalle(data);
    } catch {
      toast.error('No se pudo cargar el detalle del residuo');
      setDetalleOpenId(null);
    }
    setDetalleLoading(false);
  }, []);

  const cerrarDetalle = useCallback(() => {
    setDetalleOpenId(null);
    setDetalle(null);
  }, []);

  // ── Carga de datos ──────────────────────────────────────────────────────
  const cargarResiduos = useCallback(async () => {
    setLoading(true);
    try {
      // FIX v29: por defecto el backend excluye descartados de planes anulados
      // (que son "fantasmas" — el plan se regeneró y nunca se cortaron). Solo
      // los incluímos cuando el usuario activa el toggle de auditoría.
      const params = new URLSearchParams({
        estado: filtro.estado,
        perfil: filtro.perfil,
        color:  filtro.color,
        page,
        limit: 15,
      });
      if (filtro.incluir_anulados) params.set('incluir_anulados', 'true');
      const { data } = await api.get(`/residuos?${params}`);
      setResiduos(data.data || []);
      setTotalPages(data.pagination?.pages || 1);
      setTotal(data.pagination?.total || 0);
    } catch { /* silencioso */ }
    setLoading(false);
  }, [filtro, page]);

  const cargarMetricas = async () => {
    try { const { data } = await api.get('/residuos/metricas'); setMetricas(data); } catch {}
  };

  const cargarAlertas = async () => {
    try { const { data } = await api.get('/residuos/recomendaciones'); setAlertas(data.alertas || []); } catch {}
  };

  const cargarConfig = async () => {
    try {
      const { data } = await api.get('/residuos/config');
      setConfig(data);
      const map = {};
      data.forEach(c => { map[c.clave] = c.valor; });
      setEditConfig(map);
    } catch {}
  };

  useEffect(() => { cargarResiduos(); }, [cargarResiduos]);
  useEffect(() => { cargarMetricas(); cargarAlertas(); cargarConfig(); }, []);

  // ── Acciones ────────────────────────────────────────────────────────────
  const { confirm: confirmDelete, modal: deleteModal } = useConfirmDelete();

  const accion = async (id, endpoint, method = 'post', body = {}) => {
    try {
      const { data } = await api[method](`/residuos/${id}${endpoint ? '/' + endpoint : ''}`, body);
      toast.success(data.mensaje || 'Acción completada');
      cargarResiduos(); cargarMetricas();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al ejecutar la acción');
    }
  };

  // Descartar residuo: requiere contraseña (acción destructiva)
  const descartarResiduo = (id) => {
    confirmDelete({
      itemLabel: `el residuo #${id}`,
      title: '¿Descartar este residuo?',
      warningText: 'El residuo será marcado como "descartado" en el banco. Esta acción no se puede deshacer.',
      confirmButtonText: 'Descartar',
      onConfirm: async (password) => {
        const { data } = await api.delete(`/residuos/${id}`, { data: { password } });
        toast.success(data.mensaje || 'Residuo descartado');
        cargarResiduos();
        cargarMetricas();
      },
    });
  };

  const buscarBestFit = async () => {
    if (!busqueda.perfil || !busqueda.longitud) { toast.error('Ingresa perfil y longitud'); return; }
    setBuscando(true); setResultBusq(null);
    try {
      const p = new URLSearchParams(busqueda);
      const { data } = await api.get(`/residuos/buscar?${p}`);
      setResultBusq(data);
    } catch (e) { toast.error(e.response?.data?.error || 'Error al buscar'); }
    setBuscando(false);
  };

  const guardarConfig = async () => {
    setGuardandoCfg(true);
    try {
      for (const [clave, valor] of Object.entries(editConfig)) {
        await api.put('/residuos/config', { clave, valor });
      }
      toast.success('Configuración guardada');
      cargarConfig();
    } catch { toast.error('Error al guardar configuración'); }
    setGuardandoCfg(false);
  };

  // ── Datos para simulador canvas del mejor resultado ──────────────────────
  const canvasPiezas = resultBusq?.mejor_opcion ? [
    { longitud: parseFloat(busqueda.longitud), ubicacion: 'PIEZA' }
  ] : [];
  const canvasResiduos = resultBusq?.mejor_opcion ? [
    { longitud: resultBusq.mejor_opcion.sobrante_si_usa, reutilizable: resultBusq.mejor_opcion.sobrante_si_usa >= 20 }
  ] : [];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Encabezado ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--success-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Recycle size={22} style={{ color: 'var(--success)' }} />
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.6rem', margin: 0, letterSpacing: '.01em' }}>
              Banco de Residuos
            </h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '.85rem' }}>
              Gestión inteligente de sobrantes de aluminio reutilizables
            </p>
          </div>
        </div>

        {/* Alertas IA */}
        {alertas.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alertas.slice(0, 2).map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: a.tipo === 'ahorro' ? 'var(--success-light)' : a.tipo === 'alerta' ? 'var(--danger-light)' : 'var(--warning-light)',
                border: `1px solid ${a.tipo === 'ahorro' ? '#c6e9d7' : a.tipo === 'alerta' ? '#f5c6c2' : '#f5e0b0'}`,
                borderRadius: 8, padding: '8px 14px', fontSize: '.82rem',
              }}>
                <span style={{ fontSize: 16 }}>{a.icono}</span>
                <span style={{ color: 'var(--text-primary)' }}>{a.mensaje}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Stats rápidas ── */}
      {metricas?.global && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <StatCard icon={CheckCircle} label="Disponibles"    valor={metricas.global.disponibles}           color="var(--success)" bg="var(--success-light)" />
          <StatCard icon={Clock}       label="Reservados"     valor={metricas.global.reservados}            color="var(--warning)" bg="var(--warning-light)" />
          <StatCard icon={Layers}      label="Usados"         valor={metricas.global.usados}                color="var(--info)"    bg="var(--info-light)"    />
          <StatCard icon={TrendingUp}  label="Reutilización"  valor={`${metricas.global.tasa_reutilizacion_pct}%`} color="var(--primary)" bg="var(--primary-light)" />
          <StatCard icon={DollarSign}  label="Ahorro estimado" valor={`$${((metricas.ahorro_estimado_total_cop||0)/1000).toFixed(0)}k`} color="var(--success)" bg="var(--success-light)" />
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 20,
        background: 'var(--bg-deep)', padding: 4, borderRadius: 10,
        border: '1px solid var(--border)',
      }}>
        {[
          { key: 'banco',    icon: Recycle,    label: 'Banco' },
          { key: 'buscar',   icon: Search,     label: 'Buscar Best-Fit' },
          { key: 'metricas', icon: BarChart2,  label: 'Métricas' },
          // FIX v42: Config solo para admin. Los usuarios operativos ven los
          // otros 3 tabs (Banco/Buscar/Métricas) en modo consulta y reserva.
          ...(isAdmin ? [{ key: 'config', icon: Settings, label: 'Config' }] : []),
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === t.key ? 'var(--surface)' : 'transparent',
              color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)',
              fontFamily: 'var(--font-body)', fontWeight: tab === t.key ? 700 : 500,
              fontSize: '.85rem', boxShadow: tab === t.key ? 'var(--shadow)' : 'none',
              transition: 'all .15s',
            }}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          TAB: BANCO
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'banco' && (
        <div>
          {/* Filtros */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16,
            display: 'flex', gap: 10, flexWrap: 'wrap', boxShadow: 'var(--shadow)',
            alignItems: 'center',
          }}>
            <select
              value={filtro.estado}
              onChange={e => { setFiltro(f => ({ ...f, estado: e.target.value })); setPage(1); }}
              className="form-control"
              style={{ flex: 1, minWidth: 150, fontSize: '.85rem' }}
            >
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <input
              placeholder="Perfil (744, 5020…)"
              value={filtro.perfil}
              onChange={e => { setFiltro(f => ({ ...f, perfil: e.target.value.toUpperCase() })); setPage(1); }}
              className="form-control"
              style={{ flex: 1, minWidth: 130, fontSize: '.85rem' }}
            />
            <input
              placeholder="Color"
              value={filtro.color}
              onChange={e => { setFiltro(f => ({ ...f, color: e.target.value })); setPage(1); }}
              className="form-control"
              style={{ flex: 1, minWidth: 120, fontSize: '.85rem' }}
            />
            <button onClick={cargarResiduos} className="btn btn-primary btn-sm">
              Filtrar
            </button>
          </div>

          {/* Toggle de auditoría — controla si se muestran los descartados
              "fantasma" (sobrantes de planes que fueron anulados al regenerar
              la optimización). Default: oculto, porque visualmente parecían
              duplicados del residuo nuevo. */}
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            marginBottom: 14, fontSize: '.78rem', color: 'var(--text-muted)',
            cursor: 'pointer', userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={filtro.incluir_anulados}
              onChange={e => { setFiltro(f => ({ ...f, incluir_anulados: e.target.checked })); setPage(1); }}
              style={{ cursor: 'pointer' }}
            />
            <span>
              Mostrar descartados de planes anulados <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>(auditoría · normalmente ocultos)</span>
            </span>
          </label>

          {/* Tabla */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', overflow: 'hidden',
          }}>
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                Cargando banco de residuos…
              </div>
            ) : residuos.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center' }}>
                <Recycle size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
                <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>No hay residuos con los filtros actuales</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
                  Los residuos se generan automáticamente al procesar cortes de ventanas.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-deep)', borderBottom: '2px solid var(--border)' }}>
                    {['#', 'Perfil', 'Pieza', 'Ref. ALN', 'Color', 'Longitud', 'Barra original', 'Proyecto origen', 'Dejado por', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{
                        padding: '10px 14px', textAlign: 'left', whiteSpace: 'nowrap',
                        fontFamily: 'var(--font-display)', fontSize: '.72rem',
                        fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em',
                        color: 'var(--text-muted)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {residuos.map((r, idx) => (
                    <tr
                      key={r.id_residuo}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-light)'}
                      onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'}
                    >
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '.8rem' }}>
                        {r.id_residuo}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          background: 'var(--primary-light)', color: 'var(--primary)',
                          padding: '2px 9px', borderRadius: 6,
                          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '.8rem',
                        }}>
                          {r.referencia_perfil}
                        </span>
                      </td>
                      {/* FIX v39: Columna "Pieza" — muestra ubicacion_pieza
                          (CABEZAL, SILLAR, JAMBA, etc.). Crítica porque un
                          sillar no se puede usar para un cabezal aunque sean
                          del mismo perfil. */}
                      <td style={{ padding: '10px 14px' }}>
                        {r.ubicacion_pieza ? (
                          <span style={{
                            background: 'var(--bg-deep)', color: 'var(--text-secondary)',
                            padding: '2px 8px', borderRadius: 5,
                            fontSize: '.74rem', fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '.04em',
                            whiteSpace: 'nowrap',
                          }}>
                            {r.ubicacion_pieza}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '.78rem', fontStyle: 'italic' }}>
                            sin clasificar
                          </span>
                        )}
                      </td>
                      {/* FIX v39: Columna "Ref. ALN" — referencia física de la
                          extrusión (ej. ALNA 392). Dos piezas con la misma
                          ALN son LA MISMA barra físicamente, aunque vengan
                          de sistemas distintos. */}
                      <td style={{
                        padding: '10px 14px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '.78rem',
                        fontWeight: 700,
                        color: r.referencia_aln ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}>
                        {r.referencia_aln || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '.82rem' }}>
                        {r.color_perfil || '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontWeight: 800,
                          color: 'var(--success)', fontSize: '1rem',
                        }}>
                          {r.longitud_cm} <span style={{ fontSize: '.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>cm</span>
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '.8rem', fontFamily: 'var(--font-mono)' }}>
                        {r.longitud_original_cm ? `${r.longitud_original_cm} cm` : '—'}
                      </td>
                      {/* FIX v39: "Proyecto origen" ahora muestra SOLO el
                          proyecto. El hack anterior `r.proyecto_origen ||
                          r.ubicacion_pieza` mezclaba dos conceptos en una
                          misma celda; ahora la pieza está en su columna
                          dedicada y el proyecto se ve solo. */}
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '.82rem', maxWidth: 160 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.proyecto_origen || '—'}
                        </div>
                      </td>
                      {/* FIX v44: "Dejado por" — quién procesó el residuo por
                          última vez (se actualiza con cada reutilización, ver
                          fix v43). Antes solo se veía el proyecto, no la persona
                          responsable física de la pieza. */}
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '.82rem', maxWidth: 150 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.creado_por_nombre || '—'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <EstadoBadge estado={r.estado} />
                        {r.minutos_reserva_restantes !== null && r.minutos_reserva_restantes !== undefined && (
                          <div style={{ fontSize: '.68rem', color: r.minutos_reserva_restantes < 5 ? 'var(--danger)' : 'var(--warning)', marginTop: 2 }}>
                            {Math.max(0, Math.round(r.minutos_reserva_restantes))} min
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {/* FIX v45: Ver detalle + historial completo del residuo */}
                          <button
                            title="Ver detalle e historial"
                            className="btn btn-outline btn-sm"
                            style={{ padding: '3px 8px' }}
                            onClick={() => abrirDetalle(r.id_residuo)}
                          >
                            <Info size={12} />
                          </button>
                          {r.estado === 'disponible' && (
                            <>
                              <button
                                title="Reservar"
                                className="btn btn-outline btn-sm"
                                style={{ padding: '3px 8px' }}
                                onClick={() => accion(r.id_residuo, 'reservar', 'post', {})}
                              >
                                <Lock size={12} />
                              </button>
                              {/* FIX v42: Descartar es acción de admin (requiere
                                  password y afecta auditoría de planta física). */}
                              {isAdmin && (
                                <button
                                  title="Descartar"
                                  className="btn btn-sm"
                                  style={{ padding: '3px 8px', background: 'var(--danger-light)', color: 'var(--danger)', border: 'none' }}
                                  onClick={() => descartarResiduo(r.id_residuo)}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </>
                          )}
                          {r.estado === 'reservado' && (
                            <button
                              title="Liberar reserva"
                              className="btn btn-sm"
                              style={{ padding: '3px 8px', background: 'var(--success-light)', color: 'var(--success)', border: 'none' }}
                              onClick={() => accion(r.id_residuo, 'liberar')}
                            >
                              <Unlock size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}

            {/* Paginación */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)',
              }}>
                <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>
                  {total} residuos — Página {page} de {totalPages}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft size={14} /> Anterior
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Siguiente <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: BUSCAR BEST-FIT
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'buscar' && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Search size={18} style={{ color: 'var(--primary)' }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>
              Buscar Residuo Compatible
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginBottom: 20 }}>
            Algoritmo <strong>Best-Fit</strong>: encuentra el residuo que genera el menor sobrante posible al cortar la pieza requerida.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <input
              placeholder="Perfil (ej: 744)"
              value={busqueda.perfil}
              onChange={e => setBusqueda(b => ({ ...b, perfil: e.target.value.toUpperCase() }))}
              className="form-control"
              style={{ flex: 1, minWidth: 130 }}
            />
            <input
              placeholder="Longitud requerida (cm)"
              type="number"
              min="1"
              value={busqueda.longitud}
              onChange={e => setBusqueda(b => ({ ...b, longitud: e.target.value }))}
              className="form-control"
              style={{ flex: 1, minWidth: 160 }}
            />
            <input
              placeholder="Color (opcional)"
              value={busqueda.color}
              onChange={e => setBusqueda(b => ({ ...b, color: e.target.value }))}
              className="form-control"
              style={{ flex: 1, minWidth: 120 }}
            />
            <button
              onClick={buscarBestFit}
              disabled={buscando}
              className="btn btn-primary"
            >
              {buscando ? 'Buscando…' : '🔍 Buscar'}
            </button>
          </div>

          {resultBusq && (
            <div>
              {/* Mensaje de recomendación */}
              <div style={{
                padding: '12px 16px',
                background: resultBusq.mejor_opcion ? 'var(--success-light)' : 'var(--danger-light)',
                border: `1px solid ${resultBusq.mejor_opcion ? '#c6e9d7' : '#f5c6c2'}`,
                borderRadius: 8, marginBottom: 20,
              }}>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {resultBusq.recomendacion}
                </p>
                {resultBusq.ahorro_estimado_cop && (
                  <p style={{ margin: '6px 0 0', color: 'var(--success)', fontWeight: 700 }}>
                    💰 Ahorro estimado: ${resultBusq.ahorro_estimado_cop.toLocaleString('es-CO')} COP
                  </p>
                )}
              </div>

              {/* Visualización Canvas 3D */}
              {resultBusq.mejor_opcion && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                    Simulación de corte — Residuo #{resultBusq.mejor_opcion.id_residuo}
                  </p>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--bg)' }}>
                    <SimuladorCortesCanvas
                      barra_cm={resultBusq.mejor_opcion.longitud_cm}
                      piezas={canvasPiezas}
                      residuos={canvasResiduos}
                    />
                  </div>
                  <BarraVisual
                    usadoCm={parseFloat(busqueda.longitud)}
                    totalCm={resultBusq.mejor_opcion.longitud_cm}
                    sobrante={resultBusq.mejor_opcion.sobrante_si_usa}
                  />
                </div>
              )}

              {/* Mejor opción */}
              {resultBusq.mejor_opcion && (
                <div>
                  <p style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    ✅ Mejor opción — menor desperdicio
                  </p>
                  <ResiduoCard r={resultBusq.mejor_opcion} destacado onAccion={accion} onRefresh={() => { cargarResiduos(); cargarMetricas(); }} />
                </div>
              )}

              {/* Alternativas */}
              {resultBusq.alternativas?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    Alternativas disponibles
                  </p>
                  {resultBusq.alternativas.map(r => (
                    <ResiduoCard key={r.id_residuo} r={r} onAccion={accion} onRefresh={() => { cargarResiduos(); cargarMetricas(); }} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: MÉTRICAS
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'metricas' && metricas && (
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Visualización canvas del aprovechamiento global */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow)',
          }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', marginBottom: 16 }}>
              📊 Aprovechamiento global de barras
            </h3>
            <SimuladorCortesCanvas
              barra_cm={600}
              piezas={[{ longitud: (metricas.global?.metros_reutilizados_cm || 0) / (metricas.global?.total_residuos || 1) * 3, ubicacion: 'USADOS' }]}
              residuos={[
                { longitud: (metricas.global?.metros_disponibles_cm || 0) / (metricas.global?.total_residuos || 1) * 3, reutilizable: true },
              ]}
            />
            <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: 10, textAlign: 'center' }}>
              Representación proporcional del aprovechamiento promedio por barra
            </p>
          </div>

          {/* Stats globales */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow)',
          }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', marginBottom: 16 }}>
              Indicadores globales
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <StatCard small icon={CheckCircle}   label="Disponibles"  valor={metricas.global?.disponibles}    color="var(--success)" bg="var(--success-light)" />
              <StatCard small icon={Clock}         label="Reservados"   valor={metricas.global?.reservados}     color="var(--warning)" bg="var(--warning-light)" />
              <StatCard small icon={Layers}        label="Usados"       valor={metricas.global?.usados}         color="var(--info)"    bg="var(--info-light)" />
              <StatCard small icon={XCircle}       label="Descartados"  valor={metricas.global?.descartados}    color="var(--danger)"  bg="var(--danger-light)" />
              <StatCard small icon={TrendingUp}    label="Reutilización" valor={`${metricas.global?.tasa_reutilizacion_pct}%`} color="var(--primary)" bg="var(--primary-light)" />
              <StatCard small icon={DollarSign}    label="Ahorro total" valor={`$${((metricas.ahorro_estimado_total_cop||0)/1000).toFixed(1)}k`} color="var(--success)" bg="var(--success-light)" />
            </div>
          </div>

          {/* Por perfil */}
          {metricas.por_perfil?.length > 0 && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow)', overflow: 'hidden',
            }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', marginBottom: 16 }}>
                Por perfil de aluminio
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-deep)' }}>
                    {['Perfil', 'Disponibles', 'Usados', 'Metros disp.', 'Metros usados'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metricas.por_perfil.map(p => (
                    <tr key={p.referencia_perfil} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 9px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '.82rem' }}>
                          {p.referencia_perfil}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--success)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{p.disponibles}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--info)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{p.usados}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '.85rem' }}>{((p.metros_disponibles_cm||0)/100).toFixed(2)} m</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '.85rem' }}>{((p.metros_usados_cm||0)/100).toFixed(2)} m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: CONFIG
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'config' && isAdmin && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Settings size={18} style={{ color: 'var(--primary)' }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>
              Configuración del módulo
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginBottom: 24 }}>
            Parámetros globales del sistema de residuos. {!isAdmin && 'Solo administradores pueden modificarlos.'}
          </p>

          {config.map(c => (
            <div key={c.clave} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 0', borderBottom: '1px solid var(--border)', gap: 20,
            }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '.88rem', color: 'var(--primary)' }}>
                  {c.clave}
                </p>
                <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: '.8rem' }}>
                  {c.descripcion}
                </p>
              </div>
              <input
                type="number"
                value={editConfig[c.clave] ?? c.valor}
                onChange={e => setEditConfig(ec => ({ ...ec, [c.clave]: e.target.value }))}
                className="form-control"
                disabled={!isAdmin}
                style={{ width: 100, textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
              />
            </div>
          ))}

          {isAdmin && (
            <button
              onClick={guardarConfig}
              disabled={guardandoCfg}
              className="btn btn-primary"
              style={{ marginTop: 20 }}
            >
              {guardandoCfg ? 'Guardando…' : '💾 Guardar configuración'}
            </button>
          )}
        </div>
      )}
      {/* Modal de confirmación de descarte con contraseña */}
      {deleteModal}
      {/* FIX v45: Modal de detalle + historial del residuo */}
      {detalleOpenId && (
        <DetalleResiduoModal
          loading={detalleLoading}
          data={detalle}
          onClose={cerrarDetalle}
        />
      )}
    </div>
  );
}

// ── Sub-componente: Modal de detalle + historial de un residuo ──────────────
const EVENTO_META = {
  creado:     { label: 'Creado',     color: 'var(--success)', icon: CheckCircle },
  consumido:  { label: 'Consumido',  color: 'var(--info)',    icon: Layers },
  reservado:  { label: 'Reservado',  color: 'var(--warning)', icon: Lock },
  liberado:   { label: 'Liberado',   color: 'var(--success)', icon: Unlock },
  usado:      { label: 'Usado',      color: 'var(--info)',    icon: Layers },
  descartado: { label: 'Descartado', color: 'var(--danger)',  icon: XCircle },
};

function fmtFecha(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(ts); }
}

function DetalleResiduoModal({ loading, data, onClose }) {
  const r = data?.residuo;
  const historial = data?.historial || [];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 60px rgba(0,0,0,.3)', width: '100%', maxWidth: 640,
          maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-deep)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Recycle size={20} style={{ color: 'var(--primary)' }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>
              {loading ? 'Cargando…' : `Residuo #${r?.id_residuo ?? ''}`}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="btn btn-outline btn-sm"
            style={{ padding: '4px 9px' }}
            title="Cerrar"
          >
            <XCircle size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, overflowY: 'auto' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              Cargando detalle…
            </div>
          )}

          {!loading && r && (
            <>
              {/* Ficha de datos */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 12, marginBottom: 22,
              }}>
                {[
                  ['Perfil', r.referencia_perfil],
                  ['Pieza', r.ubicacion_pieza || 'sin clasificar'],
                  ['Ref. ALN', r.referencia_aln || '—'],
                  ['Color', r.color_perfil || '—'],
                  ['Longitud actual', `${r.longitud_cm} cm`],
                  ['Barra original', r.longitud_original_cm ? `${r.longitud_original_cm} cm` : '—'],
                  ['Proyecto origen', r.proyecto_origen || '—'],
                  ['Dejado por', r.creado_por_nombre || '—'],
                  ['Estado', (ESTADO[r.estado]?.label || r.estado)],
                ].map(([k, v]) => (
                  <div key={k} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{k}</div>
                    <div style={{ fontSize: '.9rem', color: 'var(--text-primary)', fontWeight: 700, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Historial / timeline */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Clock size={16} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '.95rem', margin: 0 }}>
                  Historial del residuo
                </h3>
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                  ({historial.length} evento{historial.length === 1 ? '' : 's'})
                </span>
              </div>

              {historial.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '.85rem', fontStyle: 'italic', padding: '12px 0' }}>
                  Sin eventos registrados en el historial.
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 22 }}>
                  {/* línea vertical del timeline */}
                  <div style={{ position: 'absolute', left: 7, top: 4, bottom: 4, width: 2, background: 'var(--border)' }} />
                  {historial.map((h) => {
                    const meta = EVENTO_META[h.evento] || { label: h.evento, color: 'var(--text-muted)', icon: Info };
                    const Icon = meta.icon;
                    return (
                      <div key={h.id_historial} style={{ position: 'relative', marginBottom: 16 }}>
                        <div style={{
                          position: 'absolute', left: -22, top: 1,
                          width: 16, height: 16, borderRadius: '50%',
                          background: 'var(--surface)', border: `2px solid ${meta.color}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon size={8} style={{ color: meta.color }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '.85rem', color: meta.color }}>{meta.label}</span>
                          <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{fmtFecha(h.creado_en)}</span>
                        </div>
                        <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          {h.usuario_nombre && <span><strong>{h.usuario_nombre}</strong></span>}
                          {h.nombre_proyecto && <span> · Proyecto: {h.nombre_proyecto}</span>}
                          {(h.longitud_antes_cm != null && h.longitud_despues_cm != null) && (
                            <span> · {h.longitud_antes_cm} cm → {h.longitud_despues_cm} cm</span>
                          )}
                        </div>
                        {h.notas && (
                          <div style={{ fontSize: '.74rem', color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                            {h.notas}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-componente: tarjeta de residuo en resultado de búsqueda ─────────────
function ResiduoCard({ r, destacado, onAccion, onRefresh }) {
  return (
    <div style={{
      background: destacado ? 'var(--success-light)' : 'var(--surface-2)',
      border: `1px solid ${destacado ? '#c6e9d7' : 'var(--border)'}`,
      borderRadius: 10, padding: '14px 16px', marginBottom: 10,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      flexWrap: 'wrap', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 10px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '.85rem' }}>
          {r.referencia_perfil}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 900, fontSize: '1.2rem', color: 'var(--success)' }}>
          {r.longitud_cm} cm
        </span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>
          Sobrante si se usa: <strong style={{ color: 'var(--warning)', fontFamily: 'var(--font-mono)' }}>{r.sobrante_si_usa} cm</strong>
        </div>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
          Desperdicio: {r.pct_desperdicio}%
        </div>
      </div>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => onAccion(r.id_residuo, 'reservar', 'post', {})}
      >
        <Lock size={12} style={{ marginRight: 4 }} /> Reservar
      </button>
    </div>
  );
}

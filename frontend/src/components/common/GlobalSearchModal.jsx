/**
 * CorteAlum — GlobalSearchModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de búsqueda global activado con Ctrl+K (Cmd+K en Mac).
 *
 * Características:
 *   - Búsqueda unificada en proyectos, cotizaciones, ventanas, materiales, usuarios
 *   - Resultados agrupados por tipo
 *   - Navegación con teclado: ↑↓ Enter Esc
 *   - Debounce 200ms para no saturar el backend
 *
 * Se monta una sola vez al nivel del App.jsx (ver hook useGlobalSearch).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, Loader, FolderOpen, FileText, Square, Package, User, ArrowUpDown, CornerDownLeft } from 'lucide-react';
import api from '../../api/client';

const TIPO_META = {
  proyectos:    { label: 'Proyectos',    Icon: FolderOpen, color: '#1A56DB', urlBase: '/proyectos/' },
  cotizaciones: { label: 'Cotizaciones', Icon: FileText,   color: '#9333EA', urlBase: '/cotizaciones?id=' },
  ventanas:     { label: 'Ventanas',     Icon: Square,     color: '#0891B2', urlBase: '/proyectos/' },
  materiales:   { label: 'Materiales',   Icon: Package,    color: '#16A34A', urlBase: '/materiales?id=' },
  usuarios:     { label: 'Usuarios',     Icon: User,       color: '#DC2626', urlBase: '/usuarios?id=' },
};

export default function GlobalSearchModal({ open, onClose }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  // Aplanar resultados en una lista única para navegación con teclado
  const flatResults = [];
  for (const tipo of Object.keys(TIPO_META)) {
    for (const item of (results[tipo] || [])) {
      flatResults.push({ tipo, item });
    }
  }

  // Limpiar y enfocar al abrir
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults({});
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounce de búsqueda
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults({}); setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/search', { params: { q: query, limit: 5 } });
        setResults(data);
        setSelectedIdx(0);
      } catch (err) {
        console.error('[search]', err);
        setResults({});
      } finally { setLoading(false); }
    }, 200);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, open]);

  // Navegación con teclado
  const handleKey = useCallback((e) => {
    if (!open) return;
    if (e.key === 'Escape')      { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatResults[selectedIdx]) {
      e.preventDefault();
      navegarA(flatResults[selectedIdx]);
    }
  }, [open, flatResults, selectedIdx, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const navegarA = ({ tipo, item }) => {
    const meta = TIPO_META[tipo];
    if (!meta) return;
    let url = meta.urlBase + item.id;
    if (tipo === 'ventanas')     url = `/proyectos/${item.id_proyecto}?ventana=${item.id}`;
    if (tipo === 'cotizaciones') url = `/cotizaciones?id=${item.id}`;
    onClose();
    navigate(url);
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:9998,
        background:'rgba(15,23,42,0.6)', backdropFilter:'blur(3px)',
        display:'flex', alignItems:'flex-start', justifyContent:'center',
        paddingTop:'10vh', fontFamily:'"DM Sans", system-ui, sans-serif',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:'#fff', borderRadius:14, width:'min(640px, 92vw)',
          maxHeight:'70vh', overflow:'hidden',
          boxShadow:'0 25px 60px -10px rgba(0,0,0,.35)',
          display:'flex', flexDirection:'column',
        }}>
        {/* Search input */}
        <div style={{
          display:'flex', alignItems:'center', gap:10,
          padding:'14px 16px', borderBottom:'1px solid #E2E8F0',
        }}>
          {loading
            ? <Loader size={18} style={{color:'#64748B', animation:'spin 1s linear infinite'}}/>
            : <Search size={18} style={{color:'#64748B'}}/>}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar proyectos, cotizaciones, ventanas, materiales..."
            style={{
              flex:1, border:'none', outline:'none', fontSize:'1rem',
              fontFamily:'inherit', color:'#0F172A',
            }}
          />
          <kbd style={{
            fontSize:'.7rem', padding:'2px 6px', background:'#F1F5F9',
            border:'1px solid #CBD5E1', borderRadius:4, color:'#64748B',
            fontFamily:'inherit',
          }}>ESC</kbd>
          <button onClick={onClose} style={{
            background:'transparent', border:'none', cursor:'pointer',
            color:'#64748B', padding:4,
          }}><X size={18}/></button>
        </div>

        {/* Resultados */}
        <div style={{flex:1, overflowY:'auto', padding:'8px 0'}}>
          {query.length < 2 && (
            <div style={{padding:'24px 18px', textAlign:'center', color:'#94A3B8', fontSize:'.88rem'}}>
              Escribe al menos 2 caracteres para buscar
            </div>
          )}
          {query.length >= 2 && !loading && flatResults.length === 0 && (
            <div style={{padding:'24px 18px', textAlign:'center', color:'#94A3B8', fontSize:'.88rem'}}>
              Sin resultados para "<strong style={{color:'#475569'}}>{query}</strong>"
            </div>
          )}
          {Object.entries(results).map(([tipo, items]) => {
            if (!items?.length) return null;
            const meta = TIPO_META[tipo];
            const Icon = meta.Icon;
            return (
              <div key={tipo} style={{marginBottom:4}}>
                <div style={{
                  padding:'6px 16px', fontSize:'.68rem', fontWeight:700,
                  color:'#64748B', textTransform:'uppercase', letterSpacing:'.08em',
                  background:'#F8FAFC',
                }}>{meta.label}</div>
                {items.map((item, i) => {
                  const flatIdx = flatResults.findIndex(f => f.tipo === tipo && f.item.id === item.id);
                  const isSelected = flatIdx === selectedIdx;
                  return (
                    <div
                      key={`${tipo}-${item.id}`}
                      onClick={() => navegarA({ tipo, item })}
                      onMouseEnter={() => setSelectedIdx(flatIdx)}
                      style={{
                        display:'flex', alignItems:'center', gap:10,
                        padding:'10px 16px', cursor:'pointer',
                        background: isSelected ? '#EFF6FF' : 'transparent',
                        borderLeft: `3px solid ${isSelected ? meta.color : 'transparent'}`,
                      }}>
                      <div style={{
                        width:32, height:32, borderRadius:7,
                        background: `${meta.color}15`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        flexShrink:0,
                      }}>
                        <Icon size={15} color={meta.color}/>
                      </div>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{
                          fontSize:'.9rem', color:'#0F172A', fontWeight:500,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                        }}>{item.label || item.nombre_proyecto || item.nombre_material || `#${item.id}`}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer con atajos */}
        <div style={{
          padding:'8px 16px', borderTop:'1px solid #E2E8F0',
          fontSize:'.7rem', color:'#94A3B8',
          display:'flex', alignItems:'center', gap:14,
        }}>
          <span style={{display:'flex', alignItems:'center', gap:4}}>
            <ArrowUpDown size={11}/> navegar
          </span>
          <span style={{display:'flex', alignItems:'center', gap:4}}>
            <CornerDownLeft size={11}/> abrir
          </span>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

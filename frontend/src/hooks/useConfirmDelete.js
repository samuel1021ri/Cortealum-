/**
 * CorteAlum — Hook para usar ConfirmDeleteModal de forma simple en cualquier
 * lugar del frontend, sin tener que manejar estado manualmente cada vez.
 *
 * Uso típico:
 *
 *   import { useConfirmDelete } from '../../hooks/useConfirmDelete';
 *
 *   function ListaCotizaciones() {
 *     const { confirm, modal } = useConfirmDelete();
 *
 *     const onEliminar = (cot) => confirm({
 *       itemLabel: `la cotización #${cot.id_cotizacion} de ${cot.nombre_proyecto}`,
 *       onConfirm: async (password) => {
 *         await api.delete(`/cotizaciones/${cot.id_cotizacion}`, {
 *           data: { password }
 *         });
 *         toast.success('Cotización eliminada');
 *         recargarLista();
 *       },
 *     });
 *
 *     return (
 *       <>
 *         {...lista con botones onClick={() => onEliminar(cot)}}
 *         {modal}
 *       </>
 *     );
 *   }
 *
 * El hook se encarga de cerrar el modal automáticamente cuando onConfirm
 * resuelve sin error. Si falla con error (ej. contraseña incorrecta), el
 * modal se mantiene abierto mostrando el error.
 */

import { useState, useCallback } from 'react';
import ConfirmDeleteModal from '../components/common/ConfirmDeleteModal';

export function useConfirmDelete() {
  const [config, setConfig] = useState(null);

  const confirm = useCallback((opts) => {
    setConfig(opts || {});
  }, []);

  const close = useCallback(() => setConfig(null), []);

  const handleConfirm = useCallback(async (password) => {
    if (!config?.onConfirm) return;
    // Si onConfirm tira error, el modal NO se cierra y muestra el mensaje
    await config.onConfirm(password);
    // Si llegó aquí, fue exitoso → cerrar
    setConfig(null);
  }, [config]);

  const modal = (
    <ConfirmDeleteModal
      open={config !== null}
      onClose={close}
      onConfirm={handleConfirm}
      itemLabel={config?.itemLabel}
      title={config?.title}
      warningText={config?.warningText}
      confirmButtonText={config?.confirmButtonText}
    />
  );

  return { confirm, modal };
}

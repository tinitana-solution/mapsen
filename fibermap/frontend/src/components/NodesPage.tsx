import { useState, useEffect, useId } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import EditEntityModal from './EditEntityModal';
import {
  ELEMENT_KINDS,
  ELEMENT_LABELS,
  describeElement,
  deleteElement,
  elementEditFields,
  elementEditValues,
  fetchElements,
  fiberCountLabel,
  fiberEditFields,
  readJson,
  updateElement,
  type ElementKind,
  type FiberRecord,
  type NetworkElement,
} from '../lib/network';
import './NodesPage.css';
import DismissibleAlert from './DismissibleAlert';

interface NodesPageProps {
  onViewElement?: (element: NetworkElement) => void;
  onViewFiber?: (fiber: FiberRecord) => void;
}

// "Elementos de Red" es el único lugar para ver todo lo colocado en el mapa: ODF,
// mangas y cajas NAP (puntos) y las fibras (líneas), con búsqueda y filtro por tipo.
export default function NodesPage({ onViewElement, onViewFiber }: NodesPageProps) {
  const [items, setItems] = useState<NetworkElement[]>([]);
  const [fibers, setFibers] = useState<FiberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<ElementKind | 'ALL'>('ALL');
  const [editingItem, setEditingItem] = useState<NetworkElement | null>(null);
  const [editingFiber, setEditingFiber] = useState<FiberRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchId = useId();

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [elements, cables] = await Promise.all([
        fetchElements(),
        apiFetch('/cables').then((res) => readJson(res, 'No se pudieron cargar las fibras')),
      ]);
      setItems(elements);
      setFibers(cables);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la red');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const term = search.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      (kindFilter === 'ALL' || item.kind === kindFilter) &&
      (!term ||
  item.code.toLowerCase().includes(term) ||
  item.name.toLowerCase().includes(term) ||
  String(item.lat).includes(term) ||
  String(item.lng).includes(term)),
  );
  const visibleFibers = kindFilter === 'ALL' ? fibers.filter((f) => !term || f.code.toLowerCase().includes(term)) : [];

  const handleDelete = async (item: NetworkElement) => {
    if (!window.confirm(`¿Seguro que quieres eliminar "${item.code}"?`)) return;
    try {
      await deleteElement(item);
      fetchAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar el elemento');
    }
  };

  const handleUpdateItem = async (values: Record<string, any>) => {
    if (!editingItem) return;
    await updateElement(editingItem, values);
    setEditingItem(null);
    fetchAll();
  };

  const handleUpdateFiber = async (values: Record<string, any>) => {
    if (!editingFiber) return;
    const res = await apiFetch(`/cables/${editingFiber.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: values.name, fiberCount: Number(values.fiberCount), status: values.status }),
    });
    await readJson(res, 'No se pudo actualizar la fibra');
    setEditingFiber(null);
    fetchAll();
  };

  const handleDeleteFiber = async (fiber: FiberRecord) => {
    if (!window.confirm(`¿Eliminar la fibra "${fiber.code}"?`)) return;
    try {
      await readJson(await apiFetch(`/cables/${fiber.id}`, { method: 'DELETE' }), 'No se pudo eliminar la fibra');
      fetchAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar la fibra');
    }
  };

  return (
    <div className="nodes-page">
      <div className="nodes-header">
        <h2>Elementos de Red</h2>
        <div className="nodes-actions">
          <label className="visually-hidden" htmlFor={searchId}>Buscar por nombre o código</label>
          <input
            id={searchId}
            type="text"
            placeholder="Buscar por nombre o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <button className="btn-secondary" onClick={fetchAll} aria-label="Actualizar lista de elementos" title="Actualizar lista">
            <RefreshCw size={14} aria-hidden="true" /> Actualizar
          </button>
        </div>
      </div>

      <div className="kind-filter" role="group" aria-label="Filtrar por tipo">
        {(['ALL', ...ELEMENT_KINDS] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={`kind-chip ${kindFilter === kind ? 'active' : ''}`}
            aria-pressed={kindFilter === kind}
            onClick={() => setKindFilter(kind)}
          >
            {kind === 'ALL' ? 'Todos' : ELEMENT_LABELS[kind]}
          </button>
        ))}
      </div>

      {error && <DismissibleAlert className="nodes-error" onClose={() => setError(null)}>{error}</DismissibleAlert>}

      <div className="nodes-table-container" aria-live="polite">
        {loading ? (
          <p>Cargando elementos...</p>
        ) : (
          <table className="nodes-table">
            <caption className="visually-hidden">Lista de ODF, mangas y cajas NAP</caption>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Código</th>
                <th>Detalle</th>
                <th>Estado</th>
                <th>Lat / Lng</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center' }}>No hay elementos encontrados</td></tr>
              ) : (
                visible.map((item) => (
                  <tr key={`${item.kind}-${item.id}`}>
                    <td><span className={`badge type-${item.kind.toLowerCase()}`}>{ELEMENT_LABELS[item.kind]}</span></td>
                    <td>{item.code}</td>
                    <td>{describeElement(item)}</td>
                    <td><span className={`badge status-${item.status.toLowerCase()}`}>{item.status}</span></td>
                    <td>{item.lat.toFixed(5)}, {item.lng.toFixed(5)}</td>
                    <td>
                      <button className="btn-action view" onClick={() => onViewElement?.(item)} aria-label={`Ver ${item.code} en el mapa`}>Ver</button>
                      <button className="btn-action edit" onClick={() => setEditingItem(item)} aria-label={`Editar ${item.code}`}>Editar</button>
                      <button className="btn-action delete" onClick={() => handleDelete(item)} aria-label={`Eliminar ${item.code}`}>Eliminar</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {!loading && kindFilter === 'ALL' && (
        <>
          <h3 className="nodes-subtitle">Fibras ({visibleFibers.length})</h3>
          <div className="nodes-table-container">
            <table className="nodes-table">
              <caption className="visually-hidden">Lista de fibras tendidas</caption>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Hilos</th>
                  <th>Largo</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleFibers.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center' }}>No hay fibras registradas. Trázalas desde el mapa.</td></tr>
                ) : (
                  visibleFibers.map((fiber) => (
                    <tr key={fiber.id}>
                      <td>{fiber.code}</td>
                      <td>{fiberCountLabel(fiber.fiberCount)}</td>
                      <td>{fiber.calculatedLengthMeters ? `${Math.round(Number(fiber.calculatedLengthMeters))} m` : '-'}</td>
                      <td><span className={`badge status-${fiber.status.toLowerCase()}`}>{fiber.status}</span></td>
                      <td>
                        <button className="btn-action view" onClick={() => onViewFiber?.(fiber)} aria-label={`Ver ${fiber.code} en el mapa`}>Ver</button>
                        <button className="btn-action edit" onClick={() => setEditingFiber(fiber)} aria-label={`Editar ${fiber.code}`}>Editar</button>
                        <button className="btn-action delete" onClick={() => handleDeleteFiber(fiber)} aria-label={`Eliminar ${fiber.code}`}>Eliminar</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editingItem && (
        <EditEntityModal
          title={`Editar ${ELEMENT_LABELS[editingItem.kind]}: ${editingItem.code}`}
          initialValues={elementEditValues(editingItem)}
          onClose={() => setEditingItem(null)}
          onSave={handleUpdateItem}
          fields={elementEditFields(editingItem)}
        />
      )}

      {editingFiber && (
        <EditEntityModal
          title={`Editar fibra: ${editingFiber.code}`}
          initialValues={{ ...editingFiber, fiberCount: String(editingFiber.fiberCount) }}
          onClose={() => setEditingFiber(null)}
          onSave={handleUpdateFiber}
          fields={fiberEditFields}
        />
      )}
    </div>
  );
}

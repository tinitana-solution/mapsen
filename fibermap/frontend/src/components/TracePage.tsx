import { useEffect, useId, useRef, useState } from 'react';
import { Layers, Search, X } from 'lucide-react';
import { apiFetch, apiJson, apiList } from '../lib/api';
import { fiberColorHex, fiberColorLabel, serviceText, textOnColor } from '../lib/fiberColors';
import { readJson } from '../lib/network';
import DismissibleAlert from './DismissibleAlert';
import './FiberTable.css';
import './TracePage.css';

export type TraceDeviceKind = 'ODF' | 'MANGA' | 'NAP';

interface Origin {
  id: string;
  code: string;
  name: string | null;
  kind: TraceDeviceKind;
}

interface OriginTable {
  device: { id: string; code: string; name: string | null; kind: TraceDeviceKind };
  cables: Array<{
    cableId: string;
    code: string;
    buffers: Array<{
      number: number;
      color: string;
      fibers: Array<{ id: string; number: number; color: string; status: string; service: string | null }>;
    }>;
  }>;
}

interface TraceStep {
  id: number;
  parent: number | null;
  how: 'origin' | 'cable' | 'splice' | 'splitter';
  deviceType: TraceDeviceKind;
  deviceId: string;
  deviceName: string;
  portLabel: string | null;
  fiberId: string;
  cableCode: string;
  fiberNumber: number;
  fiberColor: string;
}

interface FiberTrace {
  fibers: Array<{ fiberId: string; steps: TraceStep[]; truncated: boolean }>;
}

interface TracePageProps {
  initialBoxId?: string | null;
  initialDeviceKind?: TraceDeviceKind | null;
  initialFiberId?: string | null;
  onConsumeInitialBoxId?: () => void;
  onOpenConnections: (kind: TraceDeviceKind, id: string) => void;
}

const KIND_LABEL = { ODF: 'ODF', MANGA: 'Manga', NAP: 'Caja NAP' };
const STEP_LABEL = { origin: 'Origen', cable: 'Tramo de cable', splice: 'Fusión', splitter: 'Splitter' };
const deviceEndpoint = (kind: TraceDeviceKind | null) => kind === 'ODF' ? 'odfs' : 'boxes';
const destinationService = (name: string) => 'TO ' + name.toUpperCase();

function TraceResult({ steps, truncated, onOpenConnections, fiberId, service, registering, onRegister }: {
  steps: TraceStep[];
  truncated: boolean;
  onOpenConnections: TracePageProps['onOpenConnections'];
  fiberId: string;
  service: string | null | undefined;
  registering: boolean;
  onRegister: (deviceName: string) => void;
}) {
  const [branchId, setBranchId] = useState('');
  const byId = new Map(steps.map((step) => [step.id, step]));
  const parents = new Set(steps.map((step) => step.parent));
  const endpoints = steps.filter((step) => !parents.has(step.id));
  const branch = endpoints.find((step) => String(step.id) === branchId);
  const path: TraceStep[] = [];
  for (let step = branch; step; step = step.parent === null ? undefined : byId.get(step.parent)) {
    path.push(step);
  }
  const rows = branch ? path.reverse() : steps;
  const deviceCount = new Set(steps.map((step) => step.deviceId)).size;
  const splices = steps.filter((step) => step.how === 'splice').length;
  const splitterRoutes = steps.filter((step) => step.how === 'splitter').length;
  const canRegister = (step: TraceStep) => step.how === 'cable' && step.deviceType === 'NAP' && step.fiberId === fiberId;
  const showService = rows.some(canRegister);

  return (
    <section className="trace-result" aria-label="Resultado del trazado">
      <p className="trace-summary" role="status">
        {steps.length <= 1 ? 'Sin continuidad registrada desde este hilo.' : (
          <><strong>{deviceCount}</strong> dispositivos · <strong>{splices}</strong> fusiones · <strong>{splitterRoutes}</strong> pasos por splitter</>
        )}
      </p>
      {truncated && <p className="trace-error" role="status">Se alcanzó el límite de pasos. El recorrido es parcial.</p>}
      {endpoints.length > 1 && (
        <label className="trace-field trace-branch">
          Rama del recorrido
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="">Todas las ramas</option>
            {endpoints.map((step) => (
              <option key={step.id} value={step.id}>
                Paso {step.id + 1} · {step.deviceName} · {step.cableCode}, hilo {step.fiberNumber}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="fiber-table-wrap">
        <table className="fiber-table trace-path-table">
          <caption className="visually-hidden">Continuidad registrada del hilo</caption>
          <thead>
            <tr>
              <th scope="col">Paso</th>
              <th scope="col">Dispositivo</th>
              <th scope="col">Continuidad</th>
              <th scope="col">Cable e hilo</th>
              <th scope="col">Puerto</th>
              {showService && <th scope="col">Servicio</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((step) => (
              <tr key={step.id}>
                <td>{step.id + 1}{step.parent !== null && <small>Desde {step.parent + 1}</small>}</td>
                <td>
                  <button type="button" className="trace-device-link" onClick={() => onOpenConnections(step.deviceType, step.deviceId)}>
                    {step.deviceName}
                  </button>
                  <small>{KIND_LABEL[step.deviceType]}</small>
                </td>
                <td>
                  {STEP_LABEL[step.how]}
                  {!parents.has(step.id) && step.id !== 0 && <small>Fin del recorrido registrado</small>}
                </td>
                <td>
                  {step.cableCode}
                  <span className="trace-fiber-chip" style={{ background: fiberColorHex(step.fiberColor), color: textOnColor(step.fiberColor) }}>
                    {step.fiberNumber} · {fiberColorLabel(step.fiberColor)}
                  </span>
                </td>
                <td>{step.portLabel ?? '—'}</td>
                {showService && <td>
                  {canRegister(step) && (service === destinationService(step.deviceName) ? 'Registrado' : (
                    <button type="button" className="btn-secondary" disabled={registering} onClick={() => onRegister(step.deviceName)}>
                      Registrar servicio
                    </button>
                  ))}
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TraceWorkspace({ origin, initialFiberId, onOpenConnections, onChangeOrigin }: {
  origin: { id: string; kind: TraceDeviceKind | null };
  initialFiberId: string | null;
  onOpenConnections: TracePageProps['onOpenConnections'];
  onChangeOrigin: () => void;
}) {
  const [table, setTable] = useState<OriginTable | null>(null);
  const [cableId, setCableId] = useState('');
  const [fiberId, setFiberId] = useState('');
  const [result, setResult] = useState<FiberTrace['fibers'][number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracing, setTracing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const traceRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const request = new AbortController();
    const path = '/' + deviceEndpoint(origin.kind) + '/' + origin.id + '/table';
    apiJson<OriginTable>(path, { signal: request.signal }, 'No se pudo cargar el origen')
      .then((data) => {
        if (request.signal.aborted) return;
        setTable(data);
        const match = data.cables.find((cable) => cable.buffers.some((buffer) => buffer.fibers.some((fiber) => fiber.id === initialFiberId)));
        setCableId(match?.cableId ?? (data.cables.length === 1 ? data.cables[0].cableId : ''));
        setFiberId(match && initialFiberId ? initialFiberId : '');
      })
      .catch((err: unknown) => { if (!request.signal.aborted) setError((err as Error).message); })
      .finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => {
      request.abort();
      traceRequest.current?.abort();
    };
  }, [origin, initialFiberId]);

  const handleTrace = async () => {
    if (!table || !fiberId) return;
    const request = new AbortController();
    traceRequest.current = request;
    setTracing(true);
    setError(null);
    setResult(null);
    try {
      const type = table.device.kind === 'ODF' ? 'odf' : 'box';
      const path = '/trace/' + type + '/' + table.device.id + '?' + new URLSearchParams({ fiberId });
      const trace = await apiJson<FiberTrace>(path, { signal: request.signal }, 'No se pudo trazar el hilo');
      const traced = trace.fibers.find((fiber) => fiber.fiberId === fiberId);
      if (!traced) throw new Error('El servidor no devolvió la traza del hilo seleccionado');
      if (!request.signal.aborted) setResult(traced);
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : 'No se pudo trazar el hilo');
    } finally {
      if (!request.signal.aborted) setTracing(false);
    }
  };

  const cable = table?.cables.find((item) => item.cableId === cableId);
  const selectedFiber = cable?.buffers.flatMap((buffer) => buffer.fibers).find((fiber) => fiber.id === fiberId);
  const registerService = async (deviceName: string) => {
    const service = destinationService(deviceName);
    setRegistering(true);
    setError(null);
    try {
      await readJson(await apiFetch('/fibers/' + fiberId + '/configuration', {
        method: 'PATCH',
        body: JSON.stringify({ label: service, status: 'USED' }),
      }), 'No se pudo registrar el servicio');
      setTable((current) => current && ({
        ...current,
        cables: current.cables.map((item) => item.cableId !== cableId ? item : ({
          ...item,
          buffers: item.buffers.map((buffer) => ({
            ...buffer,
            fibers: buffer.fibers.map((fiber) => fiber.id !== fiberId ? fiber : { ...fiber, service, status: 'USED' }),
          })),
        })),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el servicio');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <section className="trace-panel">
      <div className="trace-header">
        <div>
          <h3>{table?.device.name || table?.device.code || 'Dispositivo de origen'}</h3>
          {table && <span className="box-editor-type">{KIND_LABEL[table.device.kind]} · {table.device.code}</span>}
        </div>
        <button type="button" className="btn-secondary" onClick={onChangeOrigin}>
          <Search size={14} aria-hidden="true" /> Cambiar origen
        </button>
      </div>
      {loading && <p className="muted" role="status">Cargando cables e hilos…</p>}
      {error && <DismissibleAlert className="trace-error" onClose={() => setError(null)}>{error}</DismissibleAlert>}
      {table && (table.cables.length === 0 ? <p className="muted">El dispositivo aún no tiene cables conectados.</p> : (
        <form className="trace-form" onSubmit={(event) => { event.preventDefault(); void handleTrace(); }}>
          <label className="trace-field">
            Cable
            <select value={cableId} disabled={tracing || registering} onChange={(event) => { setCableId(event.target.value); setFiberId(''); setResult(null); setError(null); }}>
              <option value="">Selecciona un cable</option>
              {table.cables.map((item) => <option key={item.cableId} value={item.cableId}>{item.code}</option>)}
            </select>
          </label>
          <label className="trace-field">
            Hilo
            <select value={fiberId} disabled={!cable?.buffers.length || tracing || registering} onChange={(event) => { setFiberId(event.target.value); setResult(null); setError(null); }}>
              <option value="">{cable && !cable.buffers.length ? 'Sin hilos en el rango' : 'Selecciona un hilo'}</option>
              {cable?.buffers.map((buffer) => (
                <optgroup key={buffer.number} label={'Buffer ' + buffer.number + ' · ' + fiberColorLabel(buffer.color)}>
                  {buffer.fibers.map((fiber) => (
                    <option key={fiber.id} value={fiber.id}>
                      Hilo {fiber.number} · {fiberColorLabel(fiber.color)} · {serviceText(fiber.service, fiber.status)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-primary" disabled={!fiberId || tracing || registering}>{tracing ? 'Trazando…' : 'Trazar hilo'}</button>
        </form>
      ))}
      {result && <TraceResult {...result} onOpenConnections={onOpenConnections} fiberId={fiberId}
        service={selectedFiber?.service} registering={registering} onRegister={registerService} />}
    </section>
  );
}

export default function TracePage({ initialBoxId, initialDeviceKind, initialFiberId, onConsumeInitialBoxId, onOpenConnections }: TracePageProps) {
  const [selection, setSelection] = useState<{ origin: { id: string; kind: TraceDeviceKind | null }; fiberId: string | null } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [term, setTerm] = useState('');
  const searchTitle = useId();
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initialBoxId) return;
    setSelection({ origin: { id: initialBoxId, kind: initialDeviceKind ?? null }, fiberId: initialFiberId ?? null });
    onConsumeInitialBoxId?.();
  }, [initialBoxId, initialDeviceKind, initialFiberId, onConsumeInitialBoxId]);

  useEffect(() => {
    if (!searching) return;
    searchInput.current?.focus();
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSearching(false); };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [searching]);

  const openSearch = async () => {
    setSearching(true);
    setSearchLoading(true);
    setSearchError(null);
    setTerm('');
    try {
      type DeviceOption = Omit<Origin, 'kind'>;
      const [boxes, odfs] = await Promise.all([
        apiList<DeviceOption & { type: string }>('/boxes', 'No se pudieron cargar las cajas'),
        apiList<DeviceOption>('/odfs', 'No se pudieron cargar los ODF'),
      ]);
      const options: Origin[] = [
        ...odfs.map((odf): Origin => ({ ...odf, kind: 'ODF' })),
        ...boxes.filter((box) => box.type === 'NAP' || box.type === 'MANGA')
          .map((box): Origin => ({ ...box, kind: box.type === 'NAP' ? 'NAP' : 'MANGA' })),
      ];
      setOrigins(options.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'No se pudieron cargar los dispositivos');
    } finally {
      setSearchLoading(false);
    }
  };
  const query = term.trim().toLowerCase();
  const matches = origins.filter((origin) => origin.code.toLowerCase().includes(query) || origin.name?.toLowerCase().includes(query));

  return (
    <div className="view-panel">
      <header className="panel-header">
        <h2>Trazabilidad de fibra</h2>
        <p>Sigue un hilo desde un ODF, una manga o una caja NAP.</p>
      </header>
      <div className="trace-workspace">
        {selection ? (
          <TraceWorkspace key={selection.origin.id + ':' + selection.fiberId} origin={selection.origin}
            initialFiberId={selection.fiberId} onChangeOrigin={openSearch} onOpenConnections={onOpenConnections} />
        ) : (
          <div className="empty-state">
            <Layers size={48} className="empty-icon" aria-hidden="true" />
            <button type="button" className="btn-primary" onClick={openSearch}>Elegir origen</button>
          </div>
        )}
      </div>
      {searching && (
        <div className="modal-backdrop" onClick={() => setSearching(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby={searchTitle} onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3 id={searchTitle}>Elegir origen</h3>
              <button type="button" className="btn-icon icon-button" onClick={() => setSearching(false)} aria-label="Cerrar búsqueda"><X size={18} /></button>
            </header>
            <input ref={searchInput} className="modal-search" placeholder="Código o nombre" aria-label="Buscar por código o nombre"
              value={term} onChange={(event) => setTerm(event.target.value)} />
            {searchLoading && <p className="muted" role="status">Cargando dispositivos…</p>}
            {searchError && <DismissibleAlert className="trace-error" onClose={() => setSearchError(null)}>{searchError}</DismissibleAlert>}
            {!searchLoading && !searchError && (
              <ul className="modal-list trace-origin-list">
                {matches.length === 0 && <li className="muted">No se encontraron dispositivos.</li>}
                {matches.map((origin) => (
                  <li key={origin.kind + ':' + origin.id}>
                    <button type="button" onClick={() => { setSelection({ origin, fiberId: null }); setSearching(false); }}>
                      <strong>{origin.code}</strong> {origin.name && <span>{origin.name}</span>}
                      <small>{KIND_LABEL[origin.kind]}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

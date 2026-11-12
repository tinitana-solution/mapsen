import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Cable, GitFork } from 'lucide-react';
import { fiberColorHex, fiberColorLabel, textOnColor } from '../lib/fiberColors';
import './FiberContinuityBoard.css';

export interface BoardFiber { id: string; number: number; color: string; status: string; service: string | null; description?: string | null; links?: string[]; }
export interface BoardCable { cableId: string; code: string; role: string; buffers: Array<{ number: number; color: string; fibers: BoardFiber[] }>; }
export interface BoardTerminal { key: string; group: string; label: string; status: string; splitter?: { id: string; code: string; name: string | null; ratio: string }; fibers: Array<{ fiberId: string; cableId: string; cableCode: string; number: number; color: string; linkId?: string }>; connectionIds: string[]; }
export interface BoardFiberMapping { id: string; inputFiberId: string; outputFiberId: string; }
interface Point { x: number; y: number }
interface SelectedFiber { fiber: BoardFiber; cableCode: string; side: 'IN' | 'OUT' }
interface BoardSplitterFigure { id: string; title: string; code: string; ratio: string; input?: BoardTerminal; outputs: BoardTerminal[]; }
interface Props {
  cables: BoardCable[];
  terminals: BoardTerminal[];
  directMappings?: BoardFiberMapping[];
  busy?: boolean;
  onSplice?: (source: BoardFiber, sourceCable: string, target: BoardFiber, targetCable: string) => Promise<void>;
  onRemoveSplice?: (connectionId: string) => Promise<void>;
  onOpenFusion?: () => void;
  onSaveDescription?: (fiber: BoardFiber, description: string) => Promise<void>;
  onCreateSplitter?: (ratio: '1:8' | '1:16', name: string) => Promise<void>;
  onRemoveSplitter?: (splitterId: string, splitterName: string, connectionCount: number) => Promise<void>;
  onConnect: (fiber: BoardFiber, cableCode: string, terminal: BoardTerminal) => Promise<void>;
}

const isInputCable = (cable: BoardCable) => cable.role !== 'START';
const isOutputCable = (cable: BoardCable) => cable.role !== 'END';
const pointKey = (side: 'IN' | 'OUT', fiberId: string) => `${side}:${fiberId}`;
const terminalPointKey = (terminalKey: string) => `TERMINAL:${terminalKey}`;
// Conector ortogonal, como draw.io: sale recto del hilo, cambia de dirección solo en ángulos de
// 90° y vuelve a entrar recto. Sus puntos se recalculan cuando el panel cambia de tamaño.
const orthogonalPath = (from: Point, to: Point) => {
  const horizontalDistance = Math.abs(to.x - from.x);
  if (Math.abs(to.y - from.y) < 1 || horizontalDistance < 1) return `M ${from.x} ${from.y} H ${to.x}`;
  const middleX = from.x + (to.x - from.x) / 2;
  return `M ${from.x} ${from.y} H ${middleX} V ${to.y} H ${to.x}`;
};

// Los puertos del splitter no son iguales a los extremos de un hilo: la entrada está en su base y
// las salidas en su parte superior. Cada ruta sale y llega por el lado físico correcto.
const splitterInputPath = (from: Point, to: Point) => {
  const laneX = from.x + 38;
  // El recorrido se aproxima por arriba del símbolo. De esta forma no aparece un codo ni una
  // línea horizontal por debajo del splitter; el último tramo queda detrás del símbolo hasta la
  // entrada lógica que se guardó en la conexión.
  const aboveSplitter = to.y - 178;
  return `M ${from.x} ${from.y} H ${laneX} V ${aboveSplitter} H ${to.x} V ${to.y}`;
};
const splitterOutputPath = (from: Point, to: Point) => {
  const aboveOutput = from.y - 32;
  const beforeFiber = to.x - 32;
  return `M ${from.x} ${from.y} V ${aboveOutput} H ${beforeFiber} V ${to.y} H ${to.x}`;
};

// Hoja de empalme visual: los dos lados tienen la misma jerarquía cable → buffer → hilo.
// Las líneas están sobre SVG sin eventos, por lo que no bloquean ninguna selección o arrastre.
function FiberDescriptionInput({ fiber, disabled, onSave }: { fiber: BoardFiber; disabled: boolean; onSave: (fiber: BoardFiber, description: string) => Promise<void> }) {
  const [value, setValue] = useState(fiber.description ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(fiber.description ?? ''), [fiber.description, fiber.id]);
  const commit = async () => {
    const description = value.trim();
    if (description === (fiber.description ?? '')) return;
    setSaving(true);
    try { await onSave(fiber, description); } finally { setSaving(false); }
  };
  return <input className="splice-fiber-description" value={value} disabled={disabled || saving} placeholder="Descripción" aria-label={`Descripción del hilo ${fiber.number}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onChange={(event) => setValue(event.target.value)} onBlur={() => void commit()} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.preventDefault(); setValue(fiber.description ?? ''); } }} />;
}

export default function FiberContinuityBoard({ cables, terminals, directMappings = [], busy = false, onSplice, onRemoveSplice, onOpenFusion, onSaveDescription, onCreateSplitter, onRemoveSplitter, onConnect }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const fiberRefs = useRef(new Map<string, HTMLElement>());
  const terminalRefs = useRef(new Map<string, HTMLElement>());
  const suppressNextFiberClick = useRef(false);
  const [points, setPoints] = useState<{ fibers: Map<string, Point>; terminals: Map<string, Point> }>({ fibers: new Map(), terminals: new Map() });
  const [selected, setSelected] = useState<SelectedFiber | null>(null);
  const [dragging, setDragging] = useState<(SelectedFiber & { from: Point; cursor: Point }) | null>(null);
  const [boardNotice, setBoardNotice] = useState<string | null>(null);
  const [removalMode, setRemovalMode] = useState(false);
  const [highlightedConnectionId, setHighlightedConnectionId] = useState<string | null>(null);
  const [splitterName, setSplitterName] = useState('');
  const [visibleConnections, setVisibleConnections] = useState<'all' | 'direct' | 'splitter' | 'none'>('all');
  const showDirect = visibleConnections === 'all' || visibleConnections === 'direct';
  const showSplitters = visibleConnections === 'all' || visibleConnections === 'splitter';
  const inputCables = cables.filter(isInputCable);
  const outputCables = cables.filter(isOutputCable);
  const mappedInputFiberIds = new Set(directMappings.map((mapping) => mapping.inputFiberId));
  const mappedOutputFiberIds = new Set(directMappings.map((mapping) => mapping.outputFiberId));
  const cableById = new Map(cables.map((cable) => [cable.cableId, cable]));
  const splitterFigures = (() => {
    const byId = new Map<string, BoardSplitterFigure>();
    for (const terminal of terminals) {
      const isInput = terminal.key.startsWith('SPLITTER_INPUT:');
      const isOutput = terminal.key.startsWith('SPLITTER_OUTPUT:');
      if (!isInput && !isOutput) continue;
      const splitter = terminal.splitter;
      const id = splitter?.id ?? terminal.group;
      const current = byId.get(id) ?? {
        id,
        title: splitter?.name || splitter?.code || terminal.group.replace(/^Splitter\s+/, ''),
        code: splitter?.code || terminal.group.replace(/^Splitter\s+/, ''),
        ratio: splitter?.ratio || terminal.group.match(/\(1:(?:8|16)\)/)?.[0].slice(1, -1) || '',
        outputs: [],
      };
      if (isInput) current.input = terminal;
      else current.outputs.push(terminal);
      byId.set(id, current);
    }
    return [...byId.values()].map((splitter) => ({ ...splitter, outputs: splitter.outputs.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })) }));
  })();
  const fiberLabels = new Map<string, string>();
  for (const cable of cables) {
    for (const buffer of cable.buffers) {
      for (const fiber of buffer.fibers) {
        fiberLabels.set(fiber.id, `${cable.code} · hilo ${fiber.number}`);
      }
    }
  }
  const connectionsById = new Map<string, string[]>();
  for (const mapping of directMappings) {
    connectionsById.set(mapping.id, [
      fiberLabels.get(mapping.inputFiberId) ?? 'Hilo de entrada',
      fiberLabels.get(mapping.outputFiberId) ?? 'Hilo de salida',
    ]);
  }
  // Incluir también enlaces de terminales aunque no tengan hilos visibles.
  for (const terminal of terminals) {
    for (const connectionId of terminal.connectionIds) {
      const labels = connectionsById.get(connectionId) ?? [];
      if (!labels.includes(terminal.label)) labels.push(terminal.label);
      connectionsById.set(connectionId, labels);
    }
  }
  const removableConnections = [...connectionsById.entries()].map(([id, labels]) => ({ id, label: labels.join(' ⟷ ') }));
  const removeSingleConnection = (connectionId: string) => {
    if (!removalMode || !onRemoveSplice || busy) return;
    void onRemoveSplice(connectionId);
  };

  const updatePoints = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const boardRect = board.getBoundingClientRect();
    const center = (element: HTMLElement): Point => { const rect = element.getBoundingClientRect(); return { x: rect.left - boardRect.left + rect.width / 2, y: rect.top - boardRect.top + rect.height / 2 }; };
    const terminalAnchor = (key: string, element: HTMLElement): Point => {
      const rect = element.getBoundingClientRect();
      const x = rect.left - boardRect.left + rect.width / 2;
      // La entrada física se ubica en la punta inferior y los puertos de salida comienzan ocho
      // píxeles por encima del botón, donde termina la pequeña barra vertical del símbolo.
      if (key.startsWith('SPLITTER_INPUT:')) return { x, y: rect.bottom - boardRect.top };
      if (key.startsWith('SPLITTER_OUTPUT:')) return { x, y: rect.top - boardRect.top - 8 };
      return center(element);
    };
    setPoints({ fibers: new Map([...fiberRefs.current.entries()].map(([key, el]) => [key, center(el)])), terminals: new Map([...terminalRefs.current.entries()].map(([key, el]) => [key, terminalAnchor(key, el)])) });
  }, []);
  const bindTerminalRef = (key: string) => (element: HTMLElement | null) => {
    if (element) terminalRefs.current.set(key, element);
    else terminalRefs.current.delete(key);
  };

  useLayoutEffect(() => {
    updatePoints();
    const observer = new ResizeObserver(updatePoints);
    if (boardRef.current) observer.observe(boardRef.current);
    window.addEventListener('resize', updatePoints);
    return () => { observer.disconnect(); window.removeEventListener('resize', updatePoints); };
  }, [cables, terminals, updatePoints, visibleConnections]);

  const freeSpliceTerminal = () => terminals.find((terminal) => terminal.fibers.length === 0 && (terminal.key.startsWith('BOX_PORT_NUMBER:') || terminal.key.startsWith('BOX_PORT:')));
  const connectToTerminal = async (item: SelectedFiber, terminal: BoardTerminal) => { await onConnect(item.fiber, item.cableCode, terminal); setSelected(null); };
  const splice = async (source: SelectedFiber, target: SelectedFiber) => {
    if (source.side === target.side || source.fiber.id === target.fiber.id) return;
    if (onSplice) {
      await onSplice(source.fiber, source.cableCode, target.fiber, target.cableCode);
      setSelected(null);
      return;
    }
    const terminal = freeSpliceTerminal();
    if (!terminal) {
      setBoardNotice('No hay un puerto de empalme libre. Aumenta la capacidad de la manga o libera uno.');
      return;
    }
    setBoardNotice(null);
    await onConnect(source.fiber, source.cableCode, terminal);
    await onConnect(target.fiber, target.cableCode, terminal);
    setSelected(null);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => { const rect = boardRef.current?.getBoundingClientRect(); if (rect) setDragging((current) => current ? { ...current, cursor: { x: event.clientX - rect.left, y: event.clientY - rect.top } } : null); };
    const end = async (event: PointerEvent) => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const terminalKey = element?.closest<HTMLElement>('[data-splice-terminal]')?.dataset.spliceTerminal;
      const fiberKey = element?.closest<HTMLElement>('[data-sheet-fiber]')?.dataset.sheetFiber;
      const active = dragging;
      setDragging(null);
      if (busy || !active) return;
      const terminal = terminals.find((item) => item.key === terminalKey);
      if (terminal) { await connectToTerminal(active, terminal); return; }
      if (!fiberKey) return;
      const [side, fiberId] = fiberKey.split(':') as ['IN' | 'OUT', string];
      const cable = (side === 'IN' ? inputCables : outputCables).find((item) => item.buffers.some((buffer) => buffer.fibers.some((fiber) => fiber.id === fiberId)));
      const fiber = cable?.buffers.flatMap((buffer) => buffer.fibers).find((item) => item.id === fiberId);
      if (cable && fiber) {
        const target = { fiber, cableCode: cable.code, side };
        // Un clic corto sobre el segundo hilo también completa el empalme. Se conserva la selección
        // previa; en un arrastre se toma el hilo desde el que comenzó el gesto.
        const source = selected && selected.side !== target.side ? selected : active;
        if (source.fiber.id !== target.fiber.id && source.side !== target.side) {
          suppressNextFiberClick.current = true;
          await splice(source, target);
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
  }, [busy, dragging, inputCables, outputCables, selected, terminals]);

  const chooseFiber = (item: SelectedFiber) => {
    if (busy || item.fiber.links?.length) return;
    if (selected && selected.side !== item.side) { void splice(selected, item); return; }
    setSelected((current) => current?.fiber.id === item.fiber.id && current.side === item.side ? null : item);
  };
  const beginDrag = (event: React.PointerEvent<HTMLElement>, item: SelectedFiber) => {
    if (busy || item.fiber.links?.length) return;
    const from = points.fibers.get(pointKey(item.side, item.fiber.id)); const rect = boardRef.current?.getBoundingClientRect();
    if (!from || !rect) return;
    // No cambiamos `selected` todavía: así el clic en un segundo hilo conserva la primera
    // selección y puede unir ambos lados. Si se arrastra, `dragging` es quien lleva el origen.
    event.preventDefault(); setDragging({ ...item, from, cursor: { x: event.clientX - rect.left, y: event.clientY - rect.top } });
  };

  const lines: Array<{ id: string; from: string; to: string; sourceColor: string; targetColor: string; route?: 'SPLITTER_INPUT' | 'SPLITTER_OUTPUT'; removable?: boolean; connectionId?: string }> = [];
  const inputFibers = new Map(inputCables.flatMap((cable) => cable.buffers.flatMap((buffer) => buffer.fibers.map((fiber) => [fiber.id, fiber] as const))));
  const outputFibers = new Map(outputCables.flatMap((cable) => cable.buffers.flatMap((buffer) => buffer.fibers.map((fiber) => [fiber.id, fiber] as const))));
  for (const mapping of directMappings) {
    const source = inputFibers.get(mapping.inputFiberId);
    const target = outputFibers.get(mapping.outputFiberId);
    if (source && target) lines.push({ id: `direct-${mapping.id}`, from: pointKey('IN', mapping.inputFiberId), to: pointKey('OUT', mapping.outputFiberId), sourceColor: source.color, targetColor: target.color, removable: true, connectionId: mapping.id });
  }
  for (const terminal of terminals) {
    if (terminal.key.startsWith('SPLITTER_') || terminal.fibers.length < 2) continue;
    const first = terminal.fibers.find((fiber) => { const cable = cableById.get(fiber.cableId); return cable && isInputCable(cable); });
    const second = terminal.fibers.find((fiber) => { const cable = cableById.get(fiber.cableId); return fiber.fiberId !== first?.fiberId && cable && isOutputCable(cable); });
    if (first && second) lines.push({ id: terminal.key, from: pointKey('IN', first.fiberId), to: pointKey('OUT', second.fiberId), sourceColor: first.color, targetColor: second.color });
  }
  // El splitter solo recibe trazos cuando hay un enlace registrado a uno de sus puertos. Al crearlo,
  // todos sus puertos están libres y por tanto no aparece ninguna línea automática.
  for (const splitter of splitterFigures) {
    const inputFiber = splitter.input?.fibers[0];
    const inputCable = inputFiber ? cableById.get(inputFiber.cableId) : undefined;
    const inputConnectionId = splitter.input?.connectionIds[0];
    if (inputFiber && inputCable && inputConnectionId && isInputCable(inputCable) && splitter.input) {
      lines.push({
        id: `splitter-input-${inputConnectionId}`,
        from: pointKey('IN', inputFiber.fiberId),
        to: terminalPointKey(splitter.input.key),
        sourceColor: inputFiber.color,
        targetColor: inputFiber.color,
        route: 'SPLITTER_INPUT',
        removable: true,
        connectionId: inputConnectionId,
      });
    }
    for (const output of splitter.outputs) {
      const outputFiber = output.fibers[0];
      const outputCable = outputFiber ? cableById.get(outputFiber.cableId) : undefined;
      const outputConnectionId = output.connectionIds[0];
      if (!outputFiber || !outputCable || !outputConnectionId || !isOutputCable(outputCable)) continue;
      lines.push({
        id: `splitter-output-${outputConnectionId}`,
        from: terminalPointKey(output.key),
        to: pointKey('OUT', outputFiber.fiberId),
        sourceColor: outputFiber.color,
        targetColor: outputFiber.color,
        route: 'SPLITTER_OUTPUT',
        removable: true,
        connectionId: outputConnectionId,
      });
    }
  }
  const visibleLines = lines.filter((line) => line.route ? showSplitters : showDirect);
  const pathForLine = (line: (typeof lines)[number], from: Point, to: Point) => {
    if (line.route === 'SPLITTER_INPUT') return splitterInputPath(from, to);
    if (line.route === 'SPLITTER_OUTPUT') return splitterOutputPath(from, to);
    return orthogonalPath(from, to);
  };
  const renderSide = (title: string, side: 'IN' | 'OUT', sideCables: BoardCable[]) => (
    <section className={`splice-sheet-side splice-sheet-${side.toLowerCase()}`} aria-label={title}>
      <h3>{title}</h3>
      {sideCables.length === 0 && <p className="splice-sheet-empty">No hay fibras en este lado.</p>}
      {sideCables.map((cable) => <article className="splice-sheet-cable" key={`${side}-${cable.cableId}`}>
        <header><Cable size={14} aria-hidden="true" /><strong>{cable.code}</strong><span>{side === 'IN' ? 'Entrada' : 'Salida'}</span></header>
        {cable.buffers.map((buffer) => <section className="splice-sheet-buffer" key={`${side}-${cable.cableId}-${buffer.number}`}>
          <h4>Buffer {buffer.number} · {fiberColorLabel(buffer.color)}</h4>
          {buffer.fibers.map((fiber) => {
            const item: SelectedFiber = { fiber, cableCode: cable.code, side };
            const directMapping = directMappings.find((mapping) => side === 'IN' ? mapping.inputFiberId === fiber.id : mapping.outputFiberId === fiber.id);
            // La misma fibra se puede usar una vez como Entrada y otra como Salida. El bloqueo se
            // calcula por lado, no solo por id de hilo.
            const linked = Boolean(fiber.links?.length) || (side === 'IN' ? mappedInputFiberIds.has(fiber.id) : mappedOutputFiberIds.has(fiber.id));
            const active = selected?.fiber.id === fiber.id && selected.side === side;
            const highlighted = directMapping?.id === highlightedConnectionId;
            const pin = <i ref={(el) => { const key = pointKey(side, fiber.id); if (el) fiberRefs.current.set(key, el); else fiberRefs.current.delete(key); }} className="splice-fiber-pin" aria-hidden="true" />;
            const description = onSaveDescription && <FiberDescriptionInput fiber={fiber} disabled={busy} onSave={onSaveDescription} />;
            return <div key={pointKey(side, fiber.id)} data-sheet-fiber={pointKey(side, fiber.id)} className={`splice-sheet-fiber ${active ? 'is-selected' : ''} ${linked ? 'is-linked' : ''} ${highlighted ? 'is-highlighted' : ''} ${busy ? 'is-disabled' : ''}`} style={{ '--fiber-color': fiberColorHex(fiber.color), '--fiber-text': textOnColor(fiber.color) } as React.CSSProperties} aria-disabled={busy} onPointerDown={(event) => { if (!busy && !linked && !onOpenFusion) beginDrag(event, item); }} onClick={() => { if (busy) return; if (suppressNextFiberClick.current) { suppressNextFiberClick.current = false; return; } if (directMapping) { setHighlightedConnectionId((current) => current === directMapping.id ? null : directMapping.id); return; } if (!linked && !onOpenFusion) chooseFiber(item); }} title={directMapping ? 'Haz clic para resaltar su conexión' : onOpenFusion ? 'Usa “Fusionar por buffers”' : linked ? `Conectado a ${fiber.links?.join(', ')}` : 'Arrastra al cuadro opuesto'}>{side === 'OUT' && pin}<b>{String(fiber.number).padStart(2, '0')}</b><span>Hilo {String(fiber.number).padStart(2, '0')}</span>{description}<em>{fiber.service ?? 'Disponible'}</em>{side === 'IN' && pin}</div>;
          })}
        </section>)}
      </article>)}
    </section>
  );

  return <section className="splice-sheet" aria-label="Hoja de empalmes de la manga">
    <header className="splice-sheet-header"><GitFork size={17} aria-hidden="true" /><div><strong>Mapa de continuidad</strong><span>Usa “Fusionar por buffers” para elegir la entrada y salida. Las líneas muestran ambos colores.</span>{boardNotice && <small className="splice-sheet-notice">{boardNotice}</small>}</div>{onOpenFusion && <button type="button" className="splice-fusion-open" disabled={busy} onClick={onOpenFusion}>Fusionar por buffers</button>}{onRemoveSplice && <button type="button" className={`splice-remove-toggle ${removalMode ? 'is-active' : ''}`} disabled={busy || removableConnections.length === 0} title={removableConnections.length === 0 ? 'No hay conexiones registradas para eliminar' : undefined} onClick={() => setRemovalMode((active) => !active)}>{removalMode ? 'Cancelar borrado' : `Eliminar conexiones${removableConnections.length ? ` (${removableConnections.length})` : ''}`}</button>}</header>
    <div className="splice-visibility" role="group" aria-label="Mostrar conexiones">
      <button type="button" aria-pressed={showDirect}
        onClick={() => setVisibleConnections((current) => current === 'direct' ? 'none' : 'direct')}>
        Conexiones directas
      </button>
      <button type="button" aria-pressed={showSplitters}
        onClick={() => setVisibleConnections((current) => current === 'splitter' ? 'none' : 'splitter')}>
        Conexiones de splitter
      </button>
    </div>
    {removalMode && <div className="splice-removal-list" role="status"><strong>Elige una conexión para eliminar:</strong>{removableConnections.map((connection) => <button key={connection.id} type="button" disabled={busy} onClick={() => void onRemoveSplice?.(connection.id).then(() => setRemovalMode(false))}>{connection.label || 'Conexión sin hilo'}</button>)}</div>}
    <div className="splice-sheet-canvas" ref={boardRef}>
      <svg className={`splice-sheet-lines${removalMode ? ' is-removal-mode' : ''}`} aria-label={removalMode ? 'Haz clic en una línea para eliminar su conexión' : undefined} width="100%" height="100%"><defs>{visibleLines.map((line) => { const from = line.from.startsWith('TERMINAL:') ? points.terminals.get(line.from.slice('TERMINAL:'.length)) : points.fibers.get(line.from); const to = line.to.startsWith('TERMINAL:') ? points.terminals.get(line.to.slice('TERMINAL:'.length)) : points.fibers.get(line.to); return from && to ? <linearGradient id={`splice-gradient-${line.id}`} key={line.id} gradientUnits="userSpaceOnUse" x1={from.x} y1={from.y} x2={to.x} y2={to.y}><stop offset="0%" stopColor={fiberColorHex(line.sourceColor)} /><stop offset="50%" stopColor={fiberColorHex(line.sourceColor)} /><stop offset="50%" stopColor={fiberColorHex(line.targetColor)} /><stop offset="100%" stopColor={fiberColorHex(line.targetColor)} /></linearGradient> : null; })}</defs>{visibleLines.map((line) => { const from = line.from.startsWith('TERMINAL:') ? points.terminals.get(line.from.slice('TERMINAL:'.length)) : points.fibers.get(line.from); const to = line.to.startsWith('TERMINAL:') ? points.terminals.get(line.to.slice('TERMINAL:'.length)) : points.fibers.get(line.to); const highlighted = line.connectionId === highlightedConnectionId; return from && to ? <path key={line.id} className={`${removalMode && line.removable ? 'is-removable' : ''} ${highlighted ? 'is-highlighted' : ''}`} d={pathForLine(line, from, to)} stroke={`url(#splice-gradient-${line.id})`} onClick={() => { if (removalMode && line.connectionId && onRemoveSplice) { void onRemoveSplice(line.connectionId).then(() => setRemovalMode(false)); } }} /> : null; })}{dragging && <path className="is-dragging" d={orthogonalPath(dragging.from, dragging.cursor)} stroke={fiberColorHex(dragging.fiber.color)} />}</svg>
      {renderSide('Entradas', 'IN', inputCables)}
      {renderSide('Salidas', 'OUT', outputCables)}
      {showSplitters && splitterFigures.length > 0 && <section className="splice-splitter-figures" aria-label="Splitters de la manga">
        {splitterFigures.map((splitter) => <article className="splice-splitter-figure" key={splitter.id}>
          <header><strong>{splitter.title}</strong><span>{splitter.ratio}</span></header>
          <div className="splice-splitter-symbol">
            <div className="splice-splitter-output-lines">{splitter.outputs.map((output, index) => {
              const linkId = output.connectionIds[0];
              return <button type="button" key={output.key} ref={bindTerminalRef(output.key)} disabled={!removalMode || !linkId || busy} className={`${output.status === 'FREE' ? '' : 'is-used'}${removalMode && linkId ? ' is-removable' : ''}`} title={linkId && removalMode ? `Eliminar hilo conectado a ${output.label}` : `${output.label} · ${output.status}`} onClick={() => linkId && removeSingleConnection(linkId)}><b>{index + 1}</b></button>;
            })}</div>
            <div className="splice-splitter-triangle"><span>{splitter.title}</span></div>
            {(() => {
              const linkId = splitter.input?.connectionIds[0];
              return <button type="button" ref={splitter.input ? bindTerminalRef(splitter.input.key) : undefined} disabled={!removalMode || !linkId || busy} className={`splice-splitter-input-line${splitter.input?.status === 'FREE' ? '' : ' is-used'}${removalMode && linkId ? ' is-removable' : ''}`} title={linkId && removalMode ? 'Eliminar hilo conectado a la entrada del splitter' : splitter.input ? `${splitter.input.label} · ${splitter.input.status}` : 'Entrada'} onClick={() => linkId && removeSingleConnection(linkId)}><b>Entrada</b></button>;
            })()}
            {onRemoveSplitter && <button type="button" className="splice-splitter-remove" disabled={busy} onClick={() => { const connectionCount = [splitter.input, ...splitter.outputs].reduce((total, terminal) => total + (terminal?.connectionIds.length ?? 0), 0); void onRemoveSplitter(splitter.id, splitter.title, connectionCount); }}>Eliminar splitter</button>}
          </div>
        </article>)}
      </section>}
      {onCreateSplitter && <footer className="splice-splitter-footer">
        <div><strong>Crear splitter en esta manga</strong><span>Una entrada común y 8 o 16 salidas.</span></div>
        <label>Nombre <input value={splitterName} maxLength={100} placeholder="Opcional" disabled={busy} onChange={(event) => setSplitterName(event.target.value)} /></label>
        <button type="button" disabled={busy} onClick={() => void onCreateSplitter('1:8', splitterName.trim()).then(() => setSplitterName('')).catch(() => undefined)}>Crear splitter 1:8</button>
        <button type="button" disabled={busy} onClick={() => void onCreateSplitter('1:16', splitterName.trim()).then(() => setSplitterName('')).catch(() => undefined)}>Crear splitter 1:16</button>
      </footer>}
    </div>
  </section>;
}

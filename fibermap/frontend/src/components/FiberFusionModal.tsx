import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { BoardCable, BoardFiber, BoardFiberMapping, BoardTerminal } from './FiberContinuityBoard';
import { fiberColorHex, fiberColorLabel, textOnColor } from '../lib/fiberColors';
import './FiberFusionModal.css';

type Side = 'IN' | 'OUT';
type FusionMode = 'DIRECT' | 'SPLITTER';
interface PickedFiber { fiber: BoardFiber; cable: BoardCable; side: Side; }
interface SplitterRoute { id: string; code: string; name: string | null; ratio: string; input: BoardTerminal; outputs: BoardTerminal[]; }

interface Props {
  cables: BoardCable[];
  mappings: BoardFiberMapping[];
  terminals: BoardTerminal[];
  busy?: boolean;
  onClose: () => void;
  onFuse: (source: PickedFiber, target: PickedFiber) => Promise<void>;
  onFeedSplitter: (source: PickedFiber, input: BoardTerminal) => Promise<void>;
  onFuseWithSplitter: (source: PickedFiber | null, target: PickedFiber, input: BoardTerminal, output: BoardTerminal) => Promise<void>;
}

const cablesFor = (cables: BoardCable[], side: Side) => cables.filter((cable) => side === 'IN' ? cable.role !== 'START' : cable.role !== 'END');
const isSplitterInput = (terminal: BoardTerminal) => terminal.key.startsWith('SPLITTER_INPUT:');
const isSplitterOutput = (terminal: BoardTerminal) => terminal.key.startsWith('SPLITTER_OUTPUT:');

export default function FiberFusionModal({ cables, mappings, terminals, busy = false, onClose, onFuse, onFeedSplitter, onFuseWithSplitter }: Props) {
  const [openBuffer, setOpenBuffer] = useState<{ side: Side; cableId: string; number: number } | null>(null);
  const [source, setSource] = useState<PickedFiber | null>(null);
  const [target, setTarget] = useState<PickedFiber | null>(null);
  const [mode, setMode] = useState<FusionMode>('DIRECT');
  const [splitterInput, setSplitterInput] = useState<BoardTerminal | null>(null);
  const [splitterOutput, setSplitterOutput] = useState<BoardTerminal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mappedInputs = new Set(mappings.map((mapping) => mapping.inputFiberId));
  const mappedOutputs = new Set(mappings.map((mapping) => mapping.outputFiberId));
  const splitters = useMemo(() => {
    const byId = new Map<string, SplitterRoute>();
    for (const terminal of terminals) {
      if ((!isSplitterInput(terminal) && !isSplitterOutput(terminal)) || !terminal.splitter) continue;
      const current = byId.get(terminal.splitter.id) ?? { ...terminal.splitter, input: terminal, outputs: [] };
      if (isSplitterInput(terminal)) current.input = terminal;
      else current.outputs.push(terminal);
      byId.set(terminal.splitter.id, current);
    }
    return [...byId.values()].map((splitter) => ({ ...splitter, outputs: splitter.outputs.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })) }));
  }, [terminals]);
  const selectedSplitter = splitters.find((splitter) => splitter.input.key === splitterInput?.key) ?? null;

  const selectFiber = (side: Side, cable: BoardCable, fiber: BoardFiber) => {
    setError(null);
    if (side === 'IN') {
      setSource((current) => current?.fiber.id === fiber.id ? null : { side, cable, fiber });
      if (splitterInput?.fibers.length) {
        setSplitterInput(null);
        setSplitterOutput(null);
      }
    } else setTarget((current) => current?.fiber.id === fiber.id ? null : { side, cable, fiber });
  };
  const fuse = async () => {
    if (busy || (source && target && source.fiber.id === target.fiber.id)) return;
    if (mode === 'SPLITTER') {
      if (!splitterInput) return;
      const splitterName = selectedSplitter?.name || selectedSplitter?.code || 'splitter';
      const hasFedInput = splitterInput.fibers.length > 0;
      if (source && !hasFedInput && !target && !splitterOutput) {
        if (!window.confirm(`¿Conectar ${source.cable.code} · hilo ${source.fiber.number} a la entrada de ${splitterName}?`)) return;
        await onFeedSplitter(source, splitterInput);
        onClose();
        return;
      }
      if (!target || !splitterOutput) return;
      if (!source && !hasFedInput) return;
      const message = source
        ? `¿Conectar ${source.cable.code} · hilo ${source.fiber.number} a la entrada de ${splitterName} y la salida elegida con ${target.cable.code} · hilo ${target.fiber.number}?`
        : `¿Conectar la salida elegida de ${splitterName} con ${target.cable.code} · hilo ${target.fiber.number}? La entrada ya está alimentada.`;
      if (!window.confirm(message)) return;
      await onFuseWithSplitter(source, target, splitterInput, splitterOutput);
    } else {
      if (!source || !target) return;
      if (!window.confirm(`¿Fusionar ${source.cable.code} · hilo ${source.fiber.number} con ${target.cable.code} · hilo ${target.fiber.number}?`)) return;
      await onFuse(source, target);
    }
    onClose();
  };
  const selectMode = (next: FusionMode) => {
    setError(null);
    setMode(next);
    setTarget(null);
    setSplitterInput(null);
    setSplitterOutput(null);
  };
  const renderSide = (side: Side, title: string) => (
    <section className={`fusion-side fusion-${side.toLowerCase()}`}>
      <h3>{title}</h3>
      {cablesFor(cables, side).map((cable) => (
        <article className="fusion-cable" key={`${side}-${cable.cableId}`}>
          <header>{cable.code}</header>
          {cable.buffers.map((buffer) => {
            const open = openBuffer?.side === side && openBuffer.cableId === cable.cableId && openBuffer.number === buffer.number;
            return <section className="fusion-buffer" key={`${side}-${cable.cableId}-${buffer.number}`}>
              <button type="button" className={open ? 'is-open' : ''} onClick={() => setOpenBuffer(open ? null : { side, cableId: cable.cableId, number: buffer.number })}>
                Buffer {buffer.number} · {fiberColorLabel(buffer.color)} <span>{open ? '−' : '+'}</span>
              </button>
              {open && <div className="fusion-fibers">{buffer.fibers.map((fiber) => {
                const unavailable = Boolean(fiber.links?.length) || (side === 'IN' ? mappedInputs.has(fiber.id) : mappedOutputs.has(fiber.id));
                const picked = side === 'IN' ? source?.fiber.id === fiber.id : target?.fiber.id === fiber.id;
                return <button type="button" key={fiber.id} disabled={busy || unavailable} className={picked ? 'is-picked' : ''} style={{ '--fusion-color': fiberColorHex(fiber.color), '--fusion-text': textOnColor(fiber.color) } as React.CSSProperties} onClick={() => selectFiber(side, cable, fiber)}><i aria-hidden="true" /><b>Hilo {String(fiber.number).padStart(2, '0')}</b><span>{unavailable ? 'Ya conectado' : fiber.service ?? 'Disponible'}</span></button>;
              })}</div>}
            </section>;
          })}
        </article>
      ))}
    </section>
  );
  const renderSplitterStage = () => (
    <section className="fusion-splitter-stage" aria-label="Ruta por splitter">
      <h3>Derivación</h3>
      <div className="fusion-mode-switch">
        <button type="button" className={mode === 'DIRECT' ? 'is-active' : ''} onClick={() => selectMode('DIRECT')}>Directa</button>
        <button type="button" className={mode === 'SPLITTER' ? 'is-active' : ''} disabled={splitters.length === 0} onClick={() => selectMode('SPLITTER')}>Con splitter</button>
      </div>
      {mode === 'DIRECT' && <p className="fusion-stage-help">Une un hilo de entrada con un hilo de salida, sin derivación.</p>}
      {mode === 'SPLITTER' && (splitters.length === 0 ? <p className="fusion-stage-help">Crea primero un splitter 1:8 o 1:16 en el Editor de Conexiones.</p> : <>
        <p className="fusion-stage-help">Conecta primero la entrada del splitter. Después selecciona una salida libre y su hilo en cualquier orden. También puedes guardar la entrada y la primera salida juntas.</p>
        <div className="fusion-splitter-list">
          {splitters.map((splitter) => {
            const selected = splitter.input.key === splitterInput?.key;
            return <article className={`fusion-splitter-card ${selected ? 'is-selected' : ''}`} key={splitter.id}>
              <div className="fusion-splitter-triangle" aria-hidden="true"><span>{splitter.name || splitter.code}</span></div>
              <strong>{splitter.name || splitter.code}</strong><small>{splitter.code} · {splitter.ratio}</small>
              <button type="button" className="fusion-splitter-input" aria-pressed={selected} disabled={busy || (splitter.input.status !== 'FREE' && splitter.input.fibers.length === 0)} onClick={() => { setSplitterInput(splitter.input); if (!selected) setSplitterOutput(null); if (splitter.input.fibers.length > 0) setSource(null); }}>
                ↓ {splitter.input.fibers.length > 0 ? 'Entrada ya alimentada' : 'Entrada libre'}
              </button>
              {(selected || splitter.input.fibers.length > 0) && <div className="fusion-splitter-outputs">{splitter.outputs.map((output) => <button key={output.key} type="button" disabled={busy || output.status !== 'FREE'} className={output.key === splitterOutput?.key ? 'is-selected' : ''} onClick={() => {
                setSplitterInput(splitter.input);
                setSplitterOutput((current) => current?.key === output.key ? null : output);
                if (splitter.input.fibers.length > 0) setSource(null);
              }}>Salida {output.label.match(/\d+$/)?.[0] ?? ''} · {output.status === 'FREE' ? 'libre' : 'ocupada'}</button>)}</div>}
            </article>;
          })}
        </div>
      </>)}
    </section>
  );

  const hasRequiredEndpoints = mode === 'DIRECT'
    ? Boolean(source && target)
    : Boolean(splitterInput && (
      (source && splitterInput.fibers.length === 0 && !splitterOutput && !target) ||
      (splitterOutput && target && (source || splitterInput.fibers.length > 0))
    ));
  const sameFiber = Boolean(source && target && source.fiber.id === target.fiber.id);
  const summary = mode === 'SPLITTER'
    ? `${source ? `${source.cable.code} · Hilo ${source.fiber.number}` : selectedSplitter?.input.fibers.length ? 'Entrada ya conectada' : 'Entrada'} → ${selectedSplitter ? `${selectedSplitter.name || selectedSplitter.code} · ${splitterOutput?.label ?? 'elige salida'}` : 'elige splitter'} → ${target ? `${target.cable.code} · Hilo ${target.fiber.number}` : 'Salida'}`
    : `${source ? `${source.cable.code} · Hilo ${source.fiber.number}` : 'Selecciona un hilo de entrada'} → ${target ? `${target.cable.code} · Hilo ${target.fiber.number}` : 'Selecciona un hilo de salida'}`;

  return <div className="fusion-modal-backdrop" onMouseDown={onClose}>
    <section className="fusion-modal" role="dialog" aria-modal="true" aria-label="Fusionar hilos por buffer" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><strong>Fusionar hilos</strong><span>Una fusión puede ser directa o pasar por la entrada común y una salida de un splitter.</span></div><button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></header>
      <div className={`fusion-columns ${mode === 'SPLITTER' ? 'has-splitter' : ''}`}>{renderSide('IN', 'Entradas')}{renderSplitterStage()}{renderSide('OUT', 'Salidas')}</div>
      {(error || sameFiber) && <p className="fusion-error" role="alert">{sameFiber ? 'Elige un hilo de salida distinto del hilo de entrada.' : error}</p>}
      <footer><p>{summary}</p><button type="button" className="btn-primary" disabled={!hasRequiredEndpoints || sameFiber || busy}
        onClick={() => {
          setError(null);
          void fuse().catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo guardar la fusión'));
        }}>{mode === 'SPLITTER' ? 'Fusionar por splitter' : 'Fusionar'}</button></footer>
    </section>
  </div>;
}

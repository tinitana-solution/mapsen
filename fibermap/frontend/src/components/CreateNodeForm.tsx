import React, { useEffect, useId, useRef, useState } from 'react';
import { X, MapPin, GripVertical } from 'lucide-react';
import { useDraggablePanel } from '../lib/useDraggablePanel';
import DismissibleAlert from './DismissibleAlert';
import {
  ELEMENT_HELP,
  ELEMENT_LABELS,
  FIBER_COUNTS,
  MANGA_TYPES,
  NAP_SPLITTER_RATIOS,
  ODF_CAPACITIES,
  type ElementKind,
  type NewElementValues,
} from '../lib/network';
import './CreateNodeForm.css';
import './DragHandle.css';

interface CreateNodeFormProps {
  lng: number;
  lat: number;
  kind: ElementKind;
  initialMangaType?: string;
  cableId?: string;
  onClose: () => void;
  onSave: (values: NewElementValues) => Promise<void>;
}

export function CreateNodeForm({ lng, lat, kind, initialMangaType, cableId, onClose, onSave }: CreateNodeFormProps) {
  // El formulario queda anclado a la derecha del mapa; se puede arrastrar y recuerda dónde se dejó.
  const drag = useDraggablePanel('fibermap.createForm.position');
  const [name, setName] = useState('');
  const [currentLng, setCurrentLng] = useState(lng);
  const [currentLat, setCurrentLat] = useState(lat);
  const [accuracyMeters, setAccuracyMeters] = useState<number | undefined>();
  const [capacity, setCapacity] = useState(kind === 'ODF' ? 24 : 12);
  const [mangaType, setMangaType] = useState(initialMangaType ?? 'DISTRIBUCION');
  const [splitterRatio, setSplitterRatio] = useState('1:8');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        latitude: currentLat,
        longitude: currentLng,
        capacity,
        mangaType,
        splitterRatio,
        cableId: mangaType === 'EMPALME' ? cableId : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLng(position.coords.longitude);
          setCurrentLat(position.coords.latitude);
          setAccuracyMeters(Math.round(position.coords.accuracy));
        },
        (geoError) => setError('Error al obtener la ubicación: ' + geoError.message),
      );
    } else {
      setError('Geolocalización no soportada por el navegador');
    }
  };

  const id = (suffix: string) => `${titleId}-${suffix}`;
  const selectedMangaHelp = MANGA_TYPES.find((t) => t.value === mangaType)?.help;

  return (
    <div
      ref={drag.panelRef}
      className="create-node-modal"
      style={drag.style}
      role="dialog"
      aria-labelledby={titleId}
    >
      <div className="modal-header modal-header-draggable" title="Arrastra para mover · doble clic para volver a la derecha" {...drag.headerProps}>
        <button
          type="button"
          className="drag-handle"
          data-no-drag
          aria-label="Mover formulario: usa las flechas del teclado (Mayús para mover más; Inicio para volver a la derecha)"
          {...drag.handleProps}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
        <h4 id={titleId}>Agregar {ELEMENT_LABELS[kind]}</h4>
        <button className="close-btn icon-button" data-no-drag onClick={onClose} aria-label="Cerrar formulario">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="modal-body">
        <p className="form-help">{ELEMENT_HELP[kind]}</p>

        <div className="form-group">
          <label htmlFor={id('name')}>Código / Nombre</label>
          <input
            id={id('name')}
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Ej: ${kind}-001`}
            required
          />
        </div>

        {kind === 'ODF' && (
          <div className="form-group">
            <label htmlFor={id('capacity')}>Cantidad de puertos</label>
            <select id={id('capacity')} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
              {ODF_CAPACITIES.map((c) => (
                <option key={c} value={c}>{c} puertos</option>
              ))}
            </select>
          </div>
        )}

        {kind === 'MANGA' && (
          <>
            <div className="form-group">
              <label htmlFor={id('manga-type')}>Tipo de manga</label>
              <select id={id('manga-type')} value={mangaType} onChange={(e) => setMangaType(e.target.value)}>
                {MANGA_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {selectedMangaHelp && <small className="accuracy">{selectedMangaHelp}</small>}
            </div>
            <div className="form-group">
              <label htmlFor={id('fibers')}>Hilos de la fibra</label>
              <select id={id('fibers')} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
                {FIBER_COUNTS.map((c) => (
                  <option key={c} value={c}>{c} hilos</option>
                ))}
              </select>
            </div>
          </>
        )}

        {kind === 'NAP' && (
          <div className="form-group">
            <label htmlFor={id('ratio')}>Splitter interno</label>
            <select id={id('ratio')} value={splitterRatio} onChange={(e) => setSplitterRatio(e.target.value)}>
              {NAP_SPLITTER_RATIOS.map((r) => (
                <option key={r} value={r}>{r} ({r.split(':')[1]} salidas hacia ONU)</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <span id={id('coords-label')}>Coordenadas</span>
          <div className="coords-container">
            <div className="coords" aria-labelledby={id('coords-label')}>
              {currentLat.toFixed(5)}, {currentLng.toFixed(5)}
            </div>
            <button
              type="button"
              className="btn-location icon-button"
              onClick={handleUseCurrentLocation}
              aria-label="Usar ubicación GPS actual"
              title="Usar ubicación GPS"
            >
              <MapPin size={14} aria-hidden="true" />
            </button>
          </div>
          {accuracyMeters && (
            <small className="accuracy" role="status">
              Precisión: ±{accuracyMeters}m
            </small>
          )}
        </div>

        {error && <DismissibleAlert className="form-error" onClose={() => setError(null)}>{error}</DismissibleAlert>}

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary-small" disabled={saving}>
            {saving ? 'Guardando...' : `Guardar ${ELEMENT_LABELS[kind]}`}
          </button>
        </div>
      </form>
    </div>
  );
}

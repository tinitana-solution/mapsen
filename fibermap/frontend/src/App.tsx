import { useState, useEffect, useMemo, useRef } from 'react';
import Map, { NavigationControl, ScaleControl, Marker, Source, Layer } from 'react-map-gl/maplibre';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Activity, Settings, Server, LogOut, Users, ChevronDown, ChevronUp, Menu, X, LayoutDashboard, Upload } from 'lucide-react';
import { MapToolbar } from './components/MapToolbar';
import { CreateNodeForm } from './components/CreateNodeForm';
import { ElementPropertiesPanel } from './components/ElementPropertiesPanel';
import NodesPage from './components/NodesPage';
import ClientsPage from './components/ClientsPage';
import OperationsPage from './components/OperationsPage';
import PoleImportPage from './components/PoleImportPage';
import CableInspectorModal from './components/CableInspectorModal';
import ConnectionsTableModal from './components/ConnectionsTableModal';
import SettingsPage, { type AppPreferences } from './components/SettingsPage';
import BoxEditorPage from './components/BoxEditorPage';
import TracePage from './components/TracePage';
import AuthGate from './components/AuthGate';
import ServerOfflineScreen from './components/ServerOfflineScreen';
import DismissibleAlert from './components/DismissibleAlert';
import DrawPanel from './components/DrawPanel';
import MapScaleIndicator from './components/MapScaleIndicator';
import { POLE_MIN_ZOOM } from './lib/mapZoom';
import { nearestPole } from './lib/poleSnap';
import EditEntityModal from './components/EditEntityModal';
import { useAuth } from './context/AuthContext';
import { apiFetch, apiList, isConnectionError } from './lib/api';
import {
  ELEMENT_COLORS,
  ELEMENT_LABELS,
  elementEditFields,
  elementEditValues,
  cableColor,
  CABLE_FIBER_COUNTS,
  FIBER_COLOR_BY_COUNT,
  defaultFiberColor,
  fiberCountLabel,
  MANGA_COLORS,
  MANGA_TYPES,
  MANGA_TYPE_LABELS,
  createElement,
  deleteElement,
  elementColor,
  fetchElements,
  fiberWidth,
  hasInterior,
  readJson,
  updateElement,
  type ElementKind,
  type FiberRecord,
  type NetworkElement,
  type NewElementValues,
} from './lib/network';

import './App.css';

const TOOL_KIND: Record<string, ElementKind> = {
  'add-odf': 'ODF',
  'add-manga': 'MANGA',
  'add-manga-empalme': 'MANGA',
  'add-nap': 'NAP',
};

const DEFAULT_PREFERENCES: AppPreferences = {
  showLegend: false,
  showImportedPoles: true,
  confirmDestructiveActions: true,
};

interface RoutePoint {
  lat: number;
  lng: number;
  ref?: { type: ElementKind; id: string };
}

interface CableSelection {
  id: string;
}

// Fibra existente cuyo trazado se está modificando en el mapa.
interface PathEdit {
  cableId: string;
  code: string;
  color: string;
  points: { lat: number; lng: number }[];
  // Trazado original, para poder descartar los cambios sin salir del modo de edición.
  original: { lat: number; lng: number }[];
}

const TRACE_RULE = 'Cada punto de la fibra va sobre un poste (o en el centro de un ODF, una manga o una caja NAP).';
const NAP_RULE = 'Una caja NAP va sobre un poste.';

// Radio (en píxeles) dentro del cual un clic se "imanta" al centro de un dispositivo.
const SNAP_RADIUS_PX = 14;

interface ImportedPole {
  id: string;
  code: string;
  name: string | null;
  latitude: string | number;
  longitude: string | number;
}

// Cada tipo se distingue por forma y color, no solo por color (mejor para daltonismo).
function markerShape(el: NetworkElement): React.CSSProperties {
  const base: React.CSSProperties = { border: '2px solid white', boxShadow: '0 0 0 1px rgba(0,0,0,0.6)' };
  switch (el.kind) {
    case 'ODF':
      return { ...base, width: 16, height: 16, borderRadius: 2 };
    case 'MANGA':
      return { ...base, width: 14, height: 14, borderRadius: '50%' };
    case 'NAP':
      return { ...base, width: 18, height: 12, borderRadius: 4 };
  }
}

// Defined once, outside the component: react-map-gl replaces the ENTIRE map style whenever
// this object's reference changes. An inline literal here would be recreated on every
// render — including every mousemove while tracing a cable — wiping out the cable line
// layers before the browser ever got to paint them. Only the dots (plain DOM markers,
// unrelated to the style) would survive that, matching exactly what was reported.
const BASE_MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles-layer',
      type: 'raster',
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

function App() {
  const { user, loading, logout, serverOffline, retryConnection } = useAuth();
  const [activeTab, setActiveTab] = useState('map');
  const [activeTool, setActiveTool] = useState('select');
  const [mapClickCoord, setMapClickCoord] = useState<{lng: number, lat: number, x: number, y: number, cableId?: string} | null>(null);
  const [selectedElement, setSelectedElement] = useState<NetworkElement | null>(null);
  const [selectedCable, setSelectedCable] = useState<CableSelection | null>(null);
  const [connectionsTableTarget, setConnectionsTableTarget] = useState<{ kind: ElementKind; id: string } | null>(null);
  const [editingElement, setEditingElement] = useState<NetworkElement | null>(null);
  const [preloadBoxId, setPreloadBoxId] = useState<string | null>(null);
  const [preloadKind, setPreloadKind] = useState<ElementKind | null>(null);
  const [preloadFiberId, setPreloadFiberId] = useState<string | null>(null);
  const [elements, setElements] = useState<NetworkElement[]>([]);
  const [poles, setPoles] = useState<ImportedPole[]>([]);
  const [cables, setCables] = useState<FiberRecord[]>([]);
  const [cablePoints, setCablePoints] = useState<RoutePoint[]>([]);
  const [cableCursor, setCableCursor] = useState<{ lat: number; lng: number } | null>(null);
  // Poste o dispositivo al que se imantaría un clic en este momento (se dibuja como un anillo).
  const [snapHover, setSnapHover] = useState<{ lat: number; lng: number } | null>(null);
  // Aviso al hacer un clic que las reglas de los postes no permiten.
  const [mapHint, setMapHint] = useState<string | null>(null);
  const [fiberCount, setFiberCount] = useState(12);
  // El color de la fibra siempre es el estándar de su cantidad de hilos.
  const fiberColor = defaultFiberColor(fiberCount);
  const [pathEdit, setPathEdit] = useState<PathEdit | null>(null);
  const [pathError, setPathError] = useState<string | null>(null);
  const [savingRoute, setSavingRoute] = useState(false);
  // El servidor dejó de responder mientras se usaba la app: se avisa y se reintenta solo.
  const [connectionLost, setConnectionLost] = useState(false);
  const [connectionNoticeClosed, setConnectionNoticeClosed] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hasCenteredOnData = useRef(false);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // MapLibre pans with the left button by default. During a fiber trace we disable that
  // default and keep this tiny right-button pan state so the interaction is inverted:
  // left click plants points, right-drag moves the map.
  const rightPanRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  // Posición de un vértice antes de arrastrarlo, para devolverlo ahí si se suelta lejos de un poste.
  const pathDragOrigin = useRef<{ lat: number; lng: number } | null>(null);

  const isTracing = activeTool === 'add-cable';
  const placingKind = TOOL_KIND[activeTool] ?? null;
  // Con estas herramientas los clics se imantan a los postes, así que se dibujan aunque estén ocultos en Ajustes.
  const snappingPoles = isTracing || !!pathEdit || placingKind === 'NAP' || placingKind === 'MANGA';

  useEffect(() => {
    if (!isTracing) {
      setCableCursor(null);
    }
  }, [isTracing]);

  // Al cambiar de herramienta desaparecen el anillo de imán y el aviso del clic anterior.
  useEffect(() => {
    setMapHint(null);
    setSnapHover(null);
  }, [activeTool, pathEdit === null]);

  const noteFailure = (label: string, error: unknown) => {
    if (isConnectionError(error)) setConnectionLost(true);
    else console.error(`Error fetching ${label}:`, error);
  };

  const fetchNetwork = async () => {
    try {
      setElements(await fetchElements());
      setConnectionLost(false);
      setConnectionNoticeClosed(false);
    } catch (error) {
      noteFailure('network elements', error);
    }
  };

  const fetchCables = async () => {
    try {
      setCables(await apiList<FiberRecord>('/cables', 'No se pudieron cargar las fibras'));
      setConnectionLost(false);
    } catch (error) {
      noteFailure('cables', error);
    }
  };

  // Los postes importados pueden ser cientos de miles: solo se piden los de la zona visible (con un
  // margen) y únicamente a un zoom en el que se distinguen, en vez de descargarlos todos.
  const fetchPoles = async () => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getZoom() < POLE_MIN_ZOOM) {
      setPoles([]);
      return;
    }
    const bounds = map.getBounds();
    const padLng = (bounds.getEast() - bounds.getWest()) * 0.25;
    const padLat = (bounds.getNorth() - bounds.getSouth()) * 0.25;
    const params = new URLSearchParams({
      west: String(bounds.getWest() - padLng),
      south: String(bounds.getSouth() - padLat),
      east: String(bounds.getEast() + padLng),
      north: String(bounds.getNorth() + padLat),
      limit: '30000',
    });
    try {
      setPoles(await apiList<ImportedPole>(`/poles?${params}`, 'No se pudieron cargar los postes'));
    } catch (error) {
      noteFailure('poles', error);
    }
  };

  // Al mover o hacer zoom se vuelve a pedir la zona visible, esperando a que el usuario se detenga.
  const poleFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePoleFetch = () => {
    if (poleFetchTimer.current) clearTimeout(poleFetchTimer.current);
    poleFetchTimer.current = setTimeout(fetchPoles, 350);
  };

  // Coordenadas numéricas de los postes cargados, para imantar los clics sin convertir texto cada vez.
  const poleIndex = useMemo(
    () => poles.map((pole) => ({ lat: Number(pole.latitude), lng: Number(pole.longitude), code: pole.code })),
    [poles],
  );

  const poleGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: poleIndex.map((pole) => ({
        type: 'Feature' as const,
        properties: { code: pole.code },
        geometry: { type: 'Point' as const, coordinates: [pole.lng, pole.lat] },
      })),
    }),
    [poleIndex],
  );

  const refreshMapData = () => {
    fetchNetwork();
    fetchCables();
    fetchPoles();
  };

  // Refresh markers whenever the user comes back to the map, so anything created from
  // el editor de conexiones or the map itself shows up without a full reload.
  useEffect(() => {
    if (user && activeTab === 'map') {
      refreshMapData();
    }
  }, [user, activeTab]);

  // Mientras no haya conexión se reintenta cada pocos segundos hasta que el servidor responda.
  useEffect(() => {
    if (!user || !connectionLost) return;
    const timer = setInterval(() => refreshMapData(), 6000);
    return () => clearInterval(timer);
  }, [user, connectionLost]);

  // Settings are per user, so the map restores the same working view after a new
  // session instead of only keeping controls in this browser tab.
  useEffect(() => {
    if (!user) return;
    apiFetch('/auth/preferences')
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudieron cargar los ajustes');
        return response.json();
      })
      .then((saved: AppPreferences) => {
        const next = { ...DEFAULT_PREFERENCES, ...saved };
        setPreferences(next);
        setLegendOpen(next.showLegend);
      })
      .catch((error) => console.error('Error fetching preferences:', error));
  }, [user]);

  const flyToLocation = (lng: number, lat: number) => {
    setActiveTab('map');
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 17 });
    }
  };

  // Center the map on the real network instead of always snapping back to the hardcoded
  // default whenever the map tab remounts.
  useEffect(() => {
    if (!mapLoaded || hasCenteredOnData.current || !mapRef.current || elements.length === 0) return;
    const located = [
      ...elements.map((el) => ({ lat: el.lat, lng: el.lng })),
    ].filter((el) => Number.isFinite(el.lat) && Number.isFinite(el.lng));
    if (located.length === 0) return;
    hasCenteredOnData.current = true;
    const avgLng = located.reduce((sum, el) => sum + el.lng, 0) / located.length;
    const avgLat = located.reduce((sum, el) => sum + el.lat, 0) / located.length;
    mapRef.current.jumpTo({ center: [avgLng, avgLat], zoom: 15 });
  }, [elements, mapLoaded]);

  // Cuando el mapa termina de cargar se piden los postes de la zona que muestra.
  useEffect(() => {
    if (mapLoaded) fetchPoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded]);

  // Escape should back the user out of whatever overlay is currently open, one step at a
  // time: an in-progress fiber trace first, then the map-click "add element" popup, then
  // the selected-element details panel — so a keyboard-only user always has a way out.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pathEdit) {
        setPathEdit(null);
        setPathError(null);
      } else if (activeTool === 'add-cable') {
        setCablePoints([]);
        setCableCursor(null);
        setActiveTool('select');
      } else if (mapClickCoord) {
        setMapClickCoord(null);
      } else if (selectedElement) {
        setSelectedElement(null);
      } else if (sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, mapClickCoord, selectedElement, sidebarOpen, pathEdit]);

  if (serverOffline && !user) {
    return <ServerOfflineScreen onRetry={retryConnection} />;
  }

  if (loading) {
    return <div className="app-loading">Cargando...</div>;
  }

  if (!user) {
    return <AuthGate />;
  }

  const addCablePoint = (point: RoutePoint) => {
    setCablePoints((prev) => [...prev, point]);
  };

  // Devuelve el dispositivo cuyo centro está a pocos píxeles de la posición dada. Así un clic
  // "cerca" de una caja queda exactamente en su centro, que es lo que conecta la fibra.
  const snapToElement = (lat: number, lng: number): NetworkElement | null => {
    const map = mapRef.current;
    if (!map) return null;
    const target = map.project([lng, lat]);
    let best: { element: NetworkElement; distance: number } | null = null;
    for (const element of elements) {
      const pos = map.project([element.lng, element.lat]);
      const distance = Math.hypot(pos.x - target.x, pos.y - target.y);
      if (distance <= SNAP_RADIUS_PX && (!best || distance < best.distance)) best = { element, distance };
    }
    return best?.element ?? null;
  };

  const snapToPole = (lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return null;
    return nearestPole(poleIndex, map.project([lng, lat]), SNAP_RADIUS_PX, map);
  };

  // Cada punto de la fibra va sobre un poste o en el centro de un dispositivo: si el clic no cae cerca
  // de ninguno de los dos devuelve null y el punto no se coloca.
  const routePointAt = (lat: number, lng: number): RoutePoint | null => {
    const near = snapToElement(lat, lng);
    if (near) return { lat: near.lat, lng: near.lng, ref: { type: near.kind, id: near.id } };
    const pole = snapToPole(lat, lng);
    return pole ? { lat: pole.lat, lng: pole.lng } : null;
  };

  // Explica por qué no se colocó el punto: o faltan los postes (zoom lejano) o el clic cayó fuera de uno.
  const poleHint = (rule: string) =>
    (mapRef.current?.getZoom() ?? 0) < POLE_MIN_ZOOM
      ? `Acércate hasta ver los postes (zoom ${POLE_MIN_ZOOM} o más). ${rule}`
      : `No hay un poste en ese punto. ${rule}`;

  // Distancia en píxeles de un punto a un segmento, para saber si el clic cayó sobre la línea.
  const distanceToSegmentPx = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };

  const startPathEdit = (cableId: string) => {
    const cable = cables.find((c) => c.id === cableId);
    if (!cable || cable.path.length < 2) return;
    setSelectedCable(null);
    setSelectedElement(null);
    setMapClickCoord(null);
    setActiveTool('select');
    setPathError(null);
    const original = cable.path.map(({ lat, lng }) => ({ lat, lng }));
    setPathEdit({ cableId, code: cable.code, color: cableColor(cable), points: original, original });
  };

  const cancelPathEdit = () => {
    setPathEdit(null);
    setPathError(null);
  };

  const restorePathEdit = () => {
    setPathEdit((prev) => (prev ? { ...prev, points: prev.original.map((p) => ({ ...p })) } : prev));
    setPathError(null);
  };

  // Elimina por completo la fibra que se está modificando.
  const deletePathCable = async () => {
    if (!pathEdit) return;
    if (preferences.confirmDestructiveActions && !window.confirm(`¿Eliminar la fibra ${pathEdit.code}? Se quitará del mapa junto con sus conexiones con dispositivos.`)) return;
    try {
      await readJson(await apiFetch(`/cables/${pathEdit.cableId}`, { method: 'DELETE' }), 'No se pudo eliminar la fibra');
      setPathEdit(null);
      setPathError(null);
      fetchCables();
    } catch (error) {
      setPathError(error instanceof Error ? error.message : 'No se pudo eliminar la fibra');
    }
  };

  // Borra todo el trazado en curso para empezar de nuevo sin salir de la herramienta.
  const handleClearCable = () => {
    setCablePoints([]);
    setCableCursor(null);
  };

  const movePathPoint = (index: number, lat: number, lng: number) => {
    setPathEdit((prev) => (prev ? { ...prev, points: prev.points.map((p, i) => (i === index ? { lat, lng } : p)) } : prev));
  };

  const removePathPoint = (index: number) => {
    setPathEdit((prev) => (prev && prev.points.length > 2 ? { ...prev, points: prev.points.filter((_, i) => i !== index) } : prev));
  };

  // Clic sobre la línea (a menos de unos píxeles): agrega un punto de giro en ese tramo.
  const insertPathPoint = (lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map || !pathEdit) return;
    const click = map.project([lng, lat]);
    let best = { index: -1, distance: Infinity };
    for (let i = 0; i < pathEdit.points.length - 1; i += 1) {
      const a = map.project([pathEdit.points[i].lng, pathEdit.points[i].lat]);
      const b = map.project([pathEdit.points[i + 1].lng, pathEdit.points[i + 1].lat]);
      const distance = distanceToSegmentPx(click, a, b);
      if (distance < best.distance) best = { index: i, distance };
    }
    if (best.index < 0 || best.distance > SNAP_RADIUS_PX) return;
    const point = routePointAt(lat, lng);
    if (!point) {
      setMapHint(poleHint(TRACE_RULE));
      return;
    }
    setPathEdit({
      ...pathEdit,
      points: [...pathEdit.points.slice(0, best.index + 1), { lat: point.lat, lng: point.lng }, ...pathEdit.points.slice(best.index + 1)],
    });
  };

  const savePathEdit = async () => {
    if (!pathEdit) return;
    setSavingRoute(true);
    setPathError(null);
    try {
      const res = await apiFetch(`/cables/${pathEdit.cableId}`, {
        method: 'PATCH',
        body: JSON.stringify({ points: pathEdit.points }),
      });
      await readJson(res, 'No se pudo guardar el nuevo trazado');
      const cableId = pathEdit.cableId;
      setPathEdit(null);
      await fetchCables();
      // Se muestra el inspector para revisar a qué dispositivos quedó conectada tras el cambio.
      setSelectedCable({ id: cableId });
    } catch (error) {
      setPathError(error instanceof Error ? error.message : 'No se pudo guardar el nuevo trazado');
    } finally {
      setSavingRoute(false);
    }
  };

  const handleMapClick = (e: any) => {
    // In trace mode the primary mouse button is the drawing action. Dragging with it is
    // disabled on the map, so a confirmed click can never accidentally pan the route.
    if (isTracing) {
      const point = routePointAt(e.lngLat.lat, e.lngLat.lng);
      if (!point) {
        setMapHint(poleHint(TRACE_RULE));
      } else if (cablePoints.length === 0 && !point.ref) {
        setMapHint('La fibra empieza en el centro de un ODF, una manga o una caja NAP. Haz el primer clic sobre uno de ellos.');
      } else {
        setMapHint(null);
        addCablePoint(point);
      }
      return;
    }

    if (pathEdit) {
      insertPathPoint(e.lngLat.lat, e.lngLat.lng);
      return;
    }

    const cableId = e.features?.find((feature: any) => /^cable-(layer|hit)-/.test(feature.layer?.id ?? ''))?.properties?.cableId;
    if (cableId && !placingKind) {
      setSelectedElement(null);
      setSelectedCable({ id: cableId });
      return;
    }

    if (placingKind) {
      let { lat, lng } = e.lngLat as { lat: number; lng: number };
      // El tipo de manga se elige en el formulario. Si no hay un poste cercano, el servidor valida
      // que se trate de una manga de empalme antes de guardar la ubicación.
      if (placingKind !== 'ODF' && !(activeTool === 'add-manga-empalme' && cableId)) {
        const pole = snapToPole(lat, lng);
        if (pole) {
          lat = pole.lat;
          lng = pole.lng;
        } else if (placingKind === 'NAP') {
          setMapHint(poleHint(NAP_RULE));
          return;
        }
      }
      setMapHint(null);
      const screen = mapRef.current?.project([lng, lat]) ?? e.point;
      setMapClickCoord({ lng, lat, x: screen.x, y: screen.y, cableId: activeTool === 'add-manga-empalme' ? cableId : undefined });
    } else if (activeTool === 'select') {
      setMapClickCoord(null);
    }
  };

  const handleMapContextMenu = (e: any) => {
    // Right click never adds a point. Prevent the browser menu while tracing because the
    // same button is reserved for moving the map with a drag.
    if (isTracing) {
      e.preventDefault?.();
      e.originalEvent?.preventDefault?.();
    }
  };

  const handleMapMouseDown = (e: any) => {
    if (!isTracing || e.originalEvent?.button !== 2) return;
    e.preventDefault?.();
    e.originalEvent?.preventDefault?.();
    rightPanRef.current = { active: true, x: e.point.x, y: e.point.y };
  };

  const handleMapMouseUp = (e: any) => {
    if (e.originalEvent?.button === 2) rightPanRef.current.active = false;
  };

  const handleMapMouseMove = (e: any) => {
    if (!snappingPoles) return;
    if (isTracing && rightPanRef.current.active) {
      const deltaX = rightPanRef.current.x - e.point.x;
      // Screen Y grows downward while geographic map movement feels natural upward;
      // invert only this axis so a right-drag follows the user's hand vertically.
      const deltaY = rightPanRef.current.y - e.point.y;
      mapRef.current?.panBy([deltaX, deltaY], { animate: false });
      rightPanRef.current = { active: true, x: e.point.x, y: e.point.y };
      return;
    }
    const { lat, lng } = e.lngLat as { lat: number; lng: number };
    // Trazando o modificando: poste o dispositivo. Colocando una NAP o una manga: solo postes.
    const target = isTracing || pathEdit ? routePointAt(lat, lng) : snapToPole(lat, lng);
    const same = (prev: { lat: number; lng: number } | null) => (target && prev && prev.lat === target.lat && prev.lng === target.lng) || (!target && !prev);
    setSnapHover((prev) => (same(prev) ? prev : target ? { lat: target.lat, lng: target.lng } : null));
    if (isTracing && cablePoints.length > 0) {
      setCableCursor(target ? { lat: target.lat, lng: target.lng } : { lat, lng });
    }
  };

  const handleUndoCablePoint = () => {
    setCablePoints((prev) => prev.slice(0, -1));
  };

  const handleCancelCable = () => {
    setCablePoints([]);
    setCableCursor(null);
    setActiveTool('select');
  };

  const handleFinishRoute = async () => {
    if (cablePoints.length < 2) return;
    setSavingRoute(true);
    try {
      const res = await apiFetch('/cables', {
        method: 'POST',
        body: JSON.stringify({
          fiberCount,
          points: cablePoints.map(({ lat, lng }) => ({ lat, lng })),
        }),
      });
      const created = await readJson(res, 'No se pudo guardar la fibra');
      setCablePoints([]);
      setCableCursor(null);
      setActiveTool('select');
      await fetchCables();
      // El backend conecta la fibra a cada dispositivo que atraviesa; se muestra el resultado.
      setSelectedCable({ id: created.id });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo guardar la fibra');
    } finally {
      setSavingRoute(false);
    }
  };

  const handleSaveNode = async (values: NewElementValues) => {
    if (!mapClickCoord || !placingKind) return;
    // Errors propagate to the form, which shows them inline next to the fields.
    const created = await createElement(placingKind, values);
    setSelectedElement(created);
    setMapClickCoord(null);
    setActiveTool('select');
    refreshMapData();
  };

  const handleDeleteElement = async (element: NetworkElement) => {
    if (preferences.confirmDestructiveActions && !window.confirm(`¿Eliminar "${element.name || element.code}"?`)) return;
    try {
      await deleteElement(element);
      setSelectedElement(null);
      refreshMapData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo eliminar el elemento');
    }
  };

  const handleUpdateElement = async (values: Record<string, any>) => {
    if (!editingElement) return;
    const updated = await updateElement(editingElement, values);
    setEditingElement(null);
    setSelectedElement(updated);
    refreshMapData();
  };

  const handleOpenBoxEditor = (element: NetworkElement) => {
    if (!hasInterior(element)) return;
    setPreloadBoxId(element.id);
    setActiveTab('box-editor');
  };

  const openTrace = (kind: ElementKind, id: string, fiberId: string | null = null) => {
    setPreloadBoxId(id);
    setPreloadKind(kind);
    setPreloadFiberId(fiberId);
    setConnectionsTableTarget(null);
    setActiveTab('trace');
  };

  const handleViewConnections = (element: NetworkElement) => openTrace(element.kind, element.id);

  // On narrow screens the sidebar is an off-canvas drawer; picking a section should close
  // it automatically so the user immediately sees the content instead of an empty drawer.
  const handleSelectTab = (tab: string) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  // Dispositivos por cuyo centro va pasando el trazado (sin repetir, en orden).
  const traceConnections = cablePoints
    .map((p) => p.ref)
    .filter((ref, index, all): ref is NonNullable<typeof ref> => !!ref && all.findIndex((r) => r?.id === ref.id) === index);

  return (
    <div className="app-container">
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <button
        type="button"
        className="mobile-menu-toggle icon-button"
        onClick={() => setSidebarOpen((prev) => !prev)}
        aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
      >
        {sidebarOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>

      {/* Sidebar */}
      <aside id="app-sidebar" className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <Activity className="logo-icon" aria-hidden="true" />
            <span className="logo-text">FiberMap</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Secciones principales">
          <button
            className={`nav-item ${activeTab === 'operations' ? 'active' : ''}`}
            onClick={() => handleSelectTab('operations')}
            aria-current={activeTab === 'operations' ? 'page' : undefined}
          >
            <LayoutDashboard className="nav-icon" aria-hidden="true" />
            <span>Operaciones</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => handleSelectTab('map')}
            aria-current={activeTab === 'map' ? 'page' : undefined}
          >
            <MapPin className="nav-icon" aria-hidden="true" />
            <span>Mapa FTTH</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'pole-import' ? 'active' : ''}`}
            onClick={() => handleSelectTab('pole-import')}
            aria-current={activeTab === 'pole-import' ? 'page' : undefined}
          >
            <Upload className="nav-icon" aria-hidden="true" />
            <span>Importar postes KMZ</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'nodes' ? 'active' : ''}`}
            onClick={() => handleSelectTab('nodes')}
            aria-current={activeTab === 'nodes' ? 'page' : undefined}
          >
            <Server className="nav-icon" aria-hidden="true" />
            <span>Elementos de Red</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'clients' ? 'active' : ''}`}
            onClick={() => handleSelectTab('clients')}
            aria-current={activeTab === 'clients' ? 'page' : undefined}
          >
            <Users className="nav-icon" aria-hidden="true" />
            <span>Clientes</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-user-email">{user.email}</span>
            <span className="sidebar-user-roles">{user.roles.join(', ')}</span>
          </div>
          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => handleSelectTab('settings')}
            aria-current={activeTab === 'settings' ? 'page' : undefined}
          >
            <Settings className="nav-icon" aria-hidden="true" />
            <span>Ajustes</span>
          </button>
          <button className="nav-item" onClick={logout}>
            <LogOut className="nav-icon" aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {connectionLost && !connectionNoticeClosed && (
          <DismissibleAlert className="connection-banner" onClose={() => setConnectionNoticeClosed(true)}>
            Sin conexión con el servidor. Reintentando automáticamente...{' '}
            <button type="button" onClick={refreshMapData}>Reintentar ahora</button>
          </DismissibleAlert>
        )}
        {activeTab === 'operations' && (
          <OperationsPage onNavigate={handleSelectTab} />
        )}
        <div className="map-wrapper" style={{ display: activeTab === 'map' ? 'block' : 'none' }}>
            <Map
              mapLib={maplibregl}
              ref={(instance) => {
                mapRef.current = instance?.getMap() ?? null;
              }}
              onLoad={() => setMapLoaded(true)}
              initialViewState={{
                longitude: -74.006,
                latitude: 40.7128,
                zoom: 12
              }}
              style={{ width: '100%', height: '100%' }}
              mapStyle={BASE_MAP_STYLE}
              onClick={handleMapClick}
              onContextMenu={handleMapContextMenu}
              onMouseDown={handleMapMouseDown}
              onMouseUp={handleMapMouseUp}
              onMouseMove={handleMapMouseMove}
              onMoveEnd={schedulePoleFetch}
              cursor={isTracing ? 'crosshair' : pathEdit ? 'copy' : undefined}
              dragPan={!isTracing}
              dragRotate={!isTracing}
              interactiveLayerIds={['osm-tiles-layer', ...cables.flatMap((cable) => [`cable-layer-${cable.id}`, `cable-hit-${cable.id}`])]}
            >
              <NavigationControl position="top-right" />
              <ScaleControl position="bottom-right" unit="metric" maxWidth={110} />
              <MapScaleIndicator polesEnabled={preferences.showImportedPoles || snappingPoles} />

              <MapToolbar activeTool={activeTool} onToolSelect={setActiveTool} />

              {elements.map((el) => (
                <Marker
                  key={`${el.kind}-${el.id}`}
                  longitude={el.lng}
                  latitude={el.lat}
                  anchor="center"
                  onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    if (isTracing) {
                      addCablePoint({ lat: el.lat, lng: el.lng, ref: { type: el.kind, id: el.id } });
                      return;
                    }
                    if (pathEdit) return;
                    setSelectedElement(el);
                    setActiveTool('select');
                  }}
                >
                  <div
                    style={{
                      ...markerShape(el),
                      backgroundColor: elementColor(el),
                      cursor: isTracing ? 'crosshair' : 'pointer',
                    }}
                    title={`${el.code} (${ELEMENT_LABELS[el.kind]})`}
                  />
                </Marker>
              ))}

              {/* Marker uses CSS pixels, so it remains a small fixed-size point at every zoom. */}
              {(preferences.showImportedPoles || snappingPoles) && poles.length > 0 && (
                <Source id="imported-poles" type="geojson" data={poleGeoJson}>
                  <Layer
                    id="imported-poles-layer"
                    type="circle"
                    // Se oculta en cuanto el zoom baja del umbral, sin esperar a que se vuelvan a pedir los datos.
                    minzoom={POLE_MIN_ZOOM}
                    paint={{
                      'circle-radius': ['interpolate', ['linear'], ['zoom'], POLE_MIN_ZOOM, 3.5, 20, 5.5],
                      'circle-color': '#000000',
                      'circle-stroke-color': '#ffffff',
                      'circle-stroke-width': 0.8,
                    }}
                  />
                </Source>
              )}

              {cables.map((cable) =>
                cable.path?.length >= 2 ? (
                  <Source
                    key={cable.id}
                    id={`cable-${cable.id}`}
                    type="geojson"
                    data={{
                      type: 'Feature',
                      properties: { cableId: cable.id },
                      geometry: {
                        type: 'LineString',
                        coordinates: cable.path.map((p) => [p.lng, p.lat]),
                      },
                    }}
                  >
                    <Layer
                      id={`cable-layer-${cable.id}`}
                      type="line"
                      paint={{
                        'line-color': cableColor(cable),
                        'line-width': fiberWidth(cable.fiberCount),
                        'line-opacity': pathEdit?.cableId === cable.id ? 0.25 : 1,
                      }}
                      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    />
                    {/* Franja invisible más ancha: hace mucho más fácil acertar el clic sobre la fibra. */}
                    <Layer
                      id={`cable-hit-${cable.id}`}
                      type="line"
                      paint={{ 'line-color': '#000000', 'line-width': 16, 'line-opacity': 0.01 }}
                      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    />
                  </Source>
                ) : null,
              )}

              {cablePoints.length >= 2 && (
                <Source
                  id="cable-draft"
                  type="geojson"
                  data={{
                    type: 'Feature',
                    properties: {},
                    geometry: {
                      type: 'LineString',
                      coordinates: cablePoints.map((p) => [p.lng, p.lat]),
                    },
                  }}
                >
                  <Layer
                    id="cable-draft-layer"
                    type="line"
                    paint={{ 'line-color': fiberColor, 'line-width': 4 }}
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  />
                </Source>
              )}

              {/* Rubber-band segment: the line keeps extending live from the last confirmed
                  point toward the cursor, until the next click plants a new point. */}
              {cablePoints.length >= 1 && cableCursor && (
                <Source
                  id="cable-draft-preview"
                  type="geojson"
                  data={{
                    type: 'Feature',
                    properties: {},
                    geometry: {
                      type: 'LineString',
                      coordinates: [
                        [cablePoints[cablePoints.length - 1].lng, cablePoints[cablePoints.length - 1].lat],
                        [cableCursor.lng, cableCursor.lat],
                      ],
                    },
                  }}
                >
                  <Layer
                    id="cable-draft-preview-layer"
                    type="line"
                    paint={{ 'line-color': fiberColor, 'line-width': 3, 'line-opacity': 0.7, 'line-dasharray': [2, 1.5] }}
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  />
                </Source>
              )}

              {snappingPoles && snapHover && (
                <Marker longitude={snapHover.lng} latitude={snapHover.lat} anchor="center" style={{ pointerEvents: 'none' }}>
                  <div className="snap-ring" />
                </Marker>
              )}

              {cablePoints.map((p, i) => (
                <Marker key={`cable-point-${i}`} longitude={p.lng} latitude={p.lat} anchor="center">
                  <div
                    title={p.ref ? 'Conectada a este dispositivo' : undefined}
                    style={{
                      width: p.ref ? '12px' : '8px',
                      height: p.ref ? '12px' : '8px',
                      backgroundColor: p.ref ? '#ffffff' : '#0f172a',
                      borderRadius: '50%',
                      border: `2px solid ${fiberColor}`,
                      boxShadow: p.ref ? '0 0 0 2px rgba(255,255,255,0.5)' : undefined,
                    }}
                  />
                </Marker>
              ))}

              {pathEdit && (
                <>
                  <Source
                    id="path-edit"
                    type="geojson"
                    data={{
                      type: 'Feature',
                      properties: {},
                      geometry: { type: 'LineString', coordinates: pathEdit.points.map((p) => [p.lng, p.lat]) },
                    }}
                  >
                    <Layer
                      id="path-edit-layer"
                      type="line"
                      paint={{ 'line-color': pathEdit.color, 'line-width': 4, 'line-dasharray': [2, 1.2] }}
                      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    />
                  </Source>
                  {pathEdit.points.map((p, i) => (
                    <Marker
                      key={`path-vertex-${i}`}
                      longitude={p.lng}
                      latitude={p.lat}
                      anchor="center"
                      draggable
                      onClick={(e) => e.originalEvent.stopPropagation()}
                      onDragStart={() => {
                        pathDragOrigin.current = { lat: p.lat, lng: p.lng };
                      }}
                      onDrag={(e) => movePathPoint(i, e.lngLat.lat, e.lngLat.lng)}
                      onDragEnd={(e) => {
                        const snapped = routePointAt(e.lngLat.lat, e.lngLat.lng);
                        if (snapped) {
                          movePathPoint(i, snapped.lat, snapped.lng);
                          setMapHint(null);
                          return;
                        }
                        // Soltado lejos de un poste: vuelve a donde estaba.
                        const origin = pathDragOrigin.current;
                        if (origin) movePathPoint(i, origin.lat, origin.lng);
                        setMapHint(poleHint(TRACE_RULE));
                      }}
                    >
                      <div
                        className="path-vertex"
                        style={{ borderColor: pathEdit.color }}
                        title={pathEdit.points.length > 2 ? 'Arrastra para mover · doble clic o clic derecho para quitar' : 'Arrastra para mover'}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removePathPoint(i);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          removePathPoint(i);
                        }}
                      />
                    </Marker>
                  ))}
                </>
              )}

              {mapClickCoord && placingKind && (
                <CreateNodeForm
                  key={placingKind}
                  lng={mapClickCoord.lng}
                  lat={mapClickCoord.lat}
                  kind={placingKind}
                  initialMangaType={activeTool === 'add-manga-empalme' ? 'EMPALME' : 'DISTRIBUCION'}
                  cableId={mapClickCoord.cableId}
                  onClose={() => setMapClickCoord(null)}
                  onSave={handleSaveNode}
                />
              )}

              {selectedElement && activeTool === 'select' && (
                <ElementPropertiesPanel
                  element={selectedElement}
                  onClose={() => setSelectedElement(null)}
                  onOpenEditor={() => handleOpenBoxEditor(selectedElement)}
                  onEdit={() => setEditingElement(selectedElement)}
                  onDelete={() => handleDeleteElement(selectedElement)}
                  onViewConnections={() => handleViewConnections(selectedElement)}
                  onViewConnectionsTable={() => setConnectionsTableTarget({ kind: selectedElement.kind, id: selectedElement.id })}
                />
              )}

            </Map>

            {mapHint ? (
              <DismissibleAlert className="map-hint map-hint-warning" onClose={() => setMapHint(null)}>{mapHint}</DismissibleAlert>
            ) : (
              (placingKind === 'NAP' || placingKind === 'MANGA') && (
                <div className="map-hint" role="status">
                  {placingKind === 'NAP'
                    ? 'Caja NAP: haz clic sobre un poste (punto negro). Si no los ves, acércate.'
                    : 'Manga: haz clic donde va. Si hay un poste cerca se imanta a él; si no cabe en un poste, colócala al lado.'}
                </div>
              )
            )}

            {isTracing && (
              <DrawPanel ariaLabel="Trazando fibra" title={'Trazando fibra'}>
                <p>
                  <strong>Empieza en el centro</strong> de un ODF, una manga o una caja NAP (puede seguir de una NAP a otra NAP o a una manga; un ODF solo se conecta con mangas): haz clic sobre ella (se imanta sola).
                  Después ve <strong>de poste en poste</strong>: cada punto se imanta al poste más cercano y no se puede
                  colocar fuera de uno. Cada dispositivo sobre el que hagas clic (u ODF/manga/NAP al que se imante el clic) se conecta
                  automáticamente con una configuración por defecto, que podrás cambiar después; uno por el que la línea solo pase cerca,
                  sin haberle hecho clic, no se conecta. Mantén y arrastra el botón <strong>derecho</strong> para mover el mapa.
                </p>
                <p className="muted" aria-live="polite">{cablePoints.length} punto(s) agregado(s)</p>
                {cablePoints.length > 0 && !cablePoints[0].ref && (
                  <p className="trace-warning" role="alert">El primer punto debe estar en el centro de un dispositivo.</p>
                )}
                {traceConnections.length > 0 && (
                  <ul className="trace-connections" aria-label="Dispositivos conectados hasta ahora">
                    {traceConnections.map((c, i) => (
                      <li key={`${c.type}-${c.id}`}>
                        <span>{i === 0 ? 'Inicio' : 'Paso'}</span> {ELEMENT_LABELS[c.type]} {elements.find((el) => el.id === c.id)?.code}
                      </li>
                    ))}
                  </ul>
                )}
                <label className="visually-hidden" htmlFor="fiber-count-select">Hilos de la fibra</label>
                <select id="fiber-count-select" value={fiberCount} onChange={(e) => setFiberCount(Number(e.target.value))}>
                  {CABLE_FIBER_COUNTS.map((c) => (
                    <option key={c} value={c}>Fibra de {fiberCountLabel(c)}</option>
                  ))}
                </select>
                <div className="cable-draw-actions">
                  <button
                    className="btn-secondary"
                    onClick={handleUndoCablePoint}
                    disabled={cablePoints.length === 0}
                    aria-label="Deshacer el último punto agregado"
                  >
                    Deshacer punto
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={handleClearCable}
                    disabled={cablePoints.length === 0}
                    aria-label="Borrar todos los puntos y empezar de nuevo"
                  >
                    Borrar todo
                  </button>
                  <button className="btn-secondary" onClick={handleCancelCable} aria-label="Cancelar el trazado de la fibra">
                    Cancelar
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleFinishRoute}
                    disabled={cablePoints.length < 2 || !cablePoints[0]?.ref || savingRoute}
                    aria-label="Finalizar y guardar la fibra"
                  >
                    {savingRoute ? 'Guardando...' : 'Finalizar fibra'}
                  </button>
                </div>
              </DrawPanel>
            )}

            {pathEdit && (
              <DrawPanel ariaLabel="Modificando trazado de la fibra" title={`Modificando ${pathEdit.code}`}>
                <p>
                  <strong>Arrastra</strong> los puntos para mover la fibra. <strong>Haz clic sobre la línea</strong> para agregar un
                  punto de giro y <strong>doble clic</strong> (o clic derecho) sobre un punto para quitarlo. Cada punto se imanta a un poste (o al
                  centro de un dispositivo): si lo sueltas lejos de uno vuelve a donde estaba. La fibra debe seguir
                  empezando en el centro de un ODF, una manga o una caja NAP (un ODF solo se conecta con mangas).
                </p>
                <p className="muted" aria-live="polite">{pathEdit.points.length} punto(s)</p>
                {pathError && <DismissibleAlert className="trace-warning" onClose={() => setPathError(null)}>{pathError}</DismissibleAlert>}
                <div className="cable-draw-actions">
                  <button className="btn-secondary" onClick={restorePathEdit} disabled={savingRoute}>Descartar cambios</button>
                  <button className="btn-secondary cable-delete-inline" onClick={deletePathCable} disabled={savingRoute}>Eliminar fibra</button>
                </div>
                <div className="cable-draw-actions">
                  <button className="btn-secondary" onClick={cancelPathEdit}>Cancelar</button>
                  <button className="btn-primary" onClick={savePathEdit} disabled={savingRoute}>
                    {savingRoute ? 'Guardando...' : 'Guardar trazado'}
                  </button>
                </div>
              </DrawPanel>
            )}

            <div className="map-overlay">
              <div className={`overlay-panel ${legendOpen ? 'expanded' : 'collapsed'}`}>
                <button
                  type="button"
                  className="overlay-panel-toggle"
                  onClick={() => setLegendOpen((prev) => !prev)}
                  aria-expanded={legendOpen}
                  aria-controls="infrastructure-legend-body"
                >
                  <h3>Infraestructura</h3>
                  {legendOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronUp size={16} aria-hidden="true" />}
                </button>
                {legendOpen && (
                  <div className="overlay-panel-body" id="infrastructure-legend-body">
                    <div className="legend-item">
                      <span style={{ ...markerShape({ kind: 'ODF' } as NetworkElement), backgroundColor: ELEMENT_COLORS.ODF, display: 'inline-block' }}></span> ODF
                    </div>
                    {MANGA_TYPES.map((t) => (
                      <div className="legend-item" key={t.value}>
                        <span style={{ ...markerShape({ kind: 'MANGA' } as NetworkElement), backgroundColor: MANGA_COLORS[t.value], display: 'inline-block' }}></span> Manga {MANGA_TYPE_LABELS[t.value].toLowerCase()}
                      </div>
                    ))}
                    <div className="legend-item">
                      <span style={{ ...markerShape({ kind: 'NAP' } as NetworkElement), backgroundColor: ELEMENT_COLORS.NAP, display: 'inline-block' }}></span> Caja NAP
                    </div>
                    <div className="legend-item">
                      <span className="pole-marker pole-marker-legend" aria-hidden="true"></span> Poste importado (se ve al acercar el zoom)
                    </div>
                    {CABLE_FIBER_COUNTS.map((count) => (
                      <div className="legend-item" key={`fiber-${count}`}>
                        <span style={{ backgroundColor: defaultFiberColor(count), width: 18, height: 3, display: 'inline-block' }}></span> Fibra de {fiberCountLabel(count)} ({FIBER_COLOR_BY_COUNT[count].name.toLowerCase()})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedCable && (
              <CableInspectorModal cableId={selectedCable.id} onClose={() => setSelectedCable(null)} onEditPath={startPathEdit} onChanged={fetchCables} confirmDelete={preferences.confirmDestructiveActions} />
            )}
        </div>

        {activeTab === 'pole-import' && (
          <PoleImportPage onImportCompleted={fetchPoles} onOpenMap={() => handleSelectTab('map')} />
        )}

        {activeTab === 'nodes' && (
          <NodesPage
            onViewFiber={(fiber) => {
              setActiveTool('select');
              setSelectedElement(null);
              setSelectedCable({ id: fiber.id });
              if (fiber.path[0]) flyToLocation(fiber.path[0].lng, fiber.path[0].lat);
            }}
            onViewElement={(element) => {
              setSelectedElement(element);
              setActiveTool('select');
              flyToLocation(element.lng, element.lat);
            }}
          />
        )}

        {activeTab === 'clients' && (
          <ClientsPage />
        )}

        {activeTab === 'box-editor' && (
          <BoxEditorPage initialBoxId={preloadBoxId} onConsumeInitialBoxId={() => setPreloadBoxId(null)} />
        )}

        {activeTab === 'trace' && (
          <TracePage initialBoxId={preloadBoxId} initialDeviceKind={preloadKind} initialFiberId={preloadFiberId}
            onConsumeInitialBoxId={() => { setPreloadBoxId(null); setPreloadKind(null); setPreloadFiberId(null); }}
            onOpenConnections={(kind, id) => setConnectionsTableTarget({ kind, id })} />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            user={user}
            preferences={preferences}
            onPreferencesSaved={(saved) => {
              const next = { ...DEFAULT_PREFERENCES, ...saved };
              setPreferences(next);
              setLegendOpen(next.showLegend);
            }}
          />
        )}
      </main>

      {connectionsTableTarget && (
        <ConnectionsTableModal elementKind={connectionsTableTarget.kind} elementId={connectionsTableTarget.id}
          onClose={() => setConnectionsTableTarget(null)}
          onTrace={(fiberId) => openTrace(connectionsTableTarget.kind, connectionsTableTarget.id, fiberId)} />
      )}

      {editingElement && (
        <EditEntityModal
          title={`Editar ${ELEMENT_LABELS[editingElement.kind]}: ${editingElement.name || editingElement.code}`}
          initialValues={elementEditValues(editingElement)}
          onClose={() => setEditingElement(null)}
          onSave={handleUpdateElement}
          fields={elementEditFields(editingElement)}
        />
      )}
    </div>
  );
}

export default App;

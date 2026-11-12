import { MousePointer2, Box, Route, LayoutGrid, Cylinder } from 'lucide-react';
import { useState } from 'react';
import './MapToolbar.css';

interface MapToolbarProps {
  activeTool: string;
  onToolSelect: (tool: string) => void;
}

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar' },
  { id: 'add-odf', icon: LayoutGrid, label: 'Agregar ODF' },
  { id: 'add-manga', icon: Cylinder, label: 'Agregar manga' },
  { id: 'add-nap', icon: Box, label: 'Agregar caja NAP' },
  { id: 'add-cable', icon: Route, label: 'Trazar fibra' },
];

export function MapToolbar({ activeTool, onToolSelect }: MapToolbarProps) {
  const [mangaMenuOpen, setMangaMenuOpen] = useState(false);
  return (
    <div className="map-toolbar" role="toolbar" aria-label="Herramientas del mapa" aria-orientation="horizontal">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={`toolbar-btn icon-button ${activeTool === tool.id || (tool.id === 'add-manga' && activeTool === 'add-manga-empalme') ? 'active' : ''}`}
          onClick={() => {
            if (tool.id === 'add-manga') setMangaMenuOpen((open) => !open);
            else { setMangaMenuOpen(false); onToolSelect(tool.id); }
          }}
          title={tool.label}
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id || (tool.id === 'add-manga' && activeTool === 'add-manga-empalme')}
          aria-expanded={tool.id === 'add-manga' ? mangaMenuOpen : undefined}
        >
          <tool.icon size={20} aria-hidden="true" />
          <span className="tooltip">{tool.label}</span>
        </button>
      ))}
      {mangaMenuOpen && <div className="manga-tool-menu" role="group" aria-label="Tipo de manga">
        <button type="button" onClick={() => { onToolSelect('add-manga'); setMangaMenuOpen(false); }}>Manga de distribución</button>
        <button type="button" onClick={() => { onToolSelect('add-manga-empalme'); setMangaMenuOpen(false); }}>Manga de empalme</button>
      </div>}
    </div>
  );
}

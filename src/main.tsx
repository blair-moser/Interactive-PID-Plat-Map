import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Copy, Download, ExternalLink, Plus, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import './styles.css';

type MapDot = {
  id: string;
  parcelNumber: string;
  projectName: string;
  shortDetails: string;
  x: number;
  y: number;
  color: string;
  platImage: string;
  siteUrl: string;
};

type DotBackup = {
  version: 1;
  savedAt: string;
  dots: MapDot[];
};

const STORAGE_KEY = 'pid-plat-map-dots';
const BACKUP_KEY = 'pid-plat-map-dots-backups';
const DOTS_FILE_PATH = `${import.meta.env.BASE_URL}dots.json`;
const DEFAULT_MAP_IMAGE = `${import.meta.env.BASE_URL}pid-no-1-map.png`;

const initialDots: MapDot[] = [
  {
    id: 'dot-1',
    parcelNumber: 'Parcel 1',
    projectName: 'Project Area 1',
    shortDetails: 'Starter dot. Drag in edit mode and replace these details.',
    x: 44,
    y: 34,
    color: '#3b6ea8',
    platImage: 'pid-no-1-map.png',
    siteUrl: '',
  },
  {
    id: 'dot-2',
    parcelNumber: 'Parcel 2',
    projectName: 'Project Area 2',
    shortDetails: 'Add the destination site link and detail plat image for this point.',
    x: 58,
    y: 46,
    color: '#8073ac',
    platImage: 'pid-no-1-map.png',
    siteUrl: '',
  },
  {
    id: 'dot-3',
    parcelNumber: 'Parcel 3',
    projectName: 'Project Area 3',
    shortDetails: 'Hover shows this short summary; click opens the detail overlay.',
    x: 36,
    y: 58,
    color: '#66a61e',
    platImage: 'pid-no-1-map.png',
    siteUrl: '',
  },
];

function App() {
  const mapViewportRef = useRef<HTMLElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ id: string; moved: boolean } | null>(null);
  const [dots, setDots] = useState<MapDot[]>(loadSavedDots);
  const [canSaveDots, setCanSaveDots] = useState(hasBrowserDots);
  const [selectedDotId, setSelectedDotId] = useState<string | null>(null);
  const [activeDotId, setActiveDotId] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<'editor' | 'client'>(() =>
    window.location.hash === '#client' ? 'client' : 'editor',
  );
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [saveMessage, setSaveMessage] = useState('Loaded');

  const selectedDot = dots.find((dot) => dot.id === selectedDotId) ?? null;
  const activeDot = dots.find((dot) => dot.id === activeDotId) ?? null;
  const isClientView = pageMode === 'client';

  const sortedDots = useMemo(
    () => [...dots].sort((a, b) => a.projectName.localeCompare(b.projectName)),
    [dots],
  );

  useEffect(() => {
    if (selectedDotId && !dots.some((dot) => dot.id === selectedDotId)) {
      setSelectedDotId(null);
    }
  }, [dots, selectedDotId]);

  useEffect(() => {
    if (!canSaveDots) return;
    saveDots(dots);
    setSaveMessage(`Saved ${dots.length} dots at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  }, [canSaveDots, dots]);

  useEffect(() => {
    if (canSaveDots) return;

    fetch(DOTS_FILE_PATH, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('dots.json could not be loaded');
        return response.json();
      })
      .then((value) => {
        if (isDotList(value)) {
          setDots(value);
          setSaveMessage(`Loaded ${value.length} dots from dots.json`);
        }
      })
      .catch(() => {
        setSaveMessage('Loaded starter dots');
      })
      .finally(() => {
        setCanSaveDots(true);
      });
  }, [canSaveDots]);

  useEffect(() => {
    function handleHashChange() {
      setPageMode(window.location.hash === '#client' ? 'client' : 'editor');
      setActiveDotId(null);
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  function updateDot(id: string, patch: Partial<MapDot>) {
    setDots((current) => current.map((dot) => (dot.id === id ? { ...dot, ...patch } : dot)));
  }

  function addDot() {
    const nextDot: MapDot = {
      id: `dot-${Date.now()}`,
      parcelNumber: '',
      projectName: 'Western Mortgage & Realty Co.',
      shortDetails: '',
      x: 50,
      y: 50,
      color: '#000000',
      platImage: '',
      siteUrl: '',
    };
    setDots((current) => [...current, nextDot]);
    setSelectedDotId(nextDot.id);
  }

  function duplicateSelectedDot() {
    if (!selectedDot) return;

    const duplicatedDot: MapDot = {
      ...selectedDot,
      id: `dot-${Date.now()}`,
      x: clamp(selectedDot.x + 1.5, 0, 100),
      y: clamp(selectedDot.y + 1.5, 0, 100),
    };

    setDots((current) => [...current, duplicatedDot]);
    setSelectedDotId(duplicatedDot.id);
  }

  function removeSelectedDot() {
    if (!selectedDot || dots.length <= 1) return;
    setDots((current) => current.filter((dot) => dot.id !== selectedDot.id));
    setActiveDotId((current) => (current === selectedDot.id ? null : current));
  }

  function exportDots() {
    const file = new Blob([JSON.stringify(dots, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dots.json';
    link.click();
    URL.revokeObjectURL(url);
    setSaveMessage(`Exported ${dots.length} dots`);
  }

  function importDots(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const importedDots = parseDotBackup(String(reader.result));
        if (!importedDots) {
          setSaveMessage('Import failed: file did not contain valid dots');
          return;
        }

        setDots(importedDots);
        setSelectedDotId(null);
        setActiveDotId(null);
        setSaveMessage(`Imported ${importedDots.length} dots`);
      } catch {
        setSaveMessage('Import failed: file could not be read');
      }
    };
    reader.readAsText(file);
  }

  function beginDotDrag(event: React.PointerEvent<HTMLButtonElement>, dot: MapDot) {
    if (isClientView || !mapRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedDotId(dot.id);
    dragState.current = { id: dot.id, moved: false };

    const rect = mapRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const original = { x: dot.x, y: dot.y };

    function move(pointerEvent: PointerEvent) {
      const dx = ((pointerEvent.clientX - startX) / rect.width) * 100;
      const dy = ((pointerEvent.clientY - startY) / rect.height) * 100;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        dragState.current = { id: dot.id, moved: true };
      }
      updateDot(dot.id, {
        x: clamp(original.x + dx, 0, 100),
        y: clamp(original.y + dy, 0, 100),
      });
    }

    function end() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  function handleDotClick(dot: MapDot) {
    setSelectedDotId(dot.id);
    const drag = dragState.current;
    dragState.current = null;
    if (drag?.id === dot.id && drag.moved) return;
    if (!isClientView) return;
    setActiveDotId(dot.id);
  }

  function setBoundedZoom(nextZoom: number) {
    const viewport = mapViewportRef.current;
    if (!viewport) {
      setZoom(clamp(Number(nextZoom.toFixed(2)), 1, 3));
      return;
    }

    const previousWidth = viewport.scrollWidth || 1;
    const centerRatio = (viewport.scrollLeft + viewport.clientWidth / 2) / previousWidth;
    const boundedZoom = clamp(Number(nextZoom.toFixed(2)), 1, 3);

    setZoom(boundedZoom);

    requestAnimationFrame(() => {
      const nextWidth = viewport.scrollWidth || 1;
      viewport.scrollLeft = centerRatio * nextWidth - viewport.clientWidth / 2;
    });
  }

  function resetMapView() {
    setZoom(1);
    mapViewportRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  }

  function beginPan(event: React.PointerEvent<HTMLElement>) {
    if (zoom <= 1 || !mapViewportRef.current) return;
    if ((event.target as Element).closest('.map-dot')) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);

    const viewport = mapViewportRef.current;
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = viewport.scrollLeft;
    const startTop = viewport.scrollTop;

    function move(pointerEvent: PointerEvent) {
      viewport.scrollLeft = startLeft - (pointerEvent.clientX - startX);
      viewport.scrollTop = startTop - (pointerEvent.clientY - startY);
    }

    function end() {
      setIsPanning(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  function handleMapWheel(event: React.WheelEvent<HTMLElement>) {
    const isMostlyVertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
    if (isMostlyVertical && !event.shiftKey) {
      event.preventDefault();
      window.scrollBy({ top: event.deltaY, left: 0, behavior: 'auto' });
    }
  }

  return (
    <main className={`app-shell ${isClientView ? 'client-shell' : ''}`}>
      {!isClientView && (
        <section className="hero">
          <div>
            <h1>Interactive PID Project Plat Map</h1>
            <p>
              Add parcel/project dots to the plat. Hover for quick parcel details, click for an
              in-site detail view with a plat image and linked site.
            </p>
          </div>
          <div className="hero-actions">
            <a className="client-view-link" href="#client">
              Open client view
            </a>
            <div className="backup-actions" aria-label="Dot backup actions">
              <button type="button" onClick={exportDots}>
                <Download size={15} />
                Export dots.json
              </button>
              <button type="button" onClick={() => importInputRef.current?.click()}>
                <Upload size={15} />
                Import dots
              </button>
              <input
                ref={importInputRef}
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={importDots}
              />
            </div>
            <p className="save-message">{saveMessage}</p>
          </div>
        </section>
      )}

      <section className={`layout ${isClientView ? 'client-layout' : ''}`}>
        {!isClientView && (
        <aside className="sidebar dots-sidebar">
          <div className="panel">
            <h2>Dots</h2>
            <div className="legend">
              {sortedDots.map((dot) => (
                <button
                  key={dot.id}
                  type="button"
                  className={`legend-project ${selectedDotId === dot.id ? 'is-selected' : ''}`}
                  onClick={() => {
                    setSelectedDotId(dot.id);
                  }}
                >
                  <span
                    className="swatch"
                    style={{ '--status-color': dot.color } as React.CSSProperties}
                  />
                  <span>
                    {dot.projectName}
                    <small>{dot.parcelNumber}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
        )}

        <section className="map-card" aria-label="Interactive plat map">
          {isClientView && (
            <div className="client-map-guide" aria-label="Project map guide">
              <div className="client-guide-header">
                <div>
                  <p>Interactive project map</p>
                  <h1>PID No. 1 Project Areas</h1>
                </div>
                <span>{dots.length} areas</span>
              </div>
              <p className="client-guide-copy">
                Select a project below or click a dot on the map. Use the zoom buttons to inspect
                the plat, then drag the map to pan while zoomed in.
              </p>
              <div className="client-project-list" aria-label="Project list">
                {sortedDots.map((dot) => (
                  <button
                    key={dot.id}
                    type="button"
                    className={`client-project-button ${selectedDotId === dot.id ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelectedDotId(dot.id);
                      setActiveDotId(dot.id);
                    }}
                  >
                    <span
                      className="client-project-marker"
                      style={{ '--status-color': dot.color } as React.CSSProperties}
                    />
                    <span className="client-project-text">
                      <strong>{dot.projectName || 'Unnamed project'}</strong>
                      <small>{dot.parcelNumber || 'Parcel not assigned'}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="map-zoom-buttons" aria-label="Map zoom controls">
            <button
              type="button"
              onClick={() => setBoundedZoom(zoom + 0.25)}
              disabled={zoom >= 3}
              aria-label="Zoom in"
            >
              <ZoomIn size={17} />
            </button>
            <button
              type="button"
              onClick={() => setBoundedZoom(zoom - 0.25)}
              disabled={zoom <= 1}
              aria-label="Zoom out"
            >
              <ZoomOut size={17} />
            </button>
            <button type="button" onClick={resetMapView} aria-label="Reset zoom">
              {Math.round(zoom * 100)}%
            </button>
          </div>

          <section
            ref={mapViewportRef}
            className={`map-viewport ${isPanning ? 'is-panning' : ''}`}
            onPointerDown={beginPan}
            onWheel={handleMapWheel}
            aria-label="Zoomable plat map viewport"
          >
            <div
              ref={mapRef}
              className={`map-frame ${!isClientView ? 'is-calibrating' : ''}`}
              style={{ '--zoom': zoom } as React.CSSProperties}
            >
              <img src={DEFAULT_MAP_IMAGE} alt="PID No. 1 plat map page 2" draggable={false} />
              <div className="dot-layer">
                {dots.map((dot) => (
                  <button
                    key={dot.id}
                    type="button"
                    className={`map-dot ${selectedDotId === dot.id ? 'is-selected' : ''}`}
                    style={
                      {
                        '--x': `${dot.x}%`,
                        '--y': `${dot.y}%`,
                        '--dot-color': dot.color,
                      } as React.CSSProperties
                    }
                    onPointerDown={(event) => beginDotDrag(event, dot)}
                    onClick={() => handleDotClick(dot)}
                    aria-label={`${dot.projectName}, ${dot.parcelNumber}`}
                  >
                    <span className="dot-tooltip">
                      <strong>{dot.projectName || 'Unnamed project'}</strong>
                      <em>{dot.parcelNumber || 'Parcel not assigned'}</em>
                      <span>{getPublicDetails(dot) || 'Click for project details.'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {activeDot && (
            <div className="detail-overlay" role="dialog" aria-modal="true" aria-label={`${activeDot.projectName} details`}>
              <div className="detail-card">
                <div className="detail-header">
                  <div>
                    <p>{activeDot.parcelNumber || 'Parcel not assigned'}</p>
                    <h2>{activeDot.projectName || 'Unnamed project'}</h2>
                  </div>
                  <button type="button" onClick={() => setActiveDotId(null)} aria-label="Close details">
                    <X size={18} />
                  </button>
                </div>
                <p className="detail-summary">
                  {getPublicDetails(activeDot) || 'No additional project notes are available yet.'}
                </p>

                <div className="detail-grid">
                  <section>
                    <h3>Plat map image</h3>
                    {activeDot.platImage ? (
                      <img src={resolveImagePath(activeDot.platImage)} alt={`${activeDot.projectName} plat map`} />
                    ) : (
                      <div className="empty-detail">No detail plat image is available for this project yet.</div>
                    )}
                  </section>
                  <section>
                    {activeDot.siteUrl ? (
                      <a className="account-overview-link" href={activeDot.siteUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={16} />
                        Open Account Overview
                      </a>
                    ) : (
                      <div className="empty-detail">No linked project site is available for this project yet.</div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          )}
        </section>

        {!isClientView && (
          <aside className="sidebar editor-sidebar">
            {selectedDot ? (
              <div className="panel selected-panel">
                <div className="selected-heading">
                  <h2>{selectedDot.projectName}</h2>
                </div>

                <div className="project-fields">
                  <label>
                    Parcel number
                    <input
                      type="text"
                      value={selectedDot.parcelNumber}
                      onChange={(event) => updateDot(selectedDot.id, { parcelNumber: event.target.value })}
                    />
                  </label>
                  <label>
                    Project name
                    <input
                      type="text"
                      value={selectedDot.projectName}
                      onChange={(event) => updateDot(selectedDot.id, { projectName: event.target.value })}
                    />
                  </label>
                  <label>
                    Short hover details
                    <textarea
                      value={selectedDot.shortDetails}
                      onChange={(event) => updateDot(selectedDot.id, { shortDetails: event.target.value })}
                    />
                  </label>
                  <label>
                    Dot color
                    <input
                      type="color"
                      value={selectedDot.color}
                      onChange={(event) => updateDot(selectedDot.id, { color: event.target.value })}
                    />
                  </label>
                  <label>
                    Detail plat map image path or URL
                    <input
                      type="text"
                      value={selectedDot.platImage}
                      placeholder="my-plat-image.png"
                      onChange={(event) => updateDot(selectedDot.id, { platImage: event.target.value })}
                    />
                  </label>
                  <label>
                    Linked site URL
                    <input
                      type="url"
                      value={selectedDot.siteUrl}
                      placeholder="https://example.com"
                      onChange={(event) => updateDot(selectedDot.id, { siteUrl: event.target.value })}
                    />
                  </label>
                </div>

                <div className="shape-editor">
                  <div className="shape-actions">
                    <button type="button" onClick={addDot}>
                      <Plus size={15} />
                      Add dot
                    </button>
                    <button type="button" onClick={duplicateSelectedDot}>
                      <Copy size={15} />
                      Duplicate selected
                    </button>
                    <button type="button" onClick={removeSelectedDot} disabled={dots.length <= 1}>
                      <Trash2 size={15} />
                      Remove selected
                    </button>
                  </div>
                  <p>Drag a dot on the map to position it. Click a dot to open its detail overlay.</p>
                </div>
              </div>
            ) : (
              <div className="panel empty-selection-panel">
                <h2>No dot selected</h2>
                <p>Select a dot from the map or the Dots list to edit its details.</p>
                <button type="button" onClick={addDot}>
                  <Plus size={15} />
                  Add dot
                </button>
              </div>
            )}
          </aside>
        )}
      </section>
    </main>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPublicDetails(dot: MapDot) {
  const detail = dot.shortDetails.trim();
  const starterCopy = [
    'Starter dot. Drag in edit mode and replace these details.',
    'Add the destination site link and detail plat image for this point.',
    'Hover shows this short summary; click opens the detail overlay.',
  ];

  return starterCopy.includes(detail) ? '' : detail;
}

function resolveImagePath(path: string) {
  const trimmedPath = path.trim();
  if (!trimmedPath) return '';
  if (/^(https?:|data:|blob:)/i.test(trimmedPath)) return trimmedPath;
  if (trimmedPath.startsWith(import.meta.env.BASE_URL)) return trimmedPath;
  return `${import.meta.env.BASE_URL}${trimmedPath.replace(/^\/+/, '')}`;
}

function createBackup(dots: MapDot[]): DotBackup {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    dots,
  };
}

function saveDots(dots: MapDot[]) {
  const backup = createBackup(dots);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));

  const previousBackups = loadBackups();
  const previousDots = previousBackups[0]?.dots;
  const backups =
    previousDots && JSON.stringify(previousDots) === JSON.stringify(dots)
      ? [backup, ...previousBackups.slice(1)]
      : [backup, ...previousBackups];

  localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, 50)));
}

function loadSavedDots() {
  return loadBrowserDots() ?? initialDots;
}

function hasBrowserDots() {
  try {
    return Boolean(loadBrowserDots());
  } catch {
    return false;
  }
}

function loadBrowserDots() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedDots = saved ? parseDotBackup(saved) : null;
    if (savedDots) return savedDots;

    const latestBackup = loadBackups()[0]?.dots;
    if (latestBackup && isDotList(latestBackup)) return latestBackup;

    return null;
  } catch {
    return null;
  }
}

function loadBackups() {
  try {
    const saved = localStorage.getItem(BACKUP_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isDotBackup).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

function parseDotBackup(value: string) {
  const parsed = JSON.parse(value);
  if (isDotList(parsed)) return parsed;
  if (isDotBackup(parsed)) return parsed.dots;
  return null;
}

function isDotBackup(value: unknown): value is DotBackup {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DotBackup>;
  return candidate.version === 1 && typeof candidate.savedAt === 'string' && isDotList(candidate.dots);
}

function isDotList(value: unknown): value is MapDot[] {
  if (!Array.isArray(value) || value.length === 0) return false;

  return value.every((dot) => {
    if (!dot || typeof dot !== 'object') return false;
    const candidate = dot as Partial<MapDot>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.parcelNumber === 'string' &&
      typeof candidate.projectName === 'string' &&
      typeof candidate.shortDetails === 'string' &&
      typeof candidate.color === 'string' &&
      typeof candidate.platImage === 'string' &&
      typeof candidate.siteUrl === 'string' &&
      typeof candidate.x === 'number' &&
      typeof candidate.y === 'number'
    );
  });
}

createRoot(document.getElementById('root')!).render(<App />);

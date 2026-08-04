import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Copy, ExternalLink, FileText, Image, Plus, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import './styles.css';

declare global {
  interface Window {
    pidPlatMapRoot?: ReturnType<typeof createRoot>;
  }
}

type ProjectAccount = {
  id: string;
  taxId: string;
  label: string;
  owner: string;
  accountUrl: string;
  platImage?: string;
};

type ProjectPlatMap = {
  id: string;
  title: string;
  file: string;
  type: 'image' | 'pdf';
};

type ProjectPoint = {
  id: string;
  projectName: string;
  shortDetails: string;
  x: number;
  y: number;
  color: string;
  taxIds: ProjectAccount[];
  projectPlatMap?: ProjectPlatMap;
};

type ProjectBackup = {
  version: 2;
  dataRevision?: string;
  savedAt: string;
  projects: ProjectPoint[];
};

const STORAGE_KEY = 'pid-plat-map-projects-workbook-reconciled-v5';
const BACKUP_KEY = 'pid-plat-map-projects-workbook-reconciled-v5-backups';
const DATA_REVISION = 'captured-layout-20260804-135345';
const PREVIOUS_STORAGE_KEYS: string[] = [];
const PREVIOUS_BACKUP_KEYS: string[] = [];
const PUBLISHED_IMPORT_PROJECT_NAMES = [
  'Legacy at Sand Hollow Phase 1',
  'Legacy at Sand Hollow Phase 2',
  'Red Slate Estates Phase 1',
  'Red Slate Estates Phase 2',
  'Red Slate Estates Phase 3',
  'Strawberry Fields Estate Phase 1',
  'Strawberry Fields Estate Other',
  'Peach Spring Estate Phase 1',
  'Peach Spring Estate Phase 2',
];
const PROJECTS_FILE_PATH = `${import.meta.env.BASE_URL}projects.json`;
const DEFAULT_MAP_IMAGE = `${import.meta.env.BASE_URL}pid-no-1-map.png`;

const starterProjects: ProjectPoint[] = [
  {
    id: 'project-1',
    projectName: 'Western Mortgage & Realty Co.',
    shortDetails: '',
    x: 50,
    y: 50,
    color: '#000000',
    taxIds: [],
    projectPlatMap: createEmptyProjectPdf(),
  },
];

function App() {
  const mapViewportRef = useRef<HTMLElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: string; moved: boolean } | null>(null);
  const hasUserEdited = useRef(false);
  const [projects, setProjects] = useState<ProjectPoint[]>(starterProjects);
  const [canSaveProjects, setCanSaveProjects] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<'editor' | 'client'>(() =>
    window.location.hash === '#editor' ? 'editor' : 'client',
  );
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [saveMessage, setSaveMessage] = useState('Loaded');

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeProjectPlatMap = activeProject ? getProjectPlatMap(activeProject) : null;
  const isClientView = pageMode === 'client';

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.projectName.localeCompare(b.projectName)),
    [projects],
  );

  useEffect(() => {
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(null);
    }
    if (activeProjectId && !projects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId(null);
    }
  }, [activeProjectId, projects, selectedProjectId]);

  useEffect(() => {
    if (!canSaveProjects || isClientView || !hasUserEdited.current) return;
    saveProjects(projects);
    setSaveMessage(
      `Saved ${projects.length} projects at ${new Date().toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })}`,
    );
  }, [canSaveProjects, projects, isClientView]);

  useEffect(() => {
    let cancelled = false;

    if (!isClientView) {
      const browserProjects = loadBrowserProjects();
      if (browserProjects) {
        loadPublishedProjects()
          .then((publishedProjects) => {
            if (cancelled) return;
            const mergedProjects = normalizeTaxIdPlatImageImports(
              normalizeProjectPlatMapImports(
                splitCombinedWesternMortgageProjects(
                  mergePublishedImports(browserProjects, publishedProjects),
                  publishedProjects,
                ),
                publishedProjects,
              ),
              publishedProjects,
            );
            setProjects(mergedProjects);
            setSaveMessage(`Loaded ${mergedProjects.length} saved draft projects`);
          })
          .catch(() => {
            if (cancelled) return;
            setProjects(browserProjects);
            setSaveMessage(`Loaded ${browserProjects.length} saved draft projects`);
          })
          .finally(() => {
            if (!cancelled) setCanSaveProjects(!isClientView);
          });
        return () => {
          cancelled = true;
        };
      }
    }

    setCanSaveProjects(false);
    loadPublishedProjects()
      .then((publishedProjects) => {
        if (cancelled || !publishedProjects) return;
        setProjects(publishedProjects);
        setSaveMessage(`Loaded ${publishedProjects.length} projects`);
      })
      .catch(() => {
        if (!cancelled) setSaveMessage('Loaded starter project');
      })
      .finally(() => {
        if (!cancelled && !isClientView) setCanSaveProjects(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isClientView]);

  useEffect(() => {
    function handleHashChange() {
      setPageMode(window.location.hash === '#editor' ? 'editor' : 'client');
      setActiveProjectId(null);
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  function updateProject(id: string, patch: Partial<ProjectPoint>) {
    hasUserEdited.current = true;
    setProjects((current) =>
      current.map((project) => (project.id === id ? { ...project, ...patch } : project)),
    );
  }

  function addProject() {
    hasUserEdited.current = true;
    const nextProject: ProjectPoint = {
      id: `project-${Date.now()}`,
      projectName: 'Western Mortgage & Realty Co.',
      shortDetails: '',
      x: 50,
      y: 50,
      color: '#000000',
      taxIds: [],
      projectPlatMap: createEmptyProjectPdf(),
    };
    setProjects((current) => [...current, nextProject]);
    setSelectedProjectId(nextProject.id);
  }

  function duplicateSelectedProject() {
    if (!selectedProject) return;
    hasUserEdited.current = true;

    const duplicatedProject: ProjectPoint = {
      ...selectedProject,
      id: `project-${Date.now()}`,
      projectName: `${selectedProject.projectName} Copy`,
      x: clamp(selectedProject.x + 1.5, 0, 100),
      y: clamp(selectedProject.y + 1.5, 0, 100),
      taxIds: selectedProject.taxIds.map((taxId) => ({ ...taxId, id: `tax-${Date.now()}-${taxId.id}` })),
      projectPlatMap: selectedProject.projectPlatMap
        ? { ...selectedProject.projectPlatMap, id: `project-pdf-${Date.now()}` }
        : createEmptyProjectPdf(),
    };

    setProjects((current) => [...current, duplicatedProject]);
    setSelectedProjectId(duplicatedProject.id);
  }

  function removeSelectedProject() {
    if (!selectedProject || projects.length <= 1) return;
    hasUserEdited.current = true;
    setProjects((current) => current.filter((project) => project.id !== selectedProject.id));
    setActiveProjectId((current) => (current === selectedProject.id ? null : current));
  }

  function addTaxId(projectId: string) {
    hasUserEdited.current = true;
    const nextTaxId: ProjectAccount = {
      id: `tax-${Date.now()}`,
      taxId: '',
      label: '',
      owner: '',
      accountUrl: '',
    };
    updateProject(projectId, {
      taxIds: [...(projects.find((project) => project.id === projectId)?.taxIds ?? []), nextTaxId],
    });
  }

  function updateTaxId(projectId: string, taxIdId: string, patch: Partial<ProjectAccount>) {
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    hasUserEdited.current = true;
    updateProject(projectId, {
      taxIds: project.taxIds.map((taxId) => (taxId.id === taxIdId ? { ...taxId, ...patch } : taxId)),
    });
  }

  function removeTaxId(projectId: string, taxIdId: string) {
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    hasUserEdited.current = true;
    updateProject(projectId, {
      taxIds: project.taxIds.filter((taxId) => taxId.id !== taxIdId),
    });
  }

  async function copyDeployJson() {
    const deployProjects = prepareProjectsForSave(projects);
    const deployJson = JSON.stringify(deployProjects, null, 2);

    try {
      await navigator.clipboard.writeText(deployJson);
      setSaveMessage(`Copied ${deployProjects.length} deploy-ready projects`);
    } catch {
      setSaveMessage('Could not copy deploy JSON. Use the browser console fallback.');
    }
  }

  function beginProjectDrag(event: React.PointerEvent<HTMLButtonElement>, project: ProjectPoint) {
    if (isClientView || !mapRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedProjectId(project.id);
    dragState.current = { id: project.id, moved: false };

    const rect = mapRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const original = { x: project.x, y: project.y };

    function move(pointerEvent: PointerEvent) {
      const dx = ((pointerEvent.clientX - startX) / rect.width) * 100;
      const dy = ((pointerEvent.clientY - startY) / rect.height) * 100;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        dragState.current = { id: project.id, moved: true };
      }
      updateProject(project.id, {
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

  function handleProjectClick(project: ProjectPoint) {
    setSelectedProjectId(project.id);
    const drag = dragState.current;
    dragState.current = null;
    if (drag?.id === project.id && drag.moved) return;
    if (!isClientView) return;
    setActiveProjectId(project.id);
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
              Add one point per project, then list each related tax ID, account overview link, and
              project plat map inside the project.
            </p>
          </div>
          <div className="hero-actions">
            <a className="client-view-link" href={import.meta.env.BASE_URL}>
              Open client view
            </a>
            <button type="button" className="client-view-link deploy-copy-button" onClick={copyDeployJson}>
              Copy deploy JSON
            </button>
            <p className="save-message">{saveMessage}</p>
          </div>
        </section>
      )}

      <section className={`layout ${isClientView ? 'client-layout' : ''}`}>
        {!isClientView && (
          <aside className="sidebar dots-sidebar">
            <div className="panel">
              <h2>Projects</h2>
              <div className="legend">
                {sortedProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`legend-project ${selectedProjectId === project.id ? 'is-selected' : ''}`}
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <span
                      className="swatch"
                      style={{ '--status-color': project.color } as React.CSSProperties}
                    />
                    <span>
                      {project.projectName || 'Unnamed project'}
                      <small>{project.taxIds.length} tax IDs · {countProjectPlatMaps(project)} plats</small>
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
                <span>{projects.length} projects</span>
              </div>
              <p className="client-guide-copy">
                Select a project below or click a dot on the map. Each project can contain multiple
                tax IDs and plat maps.
              </p>
              <div className="client-project-list" aria-label="Project list">
                {sortedProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`client-project-button ${selectedProjectId === project.id ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setActiveProjectId(project.id);
                    }}
                  >
                    <span
                      className="client-project-marker"
                      style={{ '--status-color': project.color } as React.CSSProperties}
                    />
                    <span className="client-project-text">
                      <strong>{project.projectName || 'Unnamed project'}</strong>
                      <small>{project.taxIds.length} tax IDs · {countProjectPlatMaps(project)} plat maps</small>
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
              <img
                src={DEFAULT_MAP_IMAGE}
                alt="PID No. 1 plat map page 2"
                draggable={false}
                decoding="async"
                fetchPriority="high"
              />
              <div className="dot-layer">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`map-dot ${selectedProjectId === project.id ? 'is-selected' : ''} ${getTooltipPlacement(project)}`}
                    style={
                      {
                        '--x': `${project.x}%`,
                        '--y': `${project.y}%`,
                        '--dot-color': project.color,
                      } as React.CSSProperties
                    }
                    onPointerDown={(event) => beginProjectDrag(event, project)}
                    onClick={() => handleProjectClick(project)}
                    aria-label={`${project.projectName}, ${project.taxIds.length} tax IDs`}
                  >
                    <span className="dot-tooltip">
                      <strong>{project.projectName || 'Unnamed project'}</strong>
                      <em>{project.taxIds.length} tax IDs · {countProjectPlatMaps(project)} plats</em>
                      <span>{getPublicDetails(project) || 'Click for project details.'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {activeProject && (
            <div
              className="detail-overlay"
              role="dialog"
              aria-modal="true"
              aria-label={`${activeProject.projectName} details`}
            >
              <div className="detail-card">
                <div className="detail-header">
                  <div>
                    <h2>{activeProject.projectName || 'Unnamed project'}</h2>
                    <p>{activeProject.taxIds.length} tax IDs · {countProjectPlatMaps(activeProject)} plat maps</p>
                  </div>
                  <button type="button" onClick={() => setActiveProjectId(null)} aria-label="Close details">
                    <X size={18} />
                  </button>
                </div>
                
                <div className="detail-grid project-detail-grid">
                  {activeProjectPlatMap && (
                    <section className="project-plat-section">
                      <h3>Project plat map</h3>
                      {isImagePlatMap(activeProjectPlatMap) ? (
                        <a
                          className="project-plat-preview-link"
                          href={resolveAssetPath(activeProjectPlatMap.file)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${activeProjectPlatMap.title || activeProject.projectName} plat map`}
                        >
                          <img
                            className="project-plat-preview"
                            src={resolveAssetPath(activeProjectPlatMap.file)}
                            alt={`${activeProjectPlatMap.title || activeProject.projectName} plat map`}
                            loading="lazy"
                            decoding="async"
                          />
                        </a>
                      ) : (
                        <a
                          className="account-overview-link secondary-link"
                          href={resolveAssetPath(activeProjectPlatMap.file)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileText size={16} />
                          Open project plat map
                        </a>
                      )}
                    </section>
                  )}
                  <section>
                    <h3>Tax IDs & Account Overviews</h3>
                    {activeProject.taxIds.length ? (
                      <div className="tax-id-list">
                        {sortTaxIds(activeProject.taxIds).map((taxId) => (
                          <article key={taxId.id} className="tax-id-card">
                            <div className="tax-id-copy">
                              <strong>{taxId.taxId || 'Tax ID not assigned'}</strong>
                              {(taxId.label || taxId.owner) && (
                                <span>{[taxId.label, taxId.owner].filter(Boolean).join(' · ')}</span>
                              )}
                            </div>
                            <div className="tax-id-media">
                              {getTaxIdPlatImage(taxId) && (
                                <img
                                  className="compact-plat-preview"
                                  src={resolveAssetPath(getTaxIdPlatImage(taxId)?.file ?? '')}
                                  alt={`${taxId.taxId} plat map`}
                                  loading="lazy"
                                  decoding="async"
                                />
                              )}
                            </div>
                            {taxId.accountUrl ? (
                              <a
                                className="account-overview-link tax-id-account-link"
                                href={taxId.accountUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink size={16} />
                                Open Account Overview
                              </a>
                            ) : (
                              <div className="empty-detail compact-empty tax-id-account-link">No account link yet.</div>
                            )}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-detail">No tax IDs have been added to this project yet.</div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          )}
        </section>

        {!isClientView && (
          <aside className="sidebar editor-sidebar">
            {selectedProject ? (
              <div className="panel selected-panel">
                <div className="selected-heading">
                  <h2>{selectedProject.projectName || 'Unnamed project'}</h2>
                </div>

                <div className="project-fields">
                  <label>
                    Project name
                    <input
                      type="text"
                      value={selectedProject.projectName}
                      onChange={(event) => updateProject(selectedProject.id, { projectName: event.target.value })}
                    />
                  </label>
                  <label>
                    Short hover details
                    <textarea
                      value={selectedProject.shortDetails}
                      onChange={(event) => updateProject(selectedProject.id, { shortDetails: event.target.value })}
                    />
                  </label>
                  <label>
                    Dot color
                    <input
                      type="color"
                      value={selectedProject.color}
                      onChange={(event) => updateProject(selectedProject.id, { color: event.target.value })}
                    />
                  </label>
                  <label>
                    Project plat map title
                    <input
                      type="text"
                      value={selectedProject.projectPlatMap?.title ?? ''}
                      placeholder="Project plat map"
                      onChange={(event) =>
                        updateProject(selectedProject.id, {
                          projectPlatMap: {
                            ...(selectedProject.projectPlatMap ?? createEmptyProjectPdf()),
                            title: event.target.value,
                            type: 'pdf',
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Project plat map path or URL
                    <input
                      type="text"
                      value={selectedProject.projectPlatMap?.file ?? ''}
                      placeholder="plats/project-plat.pdf"
                      onChange={(event) =>
                        updateProject(selectedProject.id, {
                          projectPlatMap: {
                            ...(selectedProject.projectPlatMap ?? createEmptyProjectPdf()),
                            file: event.target.value,
                            type: 'pdf',
                          },
                        })
                      }
                    />
                  </label>
                </div>

                <div className="nested-editor-section">
                  <div className="nested-editor-heading">
                    <h3>Tax IDs</h3>
                    <button type="button" onClick={() => addTaxId(selectedProject.id)}>
                      <Plus size={14} />
                      Add tax ID
                    </button>
                  </div>
                  {selectedProject.taxIds.length ? (
                    <div className="nested-editor-list">
                      {sortTaxIds(selectedProject.taxIds).map((taxId) => (
                        <div key={taxId.id} className="nested-editor-card">
                          <label>
                            Tax ID
                            <input
                              type="text"
                              value={taxId.taxId}
                              onChange={(event) =>
                                updateTaxId(selectedProject.id, taxId.id, { taxId: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            Label
                            <input
                              type="text"
                              value={taxId.label}
                              placeholder="Lot 1, Outlot A, Phase 2..."
                              onChange={(event) =>
                                updateTaxId(selectedProject.id, taxId.id, { label: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            Owner
                            <input
                              type="text"
                              value={taxId.owner}
                              onChange={(event) =>
                                updateTaxId(selectedProject.id, taxId.id, { owner: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            Account overview URL
                            <input
                              type="url"
                              value={taxId.accountUrl}
                              placeholder="https://eweb.washco.utah.gov/..."
                              onChange={(event) =>
                                updateTaxId(selectedProject.id, taxId.id, { accountUrl: event.target.value })
                              }
                            />
                          </label>
                          <p className="nested-editor-empty">
                            Plat image: {taxId.taxId ? `${taxId.taxId}.png` : 'enter a Tax ID to create the image path'}
                          </p>
                          <button
                            type="button"
                            className="remove-nested-button"
                            onClick={() => removeTaxId(selectedProject.id, taxId.id)}
                          >
                            <Trash2 size={14} />
                            Remove tax ID
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="nested-editor-empty">No tax IDs added yet.</p>
                  )}
                </div>

                <div className="shape-editor">
                  <div className="shape-actions">
                    <button type="button" onClick={addProject}>
                      <Plus size={15} />
                      Add project
                    </button>
                    <button type="button" onClick={duplicateSelectedProject}>
                      <Copy size={15} />
                      Duplicate selected
                    </button>
                    <button type="button" onClick={removeSelectedProject} disabled={projects.length <= 1}>
                      <Trash2 size={15} />
                      Remove selected
                    </button>
                  </div>
                  <p>Drag a project dot on the map to position it. Client clicks open project details.</p>
                </div>
              </div>
            ) : (
              <div className="panel empty-selection-panel">
                <h2>No project selected</h2>
                <p>Select a project from the map or the Projects list to edit its details.</p>
                <button type="button" onClick={addProject}>
                  <Plus size={15} />
                  Add project
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

function countProjectPlatMaps(project: ProjectPoint) {
  const taxIdImageCount = project.taxIds.filter((taxId) => getTaxIdPlatImage(taxId)).length;
  return taxIdImageCount + (getProjectPlatMap(project) ? 1 : 0);
}

function getTaxIdPlatImage(taxId: ProjectAccount): ProjectPlatMap | null {
  if (taxId.platImage !== undefined) {
    const platImage = taxId.platImage.trim();
    if (!platImage) return null;
    return {
      id: `custom-plat-${taxId.id}`,
      title: taxId.taxId,
      file: platImage,
      type: 'image',
    };
  }

  const taxIdFileName = taxId.taxId.trim();
  if (!taxIdFileName) return null;

  return {
    id: `default-plat-${taxId.id}`,
    title: taxId.taxId,
    file: `${taxIdFileName}.png`,
    type: 'image',
  };
}

function getProjectPlatMap(project: ProjectPoint) {
  const projectPlatMap = project.projectPlatMap;
  if (!projectPlatMap?.file.trim()) return null;
  return projectPlatMap;
}

function isImagePlatMap(platMap: ProjectPlatMap) {
  return platMap.type === 'image' || /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(platMap.file.trim());
}

function createEmptyProjectPdf(): ProjectPlatMap {
  return {
    id: `project-pdf-${Date.now()}`,
    title: '',
    file: '',
    type: 'pdf',
  };
}

function getPublicDetails(project: ProjectPoint) {
  return project.shortDetails.trim();
}

function getTooltipPlacement(project: ProjectPoint) {
  if (project.y < 24 && project.x < 18) return 'tooltip-below-right';
  if (project.y < 24 && project.x > 82) return 'tooltip-below-left';
  if (project.y < 24) return 'tooltip-below';
  if (project.x < 18) return 'tooltip-right';
  if (project.x > 82) return 'tooltip-left';
  return 'tooltip-above';
}

function resolveAssetPath(path: string) {
  const trimmedPath = path.trim();
  if (!trimmedPath) return '';
  if (/^(https?:|data:|blob:)/i.test(trimmedPath)) return trimmedPath;
  if (trimmedPath.startsWith(import.meta.env.BASE_URL)) return trimmedPath;
  return `${import.meta.env.BASE_URL}${trimmedPath.replace(/^\/+/, '')}`;
}

function createBackup(projects: ProjectPoint[]): ProjectBackup {
  return {
    version: 2,
    dataRevision: DATA_REVISION,
    savedAt: new Date().toISOString(),
    projects,
  };
}

function saveProjects(projects: ProjectPoint[]) {
  const sortedProjects = prepareProjectsForSave(projects);
  const backup = createBackup(sortedProjects);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));

  const previousBackups = loadBackups();
  const previousProjects = previousBackups[0]?.projects;
  const backups =
    previousProjects && JSON.stringify(previousProjects) === JSON.stringify(sortedProjects)
      ? [backup, ...previousBackups.slice(1)]
      : [backup, ...previousBackups];

  localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, 50)));
}

function prepareProjectsForSave(projects: ProjectPoint[]) {
  return projects.map((project) => ({
    ...project,
    taxIds: sortTaxIds(project.taxIds),
  }));
}

function sortTaxIds(taxIds: ProjectAccount[]) {
  return [...taxIds].sort((a, b) => compareTaxIds(a.taxId, b.taxId));
}

function compareTaxIds(a: string, b: string) {
  const aParts = splitTaxIdForSort(a);
  const bParts = splitTaxIdForSort(b);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index++) {
    const aPart = aParts[index];
    const bPart = bParts[index];
    if (!aPart) return bPart ? -1 : 0;
    if (!bPart) return 1;

    if (aPart.type !== bPart.type) {
      return aPart.type === 'number' ? -1 : 1;
    }

    if (aPart.type === 'number' && bPart.type === 'number') {
      const numberDifference = aPart.value - bPart.value;
      if (numberDifference !== 0) return numberDifference;

      const lengthDifference = aPart.raw.length - bPart.raw.length;
      if (lengthDifference !== 0) return lengthDifference;
      continue;
    }

    const textDifference = aPart.raw.localeCompare(bPart.raw, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (textDifference !== 0) return textDifference;
  }

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function splitTaxIdForSort(taxId: string) {
  return taxId
    .trim()
    .toUpperCase()
    .match(/\d+|[A-Z]+|[^A-Z\d]+/g)
    ?.map((raw) =>
      /^\d+$/.test(raw)
        ? ({ type: 'number' as const, raw, value: Number(raw) })
        : ({ type: 'text' as const, raw, value: raw }),
    ) ?? [];
}

async function loadPublishedProjects() {
  const projects = await fetchJson(PROJECTS_FILE_PATH);
  if (isProjectList(projects)) return projects;

  return null;
}

async function fetchJson(path: string) {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function loadBrowserProjects() {
  try {
    const savedProjects = loadFirstStoredProjectList([STORAGE_KEY, ...PREVIOUS_STORAGE_KEYS]);
    if (savedProjects) return savedProjects;

    const latestBackup = loadBackups()[0]?.projects;
    if (latestBackup && isProjectList(latestBackup)) return latestBackup;

    return null;
  } catch {
    return null;
  }
}

function mergePublishedImports(draftProjects: ProjectPoint[], publishedProjects: ProjectPoint[] | null) {
  if (!publishedProjects) return draftProjects;

  let hasChanges = false;
  const publishedImportProjects = new Map(
    publishedProjects
      .filter((project) => PUBLISHED_IMPORT_PROJECT_NAMES.includes(project.projectName.trim()))
      .map((project) => [project.projectName.trim().toLowerCase(), project]),
  );

  const mergedProjects = draftProjects.map((draftProject) => {
    const publishedProject = publishedImportProjects.get(draftProject.projectName.trim().toLowerCase());
    if (!publishedProject) return draftProject;

    const draftTaxIds = new Set(draftProject.taxIds.map((taxId) => taxId.taxId.trim().toLowerCase()));
    const missingTaxIds = publishedProject.taxIds.filter((taxId) => !draftTaxIds.has(taxId.taxId.trim().toLowerCase()));
    const mergedTaxIds = draftProject.taxIds.map((draftTaxId) => {
      const publishedTaxId = publishedProject.taxIds.find(
        (taxId) => taxId.taxId.trim().toLowerCase() === draftTaxId.taxId.trim().toLowerCase(),
      );
      if (!publishedTaxId) return draftTaxId;

      const hydratedTaxId = {
        ...draftTaxId,
        owner: draftTaxId.owner || publishedTaxId.owner,
        accountUrl: draftTaxId.accountUrl || publishedTaxId.accountUrl,
        platImage: draftTaxId.platImage || publishedTaxId.platImage,
      };
      if (JSON.stringify(hydratedTaxId) !== JSON.stringify(draftTaxId)) hasChanges = true;
      return hydratedTaxId;
    });

    if (missingTaxIds.length > 0) hasChanges = true;

    const projectPlatMap =
      draftProject.projectPlatMap?.file || !publishedProject.projectPlatMap
        ? draftProject.projectPlatMap
        : publishedProject.projectPlatMap;
    if (projectPlatMap !== draftProject.projectPlatMap) hasChanges = true;

    return {
      ...draftProject,
      taxIds: [...mergedTaxIds, ...missingTaxIds],
      projectPlatMap,
    };
  });

  const draftProjectNames = new Set(mergedProjects.map((project) => project.projectName.trim().toLowerCase()));
  const importsToAdd = publishedProjects.filter((project) => {
    const projectName = project.projectName.trim();
    return (
      PUBLISHED_IMPORT_PROJECT_NAMES.includes(projectName) &&
      !draftProjectNames.has(projectName.toLowerCase())
    );
  });

  if (importsToAdd.length > 0) hasChanges = true;
  if (!hasChanges) return draftProjects;
  return [...mergedProjects, ...importsToAdd].sort((a, b) => a.projectName.localeCompare(b.projectName));
}

function splitCombinedWesternMortgageProjects(
  projects: ProjectPoint[],
  publishedProjects: ProjectPoint[] | null,
) {
  const publishedWesternProjects = (publishedProjects ?? []).filter(
    (project) => isWesternMortgageProject(project.projectName) && project.taxIds.length === 1,
  );
  if (publishedWesternProjects.length === 0) return projects;

  const currentWesternProjects = projects.filter((project) => isWesternMortgageProject(project.projectName));
  if (
    currentWesternProjects.length === publishedWesternProjects.length &&
    currentWesternProjects.every((project) => project.taxIds.length === 1) &&
    hasMatchingTaxIdCounts(currentWesternProjects, publishedWesternProjects)
  ) {
    return projects;
  }

  const draftTaxIdsByTaxId = new Map(
    currentWesternProjects
      .flatMap((project) => project.taxIds)
      .map((taxId) => [normalizeTaxId(taxId.taxId), taxId]),
  );

  const normalizedWesternProjects = publishedWesternProjects.map((publishedProject) => {
    const publishedTaxId = publishedProject.taxIds[0];
    const draftTaxId = draftTaxIdsByTaxId.get(normalizeTaxId(publishedTaxId?.taxId ?? ''));
    return {
      ...publishedProject,
      taxIds: [
        {
          ...publishedTaxId,
          ...(draftTaxId ?? {}),
          owner: draftTaxId?.owner || publishedTaxId?.owner || '',
          accountUrl: draftTaxId?.accountUrl || publishedTaxId?.accountUrl || '',
          platImage: draftTaxId?.platImage || publishedTaxId?.platImage || '',
        },
      ],
    };
  });

  return [
    ...projects.filter((project) => !isWesternMortgageProject(project.projectName)),
    ...normalizedWesternProjects,
  ].sort((a, b) => a.projectName.localeCompare(b.projectName));
}

function normalizeProjectPlatMapImports(
  projects: ProjectPoint[],
  publishedProjects: ProjectPoint[] | null,
) {
  if (!publishedProjects) return projects;

  const publishedByProjectName = new Map(
    publishedProjects.map((project) => [normalizeProjectName(project.projectName), project]),
  );

  return projects.map((project) => {
    const publishedProject = publishedByProjectName.get(normalizeProjectName(project.projectName));
    if (!publishedProject?.projectPlatMap?.file) return project;

    if (!project.projectPlatMap?.file || hasKnownMissingPlatMapFile(project.projectPlatMap.file)) {
      return {
        ...project,
        projectPlatMap: publishedProject.projectPlatMap,
      };
    }

    return project;
  });
}

function hasKnownMissingPlatMapFile(file: string) {
  return ['Legacy Phase 1.png', 'Legacy Phase 2.png'].includes(file.trim());
}

function normalizeTaxIdPlatImageImports(
  projects: ProjectPoint[],
  publishedProjects: ProjectPoint[] | null,
) {
  if (!publishedProjects) return projects;

  const publishedTaxImageByKey = new Map<string, string>();
  publishedProjects.forEach((project) => {
    project.taxIds.forEach((taxId) => {
      if (!taxId.platImage) return;
      publishedTaxImageByKey.set(taxImageKey(project.projectName, taxId.taxId), taxId.platImage);
      publishedTaxImageByKey.set(taxImageKey('', taxId.taxId), taxId.platImage);
    });
  });

  return projects.map((project) => ({
    ...project,
    taxIds: project.taxIds.map((taxId) => {
      if (taxId.platImage) return taxId;

      const publishedPlatImage =
        publishedTaxImageByKey.get(taxImageKey(project.projectName, taxId.taxId)) ??
        publishedTaxImageByKey.get(taxImageKey('', taxId.taxId));

      return publishedPlatImage ? { ...taxId, platImage: publishedPlatImage } : taxId;
    }),
  }));
}

function taxImageKey(projectName: string, taxId: string) {
  return `${normalizeProjectName(projectName)}|${normalizeTaxId(taxId)}`;
}

function hasMatchingTaxIdCounts(projects: ProjectPoint[], otherProjects: ProjectPoint[]) {
  const counts = taxIdCountMap(projects);
  const otherCounts = taxIdCountMap(otherProjects);
  if (counts.size !== otherCounts.size) return false;

  return [...counts].every(([taxId, count]) => otherCounts.get(taxId) === count);
}

function taxIdCountMap(projects: ProjectPoint[]) {
  const counts = new Map<string, number>();
  projects.forEach((project) => {
    project.taxIds.forEach((taxId) => {
      const normalizedTaxId = normalizeTaxId(taxId.taxId);
      counts.set(normalizedTaxId, (counts.get(normalizedTaxId) ?? 0) + 1);
    });
  });
  return counts;
}

function loadFirstStoredProjectList(keys: string[]) {
  for (const key of keys) {
    const saved = localStorage.getItem(key);
    if (!saved) continue;
    const projects = parseProjectBackup(saved);
    if (projects) return projects;
  }
  return null;
}

function loadBackups() {
  try {
    return [BACKUP_KEY, ...PREVIOUS_BACKUP_KEYS]
      .flatMap((key) => {
        const saved = localStorage.getItem(key);
        if (!saved) return [];

        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) return [];

        return parsed.filter(isProjectBackup);
      })
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

function parseProjectBackup(value: string) {
  const parsed = JSON.parse(value);
  if (isProjectList(parsed)) return parsed;
  if (isProjectBackup(parsed)) return parsed.projects;
  return null;
}

function isWesternMortgageProject(projectName: string) {
  return normalizeProjectName(projectName).includes('western mortgage');
}

function normalizeProjectName(projectName: string) {
  return projectName.trim().toLowerCase();
}

function normalizeTaxId(taxId: string) {
  return taxId.trim().toLowerCase();
}

function isProjectBackup(value: unknown): value is ProjectBackup {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProjectBackup>;
  return (
    candidate.version === 2 &&
    candidate.dataRevision === DATA_REVISION &&
    typeof candidate.savedAt === 'string' &&
    isProjectList(candidate.projects)
  );
}

function isProjectList(value: unknown): value is ProjectPoint[] {
  if (!Array.isArray(value) || value.length === 0) return false;

  return value.every((project) => {
    if (!project || typeof project !== 'object') return false;
    const candidate = project as Partial<ProjectPoint>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.projectName === 'string' &&
      typeof candidate.shortDetails === 'string' &&
      typeof candidate.color === 'string' &&
      typeof candidate.x === 'number' &&
      typeof candidate.y === 'number' &&
      Array.isArray(candidate.taxIds) &&
      candidate.taxIds.every(isProjectAccount) &&
      (candidate.projectPlatMap === undefined || isProjectPlatMap(candidate.projectPlatMap))
    );
  });
}

function isProjectAccount(value: unknown): value is ProjectAccount {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProjectAccount>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.taxId === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.owner === 'string' &&
    typeof candidate.accountUrl === 'string' &&
    (candidate.platImage === undefined || typeof candidate.platImage === 'string')
  );
}

function isProjectPlatMap(value: unknown): value is ProjectPlatMap {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProjectPlatMap>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.file === 'string' &&
    (candidate.type === 'image' || candidate.type === 'pdf')
  );
}

const rootElement = document.getElementById('root')!;
window.pidPlatMapRoot = window.pidPlatMapRoot ?? createRoot(rootElement);
window.pidPlatMapRoot.render(<App />);

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import {
  X,
  ChevronDown,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  Hand,
  Eye,
  EyeOff,
  FileWarning,
  Maximize2,
  RotateCcw,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import './styles.css'
import { renderLayerText } from './domain/renderGerber'
import {
  LAYER_LABELS,
  combineReadyLayerViewBoxes,
  compareLayersByViewMode,
  createLayerId,
  inferLayerKind,
  layerSortRank,
  type BoardViewMode,
  type LayerKind,
  type UploadedLayer,
  type ViewBox,
} from './domain/layers'

const root = createRoot(document.getElementById('root') as HTMLElement)
const MIN_ZOOM = 0.2
const MAX_ZOOM = 8
const ZOOM_STEP = 0.2
const LAYER_KIND_MENU_GAP = 6
const LAYER_KIND_MENU_MAX_HEIGHT = 245
const LAYER_KIND_OPTIONS: LayerKind[] = [
  'top-copper',
  'bottom-copper',
  'top-mask',
  'bottom-mask',
  'top-silk',
  'bottom-silk',
  'outline',
  'drill',
  'unknown',
]

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

function App() {
  const [layers, setLayers] = useState<UploadedLayer[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [renderingLayerIds, setRenderingLayerIds] = useState<Set<string>>(new Set())
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isOpaqueBoard, setIsOpaqueBoard] = useState(false)
  const [useRealMasks, setUseRealMasks] = useState(false)
  const [soloLayerId, setSoloLayerId] = useState<string | null>(null)
  const [layerKindMenu, setLayerKindMenu] = useState<LayerKindMenuState | null>(null)
  const [viewMode, setViewMode] = useState<BoardViewMode>('top')
  const [viewport, setViewport] = useState<ViewportState>({ zoom: 1, panX: 0, panY: 0 })
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepthRef = useRef(0)
  const layerKindTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const layerKindMenuRef = useRef<HTMLDivElement | null>(null)

  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => compareLayersByViewMode(a, b, viewMode)),
    [layers, viewMode],
  )
  const sidebarLayers = useMemo(() => [...sortedLayers].reverse(), [sortedLayers])
  const layerKindOptions = useMemo(
    () => [...LAYER_KIND_OPTIONS].sort((a, b) => layerSortRank(b, viewMode) - layerSortRank(a, viewMode)),
    [viewMode],
  )
  const fileNameOccurrences = useMemo(() => createFileNameOccurrences(layers), [layers])
  const readyLayers = sortedLayers.filter((layer) => layer.status === 'ready' && layer.viewBox)
  const activeSoloLayerId = readyLayers.some((layer) => layer.id === soloLayerId) ? soloLayerId : null
  const visibleReadyLayers = readyLayers.filter((layer) => layer.visible)
  const renderableReadyLayers = activeSoloLayerId
    ? readyLayers.filter((layer) => layer.id === activeSoloLayerId)
    : visibleReadyLayers
  const renderedLayers = isOpaqueBoard && !activeSoloLayerId
    ? renderableReadyLayers.filter((layer) => isLayerFacingViewer(layer, viewMode))
    : renderableReadyLayers
  const combinedViewBox = combineReadyLayerViewBoxes(sortedLayers)
  const readyCount = layers.filter((layer) => layer.status === 'ready').length
  const errorCount = layers.filter((layer) => layer.status === 'error').length
  const openLayerKindLayer = layerKindMenu ? layers.find((layer) => layer.id === layerKindMenu.layerId) : undefined

  useEffect(() => {
    if (!layerKindMenu) return
    const currentMenu = layerKindMenu

    function updateMenuPosition() {
      const trigger = layerKindTriggerRefs.current.get(currentMenu.layerId)
      if (!trigger) {
        setLayerKindMenu(null)
        return
      }

      setLayerKindMenu(createLayerKindMenuState(currentMenu.layerId, trigger))
    }

    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target
      const trigger = layerKindTriggerRefs.current.get(currentMenu.layerId)

      if (
        target instanceof Node &&
        (trigger?.contains(target) || layerKindMenuRef.current?.contains(target))
      ) {
        return
      }

      setLayerKindMenu(null)
    }

    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    document.addEventListener('pointerdown', closeOnOutsidePointerDown)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown)
    }
  }, [layerKindMenu])

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.size > 0)
    if (files.length === 0) return

    setIsLoading(true)
    const knownFileKeys = new Set(layers.map((layer) => createFileContentKey(layer.fileName, getLayerContentHash(layer))))
    const nextFiles: Array<{ file: File; rawText: string; contentHash: string }> = []

    for (const file of files) {
      const [rawText, contentHash] = await Promise.all([file.text(), hashFile(file)])
      const fileKey = createFileContentKey(file.name, contentHash)

      if (knownFileKeys.has(fileKey)) continue

      knownFileKeys.add(fileKey)
      nextFiles.push({ file, rawText, contentHash })
    }

    if (nextFiles.length === 0) {
      setIsLoading(false)
      return
    }

    const rendered = await Promise.all(
      nextFiles.map(async ({ file, rawText, contentHash }, index) => ({
        ...(await renderLayerText(rawText, file.name, createLayerId(file, layers.length + index), inferLayerKind(file.name))),
        contentHash,
      })),
    )
    setLayers((currentLayers) => [...currentLayers, ...rendered])
    setViewport({ zoom: 1, panX: 0, panY: 0 })
    setIsLoading(false)
  }

  function handleDragEnter(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    if (!hasDraggedFiles(event.dataTransfer)) return

    dragDepthRef.current += 1
    setIsDragging(true)
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    if (hasDraggedFiles(event.dataTransfer)) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  function handleDragLeave(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragging(false)
    }
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragging(false)
    void handleFiles(event.dataTransfer.files)
  }

  function toggleLayer(id: string) {
    setLayers((currentLayers) =>
      currentLayers.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)),
    )
  }

  function removeLayer(id: string) {
    setLayers((currentLayers) => currentLayers.filter((layer) => layer.id !== id))
    setSoloLayerId((currentId) => (currentId === id ? null : currentId))
    setLayerKindMenu((currentMenu) => (currentMenu?.layerId === id ? null : currentMenu))
    setRenderingLayerIds((currentIds) => {
      if (!currentIds.has(id)) return currentIds

      const nextIds = new Set(currentIds)
      nextIds.delete(id)
      return nextIds
    })
  }

  function setAllLayersVisible(visible: boolean) {
    setSoloLayerId(null)
    setLayers((currentLayers) =>
      currentLayers.map((layer) => (layer.status === 'ready' ? { ...layer, visible } : layer)),
    )
  }

  function changeLayerColor(id: string, color: string) {
    setLayers((currentLayers) => currentLayers.map((layer) => (layer.id === id ? { ...layer, color } : layer)))
  }

  async function changeLayerKind(id: string, kind: LayerKind) {
    const layer = layers.find((currentLayer) => currentLayer.id === id)
    if (!layer || layer.kind === kind) return

    setLayerKindMenu(null)
    setRenderingLayerIds((currentIds) => new Set(currentIds).add(id))
    const nextLayer = await renderLayerText(layer.rawText, layer.fileName, layer.id, kind)

    setLayers((currentLayers) =>
      currentLayers.map((currentLayer) => {
        if (currentLayer.id !== id) return currentLayer

        return {
          ...nextLayer,
          contentHash: currentLayer.contentHash,
          visible: nextLayer.status === 'ready' ? currentLayer.visible || currentLayer.status === 'error' : false,
        }
      }),
    )
    setRenderingLayerIds((currentIds) => {
      const nextIds = new Set(currentIds)
      nextIds.delete(id)
      return nextIds
    })
  }

  function downloadCombinedSvg() {
    if (!combinedViewBox || renderedLayers.length === 0) return

    const svg = createCombinedSvg(renderedLayers, combinedViewBox, viewMode, useRealMasks)
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'gerber-preview.svg'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function toggleLayerKindMenu(id: string) {
    const trigger = layerKindTriggerRefs.current.get(id)
    if (!trigger) return

    setLayerKindMenu((currentMenu) => (
      currentMenu?.layerId === id ? null : createLayerKindMenuState(id, trigger)
    ))
  }

  return (
    <main
      className={`app-shell ${isSidebarOpen ? '' : 'is-sidebar-hidden'}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <aside className="sidebar">
        <div className="brand">
          <div>
            <h1>Gerber Viewer</h1>
            <p>{layers.length ? `${readyCount} rendered, ${errorCount} failed` : 'Local PCB layer preview'}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Choose Gerber files"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            <Upload size={18} />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".gbr,.ger,.gtl,.gbl,.gts,.gbs,.gto,.gbo,.gko,.gm1,.drl,.xln,.txt"
          onChange={(event) => {
            if (event.target.files) void handleFiles(event.target.files)
            event.currentTarget.value = ''
          }}
        />

        <section className="layer-panel" aria-label="Loaded layers">
          <div className="panel-header">
            <div className="panel-header-actions">
              {readyCount > 0 ? (
                <div className="layer-bulk-actions" aria-label="Layer visibility actions">
                  <button type="button" onClick={() => setAllLayersVisible(false)}>
                    Hide all
                  </button>
                  <button type="button" onClick={() => setAllLayersVisible(true)}>
                    Show all
                  </button>
                </div>
              ) : null}
            </div>
            <div className="panel-header-title">
              <span>Layers</span>
              <span>{layers.length}</span>
            </div>
          </div>

          {sidebarLayers.length === 0 ? (
            <p className="empty-copy">Drop Gerber and drill files to build a local preview.</p>
          ) : (
            <div className="layer-list">
              {sidebarLayers.map((layer) => {
                const isRenderingLayer = renderingLayerIds.has(layer.id)
                const isSoloLayer = activeSoloLayerId === layer.id
                const fileNameOccurrence = fileNameOccurrences.get(layer.id)
                const isLayerKindMenuOpen = layerKindMenu?.layerId === layer.id

                return (
                  <article
                    className={`layer-row ${isSoloLayer ? 'is-solo' : ''} ${isLayerKindMenuOpen ? 'has-open-menu' : ''} ${activeSoloLayerId && !isSoloLayer ? 'is-muted-by-solo' : ''} ${layer.status === 'error' ? 'has-error' : ''} ${layer.status === 'error' ? 'has-error-icon' : ''}`}
                    key={layer.id}
                  >
                    <div className="layer-file-heading">
                      {fileNameOccurrence && fileNameOccurrence.total > 1 ? (
                        <span className="layer-file-duplicate-badge">#{fileNameOccurrence.index}</span>
                      ) : null}
                      <strong className="layer-file-name">{layer.fileName}</strong>
                      <button
                        className="remove-layer-button"
                        type="button"
                        title="Remove layer"
                        onClick={() => removeLayer(layer.id)}
                        disabled={isRenderingLayer}
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="layer-controls">
                      <button
                        className="icon-button compact"
                        title={layer.visible ? 'Hide layer' : 'Show layer'}
                        onClick={() => toggleLayer(layer.id)}
                        disabled={layer.status === 'error' || isRenderingLayer}
                      >
                        {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button
                        className={`solo-button ${isSoloLayer ? 'is-active' : ''}`}
                        type="button"
                        title={isSoloLayer ? 'Exit single layer mode' : 'Show only this layer'}
                        onClick={() => setSoloLayerId(isSoloLayer ? null : layer.id)}
                        disabled={layer.status === 'error' || isRenderingLayer}
                        aria-pressed={isSoloLayer}
                      >
                        Solo
                      </button>
                      <label
                        className="swatch"
                        title="Layer color"
                        style={{ '--swatch-color': layer.color } as React.CSSProperties}
                      >
                        <input
                          type="color"
                          aria-label={`Layer color for ${layer.fileName}`}
                          value={layer.color}
                          onChange={(event) => changeLayerColor(layer.id, event.target.value)}
                          disabled={layer.status === 'error' || isRenderingLayer}
                        />
                      </label>
                      <div
                        className="layer-kind-menu"
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setLayerKindMenu(null)
                          }
                        }}
                      >
                        <button
                          ref={(node) => {
                            if (node) {
                              layerKindTriggerRefs.current.set(layer.id, node)
                            } else {
                              layerKindTriggerRefs.current.delete(layer.id)
                            }
                          }}
                          className={`layer-kind-trigger ${isLayerKindMenuOpen ? 'is-open' : ''}`}
                          type="button"
                          aria-label={`Layer type for ${layer.fileName}`}
                          aria-expanded={isLayerKindMenuOpen}
                          aria-haspopup="listbox"
                          onClick={() => toggleLayerKindMenu(layer.id)}
                          disabled={isRenderingLayer}
                        >
                          <span>{LAYER_LABELS[layer.kind]}</span>
                          <ChevronDown className="select-chevron" size={15} aria-hidden="true" />
                        </button>
                      </div>
                      {layer.status === 'error' ? (
                        <span className="error-icon" title={layer.error}>
                          <FileWarning size={18} />
                        </span>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </aside>

      <section className="viewer">
        <div className="toolbar" aria-label="Viewer controls">
          <button
            className="tool-button"
            title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            onClick={() => setIsSidebarOpen((current) => !current)}
          >
            {isSidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
          <span className="toolbar-spacer" />
          <button className="tool-button" title="Fit to view" onClick={() => setViewport({ zoom: 1, panX: 0, panY: 0 })}>
            <Maximize2 size={17} />
          </button>
          <button className="tool-button" title="Zoom out" onClick={() => setViewport((current) => zoomFromCenter(current, -ZOOM_STEP))}>
            <ZoomOut size={17} />
          </button>
          <span className="zoom-value">{Math.round(viewport.zoom * 100)}%</span>
          <button className="tool-button" title="Zoom in" onClick={() => setViewport((current) => zoomFromCenter(current, ZOOM_STEP))}>
            <ZoomIn size={17} />
          </button>
          <span className="toolbar-divider" />
          <button
            className={`toggle-button ${viewMode === 'bottom' ? 'is-active' : ''}`}
            type="button"
            title={`Flip board view to ${viewMode === 'top' ? 'bottom' : 'top'}`}
            aria-pressed={viewMode === 'bottom'}
            onClick={() => setViewMode((current) => (current === 'top' ? 'bottom' : 'top'))}
          >
            Flip
          </button>
          <button
            className={`toggle-button ${isOpaqueBoard ? 'is-active' : ''}`}
            type="button"
            aria-pressed={isOpaqueBoard}
            onClick={() => setIsOpaqueBoard((current) => !current)}
          >
            Opaque board
          </button>
          <button
            className={`toggle-button ${useRealMasks ? 'is-active' : ''}`}
            type="button"
            aria-pressed={useRealMasks}
            onClick={() => setUseRealMasks((current) => !current)}
          >
            Real masks
          </button>
          <span className="toolbar-divider" />
          <span className="pan-hint">
            <Hand size={15} />
            Drag to pan
          </span>
          <button className="tool-button" title="Reset preview" onClick={() => {
            setLayers([])
            setSoloLayerId(null)
          }}>
            <RotateCcw size={17} />
          </button>
          <button
            className="tool-button"
            title="Download SVG"
            onClick={downloadCombinedSvg}
            disabled={!combinedViewBox || renderedLayers.length === 0}
          >
            <Download size={17} />
          </button>
        </div>

        <div className="canvas-wrap">
          {combinedViewBox && renderedLayers.length > 0 ? (
            <BoardViewport
              layers={renderedLayers}
              viewBox={combinedViewBox}
              viewMode={viewMode}
              useRealMasks={useRealMasks}
              viewport={viewport}
              onViewportChange={setViewport}
            />
          ) : (
            <div className="canvas-empty">
              <Upload size={32} />
              <p>{layers.length ? 'No visible renderable layers.' : 'Drop a Gerber set to start.'}</p>
            </div>
          )}
        </div>
      </section>
      {isDragging ? (
        <div className="drop-overlay" aria-label="Drop Gerber files to load">
          <div className="drop-overlay-card">
            <Upload size={34} />
            <strong>Drop Gerber files</strong>
            <span>{isLoading ? 'Rendering current set...' : 'Release to replace the current preview'}</span>
          </div>
        </div>
      ) : null}
      {layerKindMenu && openLayerKindLayer ? createPortal(
        <div
          ref={layerKindMenuRef}
          className="layer-kind-options"
          role="listbox"
          aria-label={`Layer type for ${openLayerKindLayer.fileName}`}
          style={{
            top: layerKindMenu.top,
            left: layerKindMenu.left,
            width: layerKindMenu.width,
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setLayerKindMenu(null)
            }
          }}
        >
          {layerKindOptions.map((kind) => (
            <button
              className={`layer-kind-option ${openLayerKindLayer.kind === kind ? 'is-selected' : ''}`}
              key={kind}
              type="button"
              role="option"
              aria-selected={openLayerKindLayer.kind === kind}
              onClick={() => void changeLayerKind(openLayerKindLayer.id, kind)}
            >
              {LAYER_LABELS[kind]}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </main>
  )
}

function isLayerFacingViewer(layer: UploadedLayer, viewMode: BoardViewMode): boolean {
  return layer.side === viewMode || layer.side === 'both'
}

function hasDraggedFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes('Files')
}

function getLayerContentHash(layer: UploadedLayer): string {
  return layer.contentHash ?? layer.rawText
}

function createFileContentKey(fileName: string, contentHash: string): string {
  return `${fileName}\0${contentHash}`
}

async function hashFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

type FileNameOccurrence = {
  index: number
  total: number
}

type LayerKindMenuState = {
  layerId: string
  top: number
  left: number
  width: number
}

function createLayerKindMenuState(layerId: string, trigger: HTMLElement): LayerKindMenuState {
  const rect = trigger.getBoundingClientRect()
  const menuHeight = Math.min(
    LAYER_KIND_MENU_MAX_HEIGHT,
    LAYER_KIND_OPTIONS.length * 33 + 10,
  )
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  const opensUp = spaceBelow < menuHeight + LAYER_KIND_MENU_GAP && spaceAbove > spaceBelow
  const top = opensUp
    ? Math.max(LAYER_KIND_MENU_GAP, rect.top - menuHeight - LAYER_KIND_MENU_GAP)
    : Math.min(window.innerHeight - menuHeight - LAYER_KIND_MENU_GAP, rect.bottom + LAYER_KIND_MENU_GAP)

  return {
    layerId,
    top,
    left: rect.left,
    width: rect.width,
  }
}

function createFileNameOccurrences(layers: UploadedLayer[]): Map<string, FileNameOccurrence> {
  const totals = new Map<string, number>()
  const seen = new Map<string, number>()
  const occurrences = new Map<string, FileNameOccurrence>()

  for (const layer of layers) {
    totals.set(layer.fileName, (totals.get(layer.fileName) ?? 0) + 1)
  }

  for (const layer of layers) {
    const nextIndex = (seen.get(layer.fileName) ?? 0) + 1
    seen.set(layer.fileName, nextIndex)
    occurrences.set(layer.id, { index: nextIndex, total: totals.get(layer.fileName) ?? 1 })
  }

  return occurrences
}

type ViewportState = {
  zoom: number
  panX: number
  panY: number
}

type BoardSvgProps = {
  layers: UploadedLayer[]
  viewBox: ViewBox
  viewMode: BoardViewMode
  useRealMasks: boolean
  viewport: ViewportState
  onViewportChange: React.Dispatch<React.SetStateAction<ViewportState>>
}

function BoardViewport({
  layers,
  viewBox,
  viewMode,
  useRealMasks,
  viewport,
  onViewportChange,
}: BoardSvgProps) {
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null)

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault()

    const rect = event.currentTarget.getBoundingClientRect()
    const cursorX = event.clientX - rect.left - rect.width / 2
    const cursorY = event.clientY - rect.top - rect.height / 2
    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12

    onViewportChange((current) => {
      const nextZoom = clamp(current.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM)
      const scale = nextZoom / current.zoom

      return {
        zoom: nextZoom,
        panX: cursorX - (cursorX - current.panX) * scale,
        panY: cursorY - (cursorY - current.panY) * scale,
      }
    })
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: viewport.panX,
      panY: viewport.panY,
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    onViewportChange({
      zoom: viewport.zoom,
      panX: drag.panX + event.clientX - drag.startX,
      panY: drag.panY + event.clientY - drag.startY,
    })
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  return (
    <div
      className="board-viewport"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <div
        className="board-stage"
        style={{
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
        }}
      >
        <BoardSvg
          layers={layers}
          viewBox={viewBox}
          viewMode={viewMode}
          useRealMasks={useRealMasks}
        />
      </div>
    </div>
  )
}

type BoardSvgOnlyProps = {
  layers: UploadedLayer[]
  viewBox: ViewBox
  viewMode: BoardViewMode
  useRealMasks: boolean
}

function BoardSvg({ layers, viewBox, viewMode, useRealMasks }: BoardSvgOnlyProps) {
  const viewBoxValue = `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`
  const defsMarkup = createDefsMarkup(layers, viewBox, useRealMasks)

  return (
    <svg
      className="board-svg"
      viewBox={viewBoxValue}
      role="img"
      aria-label="Rendered PCB layers"
    >
      <rect x={viewBox.minX} y={viewBox.minY} width={viewBox.width} height={viewBox.height} fill="#161b22" rx="120" />
      <defs dangerouslySetInnerHTML={{ __html: defsMarkup }} />
      <g transform={createBoardTransform(viewBox, viewMode)}>
        {layers.map((layer) => (
          useRealMasks && isSolderMaskLayer(layer.kind) ? (
            <g
              key={layer.id}
              mask={`url(#${createRealMaskId(layer)})`}
              color={layer.color}
              style={{ color: layer.color }}
            >
              <rect x={viewBox.minX} y={viewBox.minY} width={viewBox.width} height={viewBox.height} fill="currentColor" stroke="none" />
            </g>
          ) : (
            <g
              key={layer.id}
              {...svgAttributesToReactProps(layer.renderAttributes)}
              color={layer.color}
              style={{ color: layer.color }}
              fill="currentColor"
              stroke="currentColor"
              dangerouslySetInnerHTML={{ __html: layer.layerMarkup ?? '' }}
            />
          )
        ))}
      </g>
    </svg>
  )
}

function zoomFromCenter(viewport: ViewportState, delta: number): ViewportState {
  return {
    ...viewport,
    zoom: clamp(viewport.zoom + delta, MIN_ZOOM, MAX_ZOOM),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function createGerberTransform(viewBox: ViewBox): string {
  return `translate(0,${viewBox.height + 2 * viewBox.minY}) scale(1,-1)`
}

function createBoardTransform(viewBox: ViewBox, viewMode: BoardViewMode): string {
  const transforms = [createGerberTransform(viewBox)]

  if (viewMode === 'bottom') {
    transforms.push(createBottomViewMirrorTransform(viewBox))
  }

  return transforms.join(' ')
}

export function createBottomViewMirrorTransform(viewBox: ViewBox): string {
  return `translate(${2 * viewBox.minX + viewBox.width},0) scale(-1,1)`
}

function stripDefsWrapper(defsMarkup: string): string {
  return defsMarkup.replace(/<\/?defs\b[^>]*>/gi, '')
}

function createDefsMarkup(
  layers: UploadedLayer[],
  viewBox: ViewBox,
  useRealMasks: boolean,
): string {
  const layerDefs = layers.map((layer) => stripDefsWrapper(layer.defsMarkup ?? '')).join('\n')
  const realMaskDefs = useRealMasks
    ? layers
        .filter((layer) => isSolderMaskLayer(layer.kind))
        .map((layer) => createRealMaskDef(layer, viewBox))
        .join('\n')
    : ''

  return [layerDefs, realMaskDefs].filter(Boolean).join('\n')
}

function createRealMaskDef(layer: UploadedLayer, viewBox: ViewBox): string {
  const openingAttributes = serializeAttributes(layer.renderAttributes ?? {})

  return `<mask id="${createRealMaskId(layer)}" maskUnits="userSpaceOnUse" x="${viewBox.minX}" y="${viewBox.minY}" width="${viewBox.width}" height="${viewBox.height}">\n<rect x="${viewBox.minX}" y="${viewBox.minY}" width="${viewBox.width}" height="${viewBox.height}" fill="#fff"/>\n<g ${openingAttributes} color="#000" fill="#000" stroke="#000">${layer.layerMarkup ?? ''}</g>\n</mask>`
}

function isSolderMaskLayer(kind: LayerKind): boolean {
  return kind === 'top-mask' || kind === 'bottom-mask'
}

function createRealMaskId(layer: UploadedLayer): string {
  return `real-mask-${createSafeSvgId(layer.id)}`
}

function createSafeSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+/, '') || 'layer'
}

function createCombinedSvg(
  layers: UploadedLayer[],
  viewBox: ViewBox,
  viewMode: BoardViewMode,
  useRealMasks: boolean,
): string {
  const defs = createDefsMarkup(layers, viewBox, useRealMasks)
  const content = layers
    .map((layer) => createLayerSvgMarkup(layer, viewBox, useRealMasks))
    .join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}">\n<rect x="${viewBox.minX}" y="${viewBox.minY}" width="${viewBox.width}" height="${viewBox.height}" fill="#161b22"/>\n<defs>${defs}</defs>\n<g transform="${createBoardTransform(viewBox, viewMode)}">\n${content}\n</g>\n</svg>\n`
}

function createLayerSvgMarkup(layer: UploadedLayer, viewBox: ViewBox, useRealMasks: boolean): string {
  const colorAttributes = `color="${escapeAttribute(layer.color)}" style="color:${escapeAttribute(layer.color)}"`

  if (useRealMasks && isSolderMaskLayer(layer.kind)) {
    return `<g mask="url(#${createRealMaskId(layer)})" ${colorAttributes}><rect x="${viewBox.minX}" y="${viewBox.minY}" width="${viewBox.width}" height="${viewBox.height}" fill="currentColor" stroke="none"/></g>`
  }

  return `<g ${serializeAttributes(layer.renderAttributes ?? {})} ${colorAttributes} fill="currentColor" stroke="currentColor">${layer.layerMarkup ?? ''}</g>`
}

function svgAttributesToReactProps(attributes: Record<string, string> = {}): React.SVGProps<SVGGElement> {
  return {
    fillRule: attributes['fill-rule'] as React.SVGProps<SVGGElement>['fillRule'],
    strokeLinecap: attributes['stroke-linecap'] as React.SVGProps<SVGGElement>['strokeLinecap'],
    strokeLinejoin: attributes['stroke-linejoin'] as React.SVGProps<SVGGElement>['strokeLinejoin'],
    strokeMiterlimit: attributes['stroke-miterlimit'],
    strokeWidth: attributes['stroke-width'],
  }
}

function serializeAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(' ')
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return char
    }
  })
}

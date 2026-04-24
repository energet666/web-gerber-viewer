import React, { useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
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
import { readAndRenderFile, renderLayerText } from './domain/renderGerber'
import {
  LAYER_LABELS,
  combineReadyLayerViewBoxes,
  compareLayersByViewMode,
  createLayerId,
  type BoardViewMode,
  type LayerKind,
  type UploadedLayer,
  type ViewBox,
} from './domain/layers'

const root = createRoot(document.getElementById('root') as HTMLElement)
const MIN_ZOOM = 0.2
const MAX_ZOOM = 8
const ZOOM_STEP = 0.2
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
  const [viewMode, setViewMode] = useState<BoardViewMode>('top')
  const [viewport, setViewport] = useState<ViewportState>({ zoom: 1, panX: 0, panY: 0 })
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => compareLayersByViewMode(a, b, viewMode)),
    [layers, viewMode],
  )
  const sidebarLayers = useMemo(() => [...sortedLayers].reverse(), [sortedLayers])
  const readyLayers = sortedLayers.filter((layer) => layer.status === 'ready' && layer.viewBox)
  const visibleReadyLayers = readyLayers.filter((layer) => layer.visible)
  const renderedLayers = isOpaqueBoard
    ? visibleReadyLayers.filter((layer) => isLayerFacingViewer(layer, viewMode))
    : visibleReadyLayers
  const combinedViewBox = combineReadyLayerViewBoxes(sortedLayers)
  const readyCount = layers.filter((layer) => layer.status === 'ready').length
  const errorCount = layers.filter((layer) => layer.status === 'error').length

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.size > 0)
    if (files.length === 0) return

    setIsLoading(true)
    const rendered = await Promise.all(files.map((file, index) => readAndRenderFile(file, createLayerId(file, index))))
    setLayers(rendered)
    setViewport({ zoom: 1, panX: 0, panY: 0 })
    setIsLoading(false)
  }

  function toggleLayer(id: string) {
    setLayers((currentLayers) =>
      currentLayers.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)),
    )
  }

  function changeLayerColor(id: string, color: string) {
    setLayers((currentLayers) => currentLayers.map((layer) => (layer.id === id ? { ...layer, color } : layer)))
  }

  async function changeLayerKind(id: string, kind: LayerKind) {
    const layer = layers.find((currentLayer) => currentLayer.id === id)
    if (!layer || layer.kind === kind) return

    setRenderingLayerIds((currentIds) => new Set(currentIds).add(id))
    const nextLayer = await renderLayerText(layer.rawText, layer.fileName, layer.id, kind)

    setLayers((currentLayers) =>
      currentLayers.map((currentLayer) => {
        if (currentLayer.id !== id) return currentLayer

        return {
          ...nextLayer,
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

  return (
    <main className={`app-shell ${isSidebarOpen ? '' : 'is-sidebar-hidden'}`}>
      <aside className="sidebar">
        <div className="brand">
          <div>
            <h1>Gerber Viewer</h1>
            <p>{layers.length ? `${readyCount} rendered, ${errorCount} failed` : 'Local PCB layer preview'}</p>
          </div>
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

        <DropTarget
          active={isDragging}
          compact={layers.length > 0}
          loading={isLoading}
          onBrowse={() => fileInputRef.current?.click()}
          onDragState={setIsDragging}
          onFiles={(files) => void handleFiles(files)}
        />

        <section className="layer-panel" aria-label="Loaded layers">
          <div className="panel-header">
            <span>Layers</span>
            <span>{layers.length}</span>
          </div>

          {sidebarLayers.length === 0 ? (
            <p className="empty-copy">Drop Gerber and drill files to build a local preview.</p>
          ) : (
            <div className="layer-list">
              {sidebarLayers.map((layer) => {
                const isRenderingLayer = renderingLayerIds.has(layer.id)

                return (
                  <article
                    className={`layer-row ${layer.status === 'error' ? 'has-error' : ''} ${layer.status === 'error' ? 'has-error-icon' : ''}`}
                    key={layer.id}
                  >
                    <button
                      className="icon-button compact"
                      title={layer.visible ? 'Hide layer' : 'Show layer'}
                      onClick={() => toggleLayer(layer.id)}
                      disabled={layer.status === 'error' || isRenderingLayer}
                    >
                      {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <input
                      className="swatch"
                      type="color"
                      title="Layer color"
                      value={layer.color}
                      onChange={(event) => changeLayerColor(layer.id, event.target.value)}
                      disabled={layer.status === 'error' || isRenderingLayer}
                    />
                    <div className="layer-meta">
                      <strong>{layer.fileName}</strong>
                      <select
                        className="layer-kind-select"
                        aria-label={`Layer type for ${layer.fileName}`}
                        value={layer.kind}
                        onChange={(event) => void changeLayerKind(layer.id, event.target.value as LayerKind)}
                        disabled={isRenderingLayer}
                      >
                        {LAYER_KIND_OPTIONS.map((kind) => (
                          <option key={kind} value={kind}>
                            {LAYER_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {layer.status === 'error' ? (
                      <span className="error-icon" title={layer.error}>
                        <FileWarning size={18} />
                      </span>
                    ) : null}
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
          <div className="segmented-control" aria-label="Board side view">
            <button
              className={viewMode === 'top' ? 'is-selected' : ''}
              type="button"
              onClick={() => setViewMode('top')}
            >
              Top
            </button>
            <button
              className={viewMode === 'bottom' ? 'is-selected' : ''}
              type="button"
              onClick={() => setViewMode('bottom')}
            >
              Bottom
            </button>
          </div>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={isOpaqueBoard}
              onChange={(event) => setIsOpaqueBoard(event.target.checked)}
            />
            <span>Opaque board</span>
          </label>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={useRealMasks}
              onChange={(event) => setUseRealMasks(event.target.checked)}
            />
            <span>Real masks</span>
          </label>
          <span className="toolbar-divider" />
          <span className="pan-hint">
            <Hand size={15} />
            Drag to pan
          </span>
          <button className="tool-button" title="Reset preview" onClick={() => setLayers([])}>
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
    </main>
  )
}

function isLayerFacingViewer(layer: UploadedLayer, viewMode: BoardViewMode): boolean {
  return layer.side === viewMode || layer.side === 'both'
}

type ViewportState = {
  zoom: number
  panX: number
  panY: number
}

type DropTargetProps = {
  active: boolean
  compact: boolean
  loading: boolean
  onBrowse: () => void
  onDragState: (active: boolean) => void
  onFiles: (files: FileList) => void
}

function DropTarget({ active, compact, loading, onBrowse, onDragState, onFiles }: DropTargetProps) {
  return (
    <section
      className={`drop-target ${active ? 'is-active' : ''} ${compact ? 'is-compact' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        onDragState(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => onDragState(false)}
      onDrop={(event) => {
        event.preventDefault()
        onDragState(false)
        onFiles(event.dataTransfer.files)
      }}
    >
      {compact ? null : <Upload size={24} />}
      <p>{loading ? 'Rendering files...' : compact ? 'Drop or choose another set' : 'Drop Gerber files here'}</p>
      <button className="text-button" onClick={onBrowse}>
        Choose files
      </button>
    </section>
  )
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

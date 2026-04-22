import React, { useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Download,
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
import { readAndRenderFile } from './domain/renderGerber'
import {
  LAYER_LABELS,
  combineViewBoxes,
  createLayerId,
  layerSortRank,
  type UploadedLayer,
  type ViewBox,
} from './domain/layers'

const root = createRoot(document.getElementById('root') as HTMLElement)

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

function App() {
  const [layers, setLayers] = useState<UploadedLayer[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [zoom, setZoom] = useState(1)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => layerSortRank(a.kind) - layerSortRank(b.kind) || a.fileName.localeCompare(b.fileName)),
    [layers],
  )
  const visibleReadyLayers = sortedLayers.filter((layer) => layer.visible && layer.status === 'ready' && layer.viewBox)
  const combinedViewBox = combineViewBoxes(visibleReadyLayers.map((layer) => layer.viewBox as ViewBox))
  const readyCount = layers.filter((layer) => layer.status === 'ready').length
  const errorCount = layers.filter((layer) => layer.status === 'error').length

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.size > 0)
    if (files.length === 0) return

    setIsLoading(true)
    const rendered = await Promise.all(files.map((file, index) => readAndRenderFile(file, createLayerId(file, index))))
    setLayers(rendered)
    setZoom(1)
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

  function downloadCombinedSvg() {
    if (!combinedViewBox) return

    const svg = createCombinedSvg(visibleReadyLayers, combinedViewBox)
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'gerber-preview.svg'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div>
            <h1>Gerber Viewer</h1>
            <p>{layers.length ? `${readyCount} rendered, ${errorCount} failed` : 'Local PCB layer preview'}</p>
          </div>
          <button className="icon-button" title="Load files" onClick={() => fileInputRef.current?.click()}>
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

        <DropTarget
          active={isDragging}
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

          {sortedLayers.length === 0 ? (
            <p className="empty-copy">Drop Gerber and drill files to build a local preview.</p>
          ) : (
            <div className="layer-list">
              {sortedLayers.map((layer) => (
                <article className={`layer-row ${layer.status === 'error' ? 'has-error' : ''}`} key={layer.id}>
                  <button
                    className="icon-button compact"
                    title={layer.visible ? 'Hide layer' : 'Show layer'}
                    onClick={() => toggleLayer(layer.id)}
                    disabled={layer.status === 'error'}
                  >
                    {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <input
                    className="swatch"
                    type="color"
                    title="Layer color"
                    value={layer.color}
                    onChange={(event) => changeLayerColor(layer.id, event.target.value)}
                    disabled={layer.status === 'error'}
                  />
                  <div className="layer-meta">
                    <strong>{layer.fileName}</strong>
                    <span>{layer.status === 'error' ? layer.error : LAYER_LABELS[layer.kind]}</span>
                  </div>
                  {layer.status === 'error' ? <FileWarning className="error-icon" size={18} /> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </aside>

      <section className="viewer">
        <div className="toolbar" aria-label="Viewer controls">
          <button className="tool-button" title="Fit to view" onClick={() => setZoom(1)}>
            <Maximize2 size={17} />
          </button>
          <button className="tool-button" title="Zoom out" onClick={() => setZoom((current) => Math.max(0.2, current - 0.2))}>
            <ZoomOut size={17} />
          </button>
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <button className="tool-button" title="Zoom in" onClick={() => setZoom((current) => Math.min(5, current + 0.2))}>
            <ZoomIn size={17} />
          </button>
          <button className="tool-button" title="Reset preview" onClick={() => setLayers([])}>
            <RotateCcw size={17} />
          </button>
          <button className="tool-button" title="Download SVG" onClick={downloadCombinedSvg} disabled={!combinedViewBox}>
            <Download size={17} />
          </button>
        </div>

        <div className="canvas-wrap">
          {combinedViewBox ? (
            <BoardSvg layers={visibleReadyLayers} viewBox={combinedViewBox} zoom={zoom} />
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

type DropTargetProps = {
  active: boolean
  loading: boolean
  onBrowse: () => void
  onDragState: (active: boolean) => void
  onFiles: (files: FileList) => void
}

function DropTarget({ active, loading, onBrowse, onDragState, onFiles }: DropTargetProps) {
  return (
    <section
      className={`drop-target ${active ? 'is-active' : ''}`}
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
      <Upload size={24} />
      <p>{loading ? 'Rendering files...' : 'Drop Gerber files here'}</p>
      <button className="text-button" onClick={onBrowse}>
        Choose files
      </button>
    </section>
  )
}

type BoardSvgProps = {
  layers: UploadedLayer[]
  viewBox: ViewBox
  zoom: number
}

function BoardSvg({ layers, viewBox, zoom }: BoardSvgProps) {
  const viewBoxValue = `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`

  return (
    <svg
      className="board-svg"
      style={{ width: `${Math.round(86 * zoom)}%` }}
      viewBox={viewBoxValue}
      role="img"
      aria-label="Rendered PCB layers"
    >
      <rect x={viewBox.minX} y={viewBox.minY} width={viewBox.width} height={viewBox.height} fill="#161b22" rx="120" />
      <defs dangerouslySetInnerHTML={{ __html: layers.map((layer) => stripDefsWrapper(layer.defsMarkup ?? '')).join('\n') }} />
      <g transform={createGerberTransform(viewBox)}>
        {layers.map((layer) => (
          <g
            key={layer.id}
            color={layer.color}
            style={{ color: layer.color }}
            fill="currentColor"
            stroke="currentColor"
            dangerouslySetInnerHTML={{ __html: layer.layerMarkup ?? '' }}
          />
        ))}
      </g>
    </svg>
  )
}

function createGerberTransform(viewBox: ViewBox): string {
  return `translate(0,${viewBox.height + 2 * viewBox.minY}) scale(1,-1)`
}

function stripDefsWrapper(defsMarkup: string): string {
  return defsMarkup.replace(/<\/?defs\b[^>]*>/gi, '')
}

function createCombinedSvg(layers: UploadedLayer[], viewBox: ViewBox): string {
  const defs = layers.map((layer) => stripDefsWrapper(layer.defsMarkup ?? '')).join('\n')
  const content = layers
    .map(
      (layer) =>
        `<g color="${escapeAttribute(layer.color)}" style="color:${escapeAttribute(layer.color)}" fill="currentColor" stroke="currentColor">${layer.layerMarkup ?? ''}</g>`,
    )
    .join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" stroke-linecap="round" stroke-linejoin="round" stroke-width="0" fill-rule="evenodd" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}">\n<rect x="${viewBox.minX}" y="${viewBox.minY}" width="${viewBox.width}" height="${viewBox.height}" fill="#161b22"/>\n<defs>${defs}</defs>\n<g transform="${createGerberTransform(viewBox)}">\n${content}\n</g>\n</svg>\n`
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

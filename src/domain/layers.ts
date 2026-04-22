export type LayerKind =
  | 'top-copper'
  | 'bottom-copper'
  | 'top-mask'
  | 'bottom-mask'
  | 'top-silk'
  | 'bottom-silk'
  | 'outline'
  | 'drill'
  | 'unknown'

export type LayerSide = 'top' | 'bottom' | 'both' | 'unknown'

export type LayerStatus = 'ready' | 'error'

export type ViewBox = {
  minX: number
  minY: number
  width: number
  height: number
}

export type UploadedLayer = {
  id: string
  fileName: string
  rawText: string
  kind: LayerKind
  side: LayerSide
  color: string
  visible: boolean
  status: LayerStatus
  error?: string
  svgMarkup?: string
  defsMarkup?: string
  layerMarkup?: string
  viewBox?: ViewBox
}

export const LAYER_COLORS: Record<LayerKind, string> = {
  'top-copper': '#c7832b',
  'bottom-copper': '#b56f38',
  'top-mask': '#169b62',
  'bottom-mask': '#0d7d5d',
  'top-silk': '#f4f1dc',
  'bottom-silk': '#dbe7ff',
  outline: '#f1c232',
  drill: '#101820',
  unknown: '#9aa4b2',
}

export const LAYER_LABELS: Record<LayerKind, string> = {
  'top-copper': 'Top copper',
  'bottom-copper': 'Bottom copper',
  'top-mask': 'Top mask',
  'bottom-mask': 'Bottom mask',
  'top-silk': 'Top silk',
  'bottom-silk': 'Bottom silk',
  outline: 'Outline',
  drill: 'Drill',
  unknown: 'Unknown',
}

const layerPatterns: Array<{ kind: LayerKind; patterns: RegExp[] }> = [
  { kind: 'top-copper', patterns: [/\.(gtl|top)$/i, /(^|[_.-])(f|front|top).*(cu|copper)/i] },
  { kind: 'bottom-copper', patterns: [/\.(gbl|bot|bottom)$/i, /(^|[_.-])(b|back|bottom).*(cu|copper)/i] },
  { kind: 'top-mask', patterns: [/\.(gts|tsm)$/i, /(top|front).*(mask|solder)/i] },
  { kind: 'bottom-mask', patterns: [/\.(gbs|bsm)$/i, /(bottom|back).*(mask|solder)/i] },
  { kind: 'top-silk', patterns: [/\.(gto|tsk|plc)$/i, /(top|front).*(silk|legend|overlay)/i] },
  { kind: 'bottom-silk', patterns: [/\.(gbo|bsk|pls)$/i, /(bottom|back).*(silk|legend|overlay)/i] },
  { kind: 'outline', patterns: [/\.(gko|gm1|gml|edge|outline)$/i, /(edge|outline|profile|keepout|mechanical)/i] },
  { kind: 'drill', patterns: [/\.(drl|xln|drd|tap|nc)$/i, /(^|[_.-])(drill|pth|npth)([_.-]|$)/i] },
]

export function inferLayerKind(fileName: string): LayerKind {
  const normalized = fileName.trim().toLowerCase()
  const match = layerPatterns.find((entry) => entry.patterns.some((pattern) => pattern.test(normalized)))
  return match?.kind ?? 'unknown'
}

export function inferLayerSide(kind: LayerKind): LayerSide {
  if (kind.startsWith('top-')) return 'top'
  if (kind.startsWith('bottom-')) return 'bottom'
  if (kind === 'drill' || kind === 'outline') return 'both'
  return 'unknown'
}

export function layerSortRank(kind: LayerKind): number {
  switch (kind) {
    case 'bottom-copper':
      return 10
    case 'bottom-mask':
      return 20
    case 'top-copper':
      return 30
    case 'top-mask':
      return 40
    case 'bottom-silk':
      return 50
    case 'top-silk':
      return 60
    case 'outline':
      return 70
    case 'drill':
      return 80
    case 'unknown':
      return 90
  }
}

export function combineViewBoxes(viewBoxes: ViewBox[]): ViewBox | null {
  if (viewBoxes.length === 0) return null

  const minX = Math.min(...viewBoxes.map((box) => box.minX))
  const minY = Math.min(...viewBoxes.map((box) => box.minY))
  const maxX = Math.max(...viewBoxes.map((box) => box.minX + box.width))
  const maxY = Math.max(...viewBoxes.map((box) => box.minY + box.height))

  return {
    minX,
    minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  }
}

export function parseViewBox(svgMarkup: string): ViewBox | null {
  const match = svgMarkup.match(/\bviewBox=["']([^"']+)["']/i)
  if (!match) return null

  const values = match[1]
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number.parseFloat(value))

  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null

  return {
    minX: values[0],
    minY: values[1],
    width: values[2],
    height: values[3],
  }
}

export function extractSvgParts(svgMarkup: string): { defsMarkup: string; layerMarkup: string } {
  const defsMarkup = Array.from(svgMarkup.matchAll(/<defs\b[^>]*>[\s\S]*?<\/defs>/gi))
    .map((match) => match[0])
    .join('\n')

  const layerMatch = svgMarkup.match(/<g\b[^>]*\btransform=["'][^"']+["'][^>]*>([\s\S]*)<\/g>\s*<\/svg>/i)

  return {
    defsMarkup,
    layerMarkup: layerMatch?.[1] ?? '',
  }
}

export function createLayerId(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`
}

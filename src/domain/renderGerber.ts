import gerberToSvg from 'gerber-to-svg'
import {
  LAYER_COLORS,
  type LayerKind,
  extractSvgParts,
  inferLayerKind,
  inferLayerSide,
  parseViewBox,
  type UploadedLayer,
} from './layers'

export async function readAndRenderFile(file: File, id: string): Promise<UploadedLayer> {
  const rawText = await file.text()
  const kind = inferLayerKind(file.name)
  const color = LAYER_COLORS[kind]

  try {
    const svgMarkup = await renderToSvg(rawText, kind, color, id)
    const viewBox = parseViewBox(svgMarkup)

    if (!viewBox) {
      throw new Error('Rendered SVG does not include a valid viewBox.')
    }

    const svgParts = extractSvgParts(svgMarkup)

    return {
      id,
      fileName: file.name,
      rawText,
      kind,
      side: inferLayerSide(kind),
      color,
      visible: true,
      status: 'ready',
      svgMarkup,
      defsMarkup: svgParts.defsMarkup,
      layerMarkup: svgParts.layerMarkup,
      viewBox,
    }
  } catch (error) {
    return {
      id,
      fileName: file.name,
      rawText,
      kind,
      side: inferLayerSide(kind),
      color,
      visible: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unable to render this file.',
    }
  }
}

function renderToSvg(rawText: string, kind: LayerKind, color: string, id: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const converter = gerberToSvg(
      rawText,
      {
        id: `layer-${sanitizeSvgId(id)}`,
        attributes: { color },
        filetype: kind === 'drill' ? 'drill' : undefined,
      },
      (error, svg) => {
        if (error) {
          reject(error)
          return
        }

        if (!svg) {
          reject(new Error('Renderer returned an empty SVG.'))
          return
        }

        resolve(svg)
      },
    )

    converter.on('warning', () => undefined)
  })
}

function sanitizeSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+/, '') || 'layer'
}

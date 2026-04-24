import { describe, expect, it } from 'vitest'
import {
  combineReadyLayerViewBoxes,
  combineViewBoxes,
  compareLayersByViewMode,
  extractSvgParts,
  inferLayerKind,
  layerSortRank,
  parseViewBox,
  type LayerKind,
  type UploadedLayer,
} from './layers'

describe('inferLayerKind', () => {
  it.each([
    ['board.GTL', 'top-copper'],
    ['board.GBL', 'bottom-copper'],
    ['board.GTS', 'top-mask'],
    ['board.GBS', 'bottom-mask'],
    ['board.GTO', 'top-silk'],
    ['board.GBO', 'bottom-silk'],
    ['board.GKO', 'outline'],
    ['board.DRL', 'drill'],
    ['board.XLN', 'drill'],
    ['notes.TXT', 'unknown'],
  ] as const)('maps %s to %s', (fileName, kind) => {
    expect(inferLayerKind(fileName)).toBe(kind)
  })
})

describe('viewBox helpers', () => {
  it('parses a valid svg viewBox', () => {
    expect(parseViewBox('<svg viewBox="-10 5 100 200"><path /></svg>')).toEqual({
      minX: -10,
      minY: 5,
      width: 100,
      height: 200,
    })
  })

  it('combines multiple boxes', () => {
    expect(
      combineViewBoxes([
        { minX: 10, minY: 10, width: 10, height: 10 },
        { minX: -5, minY: 20, width: 15, height: 5 },
      ]),
    ).toEqual({ minX: -5, minY: 10, width: 25, height: 15 })
  })

  it('keeps hidden ready layers in the combined uploaded-layer viewBox', () => {
    expect(
      combineReadyLayerViewBoxes([
        createUploadedLayer('outline', { minX: 0, minY: 0, width: 120, height: 80 }, false),
        createUploadedLayer('top-copper', { minX: 10, minY: 10, width: 40, height: 30 }, true),
      ]),
    ).toEqual({ minX: 0, minY: 0, width: 120, height: 80 })
  })
})

describe('extractSvgParts', () => {
  it('keeps defs and removes the per-layer transform wrapper', () => {
    const parts = extractSvgParts(
      '<svg viewBox="10 20 30 40"><defs><circle id="pad" /></defs><g transform="translate(0,60) scale(1,-1)" fill="currentColor"><use xlink:href="#pad" /></g></svg>',
    )

    expect(parts.defsMarkup).toBe('<defs><circle id="pad" /></defs>')
    expect(parts.layerMarkup).toBe('<use xlink:href="#pad" />')
  })

  it('preserves inherited render attributes from the renderer svg', () => {
    const parts = extractSvgParts(
      '<svg viewBox="0 0 1 1" stroke-linecap="round" stroke-linejoin="bevel" stroke-width="0" fill-rule="evenodd" width="1mm"><g transform="translate(0,1) scale(1,-1)"><path /></g></svg>',
    )

    expect(parts.renderAttributes).toEqual({
      'stroke-linecap': 'round',
      'stroke-linejoin': 'bevel',
      'stroke-width': '0',
      'fill-rule': 'evenodd',
    })
  })
})

describe('layerSortRank', () => {
  it('orders layers from bottom stack to top stack in top view', () => {
    expect(sortKinds('top')).toEqual([
      'bottom-silk',
      'bottom-mask',
      'bottom-copper',
      'top-copper',
      'top-mask',
      'top-silk',
      'unknown',
      'outline',
      'drill',
    ])
  })

  it('orders layers from top stack to bottom stack in bottom view', () => {
    expect(sortKinds('bottom')).toEqual([
      'top-silk',
      'top-mask',
      'top-copper',
      'bottom-copper',
      'bottom-mask',
      'bottom-silk',
      'unknown',
      'outline',
      'drill',
    ])
  })

  it('keeps outline and drill above board layers in both modes', () => {
    expect(layerSortRank('drill', 'top')).toBeGreaterThan(layerSortRank('outline', 'top'))
    expect(layerSortRank('outline', 'top')).toBeGreaterThan(layerSortRank('top-silk', 'top'))
    expect(layerSortRank('drill', 'bottom')).toBeGreaterThan(layerSortRank('outline', 'bottom'))
    expect(layerSortRank('outline', 'bottom')).toBeGreaterThan(layerSortRank('bottom-silk', 'bottom'))
  })
})

function sortKinds(viewMode: 'top' | 'bottom'): LayerKind[] {
  const kinds: LayerKind[] = [
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

  return kinds
    .map(
      (kind): UploadedLayer => ({
        id: kind,
        fileName: `${kind}.gbr`,
        rawText: '',
        kind,
        side: 'unknown',
        color: '#ffffff',
        visible: true,
        status: 'ready',
        renderAttributes: {},
      }),
    )
    .sort((a, b) => compareLayersByViewMode(a, b, viewMode))
    .map((layer) => layer.kind)
}

function createUploadedLayer(kind: LayerKind, viewBox: UploadedLayer['viewBox'], visible: boolean): UploadedLayer {
  return {
    id: kind,
    fileName: `${kind}.gbr`,
    rawText: '',
    kind,
    side: 'unknown',
    color: '#ffffff',
    visible,
    status: 'ready',
    renderAttributes: {},
    viewBox,
  }
}

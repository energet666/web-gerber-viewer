import { describe, expect, it } from 'vitest'
import { combineViewBoxes, extractSvgParts, inferLayerKind, layerSortRank, parseViewBox } from './layers'

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
})

describe('extractSvgParts', () => {
  it('keeps defs and removes the per-layer transform wrapper', () => {
    const parts = extractSvgParts(
      '<svg viewBox="10 20 30 40"><defs><circle id="pad" /></defs><g transform="translate(0,60) scale(1,-1)" fill="currentColor"><use xlink:href="#pad" /></g></svg>',
    )

    expect(parts.defsMarkup).toBe('<defs><circle id="pad" /></defs>')
    expect(parts.layerMarkup).toBe('<use xlink:href="#pad" />')
  })
})

describe('layerSortRank', () => {
  it('draws drill after copper and outline after silk', () => {
    expect(layerSortRank('drill')).toBeGreaterThan(layerSortRank('outline'))
    expect(layerSortRank('outline')).toBeGreaterThan(layerSortRank('top-silk'))
    expect(layerSortRank('top-silk')).toBeGreaterThan(layerSortRank('top-copper'))
  })
})

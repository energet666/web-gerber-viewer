import { describe, expect, it } from 'vitest'
import { renderLayerText } from './renderGerber'

describe('renderLayerText', () => {
  it('returns an error for inputs that render to an empty SVG', async () => {
    const layer = await renderLayerText('This is not a Gerber file.', 'invalid-gerber.gbr', 'invalid-gerber', 'unknown')

    expect(layer.status).toBe('error')
    expect(layer.error).toBe('Rendered layer does not contain drawable Gerber geometry.')
  })
})

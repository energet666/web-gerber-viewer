declare module 'gerber-to-svg' {
  type ConverterOptions = {
    id?: string
    attributes?: Record<string, string>
    objectMode?: boolean
    units?: 'in' | 'mm'
    backupUnits?: 'in' | 'mm'
    zero?: 'L' | 'T'
    nota?: 'A' | 'I'
    backupNota?: 'A' | 'I'
    places?: [number, number]
    filetype?: 'gerber' | 'drill'
    plotAsOutline?: boolean | number
    optimizePaths?: boolean
  }

  type ConverterCallback = (error: Error | null, svg?: string) => void

  type Converter = {
    on(eventName: 'warning', listener: (warning: { line?: number; message?: string }) => void): Converter
    on(eventName: string, listener: (...args: unknown[]) => void): Converter
  }

  export default function gerberToSvg(
    input: string,
    options?: ConverterOptions,
    callback?: ConverterCallback,
  ): Converter
}

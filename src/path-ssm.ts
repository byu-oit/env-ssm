export type PathSsmLike = string | { path: string, delimiter?: string }

export class PathSsm {
  static like (value: unknown): value is PathSsmLike {
    return typeof value === 'string' || (typeof value === 'object' && value !== null && Object.hasOwnProperty.call(value, 'path'))
  }

  static from (value: unknown, delimiter?: string): PathSsm {
    if (!PathSsm.like(value)) {
      throw TypeError('Input must be PathSsmLike (string | { path: string, delimiter?: string })')
    }
    const defaultDelimiter = typeof value !== 'string' ? value.delimiter : delimiter
    if (typeof value === 'string') return new PathSsm(value, defaultDelimiter)
    return new PathSsm(value.path, defaultDelimiter)
  }

  path: string
  delimiter: string
  constructor (path: string, delimiter: string = '/') {
    this.path = path
    this.delimiter = delimiter
  }
}

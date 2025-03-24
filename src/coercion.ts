/**
 * Lightweight type coercion library for environment variables.
 * Provides a chainable API to validate and convert configuration values.
 */

/** A simple key/value object to serve as an environment source */
export interface Source { [key: string]: unknown }

/**
 * Main Env class wraps an object containing environment variables.
 * Use it to create a context for type-safe variable access.
 */
export class CoercionContainer<T extends Source> {
  readonly source: T

  constructor (source: T) {
    this.source = source
  }

  /**
   * Retrieves an environment variable wrapper to chain coercion and validation methods.
   * @param key - The name of the variable.
   */
  get (key: keyof T | string): Coercion {
    return new Coercion(key, this.source[key])
  }
}

/**
 * Builder class that wraps an individual environment variable.
 * Supports marking a variable as required, setting a default value,
 * and coercing the variable into a specific type.
 */
export class Coercion {
  private readonly key: PropertyKey
  private readonly value: unknown
  private isRequired: boolean = false
  private defaultValue: unknown = undefined

  constructor (key: PropertyKey, value: unknown) {
    this.key = key
    this.value = value
  }

  /**
   * Marks this variable as required.
   * You can optionally pass a boolean condition; if false, the variable is not required.
   * @param condition - Defaults to true.
   */
  required (condition: boolean = true): this {
    this.isRequired = Boolean(condition)
    return this
  }

  /**
   * Sets a default value to be used if the variable is not present.
   * @param defaultValue - The fallback value.
   */
  default (defaultValue: unknown): this {
    this.defaultValue = defaultValue
    return this
  }

  /**
   * Internal helper that returns the variable's value after applying defaults.
   * Throws an error if the value is missing and marked as required.
   */
  private getValue (): any {
    let value = this.value
    if (value == null) {
      value = this.defaultValue
    }
    if (value == null && this.isRequired) {
      throw new Error(`Missing required environment variable: ${String(this.key)}`)
    }
    return value
  }

  /**
   * Coerces the variable to a string.
   */
  asString (): string {
    const value = this.getValue()
    if (value == null) return value
    return String(value)
  }

  /**
   * Coerces the variable to a boolean.
   * Accepts boolean values or strings "true"/"false" (case-insensitive).
   */
  asBool (): boolean {
    const value = this.getValue()
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const lower = value.toLowerCase()
      if (lower === 'true') return true
      if (lower === 'false') return false
    }
    throw new Error(`Invalid boolean value for ${String(this.key)}: ${String(value)}`)
  }

  /**
   * Coerces the variable to a number.
   */
  asNumber (): number {
    const value = this.getValue()
    const num = Number(value)
    if (isNaN(num)) {
      throw new Error(`Invalid number value for ${String(this.key)}: ${String(value)}`)
    }
    return num
  }

  /**
   * Coerces the variable to a valid port number (between 1 and 65535).
   */
  asPortNumber (): number {
    const num = this.asNumber()
    if (num < 1 || num > 65535) {
      throw new Error(`Invalid port number for ${String(this.key)}: ${num}`)
    }
    return num
  }

  /**
   * Coerces the variable to a JSON object.
   * If the value is already an object, it is returned directly.
   * If it is a string, an attempt is made to parse it.
   */
  asJsonObject<T = any>(): T {
    const value = this.getValue()
    if (typeof value === 'object') return value
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch (err) {
        throw new Error(`Invalid JSON object for ${String(this.key)}: ${value}`)
      }
    }
    throw new Error(`Invalid JSON object for ${String(this.key)}: ${String(value)}`)
  }

  /**
   * Validates that the variable matches one of the allowed values.
   * @param allowed - Array of allowed string values.
   */
  asEnum<T extends string>(allowed: T[]): T {
    const value = this.asString()
    if (!allowed.includes(value as T)) {
      throw new Error(
                `Invalid value for ${String(this.key)}. Expected one of ${allowed.join(', ')}, but got: ${value}`
      )
    }
    return value as T
  }

  /**
   * Coerces the variable to a URL string.
   * It validates that the string is a well-formed URL.
   */
  asUrlString (): string {
    const value = this.asString()
    try {
      new URL(value)
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(`Invalid URL string for ${String(this.key)}: ${value}: ${err.message}`)
      }
      throw err
    }
    return value
  }

  /**
   * Coerces the variable to a URL object using the URL constructor.
   */
  asUrlObject (): URL {
    const value = this.asString()
    try {
      return new URL(value)
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(`Invalid URL string for ${String(this.key)}: ${value}: ${err.message}`)
      }
      throw err
    }
  }
}

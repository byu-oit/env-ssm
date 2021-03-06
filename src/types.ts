export interface Options {
  prefix?: string
  region?: string
}

export type ParametersFound = {[key: string]: string}

export type ParametersMissing = string []

export type ParamsResult = { expected: string[], found: ParametersFound; missing: ParametersMissing }

export interface Options {
  prefix: string
  region: string
}

export type ParametersFound = Record<string, string>

export type ParametersMissing = string []

export type GetParamsResult = { found: ParametersFound; missing: ParametersMissing }

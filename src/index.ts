import debug from 'debug'
import {Options, ParametersFound, ParamsResult} from './types'
import {getParamsFromEnv, getParamsFromSSM} from './lib'
import omit from 'lodash.omit'

const logger = debug('env-ssm')

export let params: ParametersFound = {}

export async function getParams(expectedParams: string[] = [], options: Options = {}): Promise<ParametersFound> {
  let result: ParamsResult = { expected: expectedParams, found: {}, missing: []}

  for (const expectedParam of expectedParams) {
    if (!(expectedParam in params)) result.missing.push(expectedParam)
    else result.found[expectedParam] = params[expectedParam]
  }

  // Return params if not missing any expected
  if (!result.missing.length) return params

  // Resolve prefix
  if (options.prefix) {
    try {
      const prefixResult = await getParams([options.prefix], omit(options, ['prefix']))
      options.prefix = prefixResult[options.prefix] // Replace prefix
    } finally { // Ignore errors when resolving prefix
      logger(`SSM Prefix is: ${options.prefix}`)
    }
  }

  result = getParamsFromEnv(result, options)
  if (result.missing.length === 0) {
    params = {...params, ...result.found}
    return params
  }

  result = await getParamsFromSSM(result, options)
  if (result.missing.length > 0) {
    console.error(`Unable to retrieve all parameters - Missing: ${JSON.stringify(result.missing)}`)
    throw new Error('Unable to retrieve all parameters')
  }

  logger('Successfully retrieved all parameters')
  params = {...params, ...result.found}
  return params
}

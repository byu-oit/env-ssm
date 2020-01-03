import debug from 'debug'
import {Options, ParametersFound, ParamsResult} from './types'
import {getParamsFromEnv, getParamsFromSSM} from './lib'

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

  // Check for prefix in env variables
  if (options.prefix) {
    if (options.prefix in process.env) {
      logger(`Found SSM prefix "${options.prefix}" in environment variables`)
      options.prefix = process.env[options.prefix]
    }
    logger(`SSM Prefix is: ${options.prefix}`)
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

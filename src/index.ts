import {Options, ParametersFound, ParamsResult} from './types'
import {getParamsFromEnv, getParamsFromSSM, isEmptyObj} from './lib'

export let params: ParametersFound = {}

export async function getParams(expectedParams: string[], options: Options = {}): Promise<ParametersFound> {
  if (isEmptyObj(params)) {
    return params
  }

  let result: ParamsResult = { expected: [], found: {}, missing: expectedParams}

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

  console.log('Successfully retrieved all parameters')
  params = {...params, ...result.found}
  return params
}

import {Options, ParametersFound} from './types'
import {getParamsFromEnv, getParamsFromSSM} from './lib'

export let params: ParametersFound

export async function getParams(expectedParams: string[], options: Options): Promise<ParametersFound> {
  if (params) {
    return params
  }

  const env = getParamsFromEnv(expectedParams)
  if (env.missing.length === 0) {
    params = env.found
    return params
  }

  const ssm = await getParamsFromSSM(env.missing, options)
  if (ssm.missing.length > 0) {
    console.error(`Unable to retrieve all parameters - Missing: ${JSON.stringify(ssm.missing)}`)
    throw new Error('Unable to retrieve all parameters')
  }

  console.log('Successfully retrieved all parameters')
  params = Object.assign(env.found, ssm.found)
  return params
}

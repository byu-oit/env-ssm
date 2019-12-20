import * as AWS from 'aws-sdk'
import {SSM} from 'aws-sdk'
import debug from 'debug'
import {Options, GetParamsResult, ParametersFound, ParametersMissing} from '../types'

const logger = debug('env-ssm')

export const ssm = {
  getParameters: (ssmParams: SSM.Types.GetParametersRequest, region: string = 'us-west-2'): Promise<SSM.Types.GetParametersResult> => {
    const ssm = new AWS.SSM({ apiVersion: '2014-11-06', region })
    return ssm.getParameters(ssmParams).promise()
  }
}

export function getParamsFromEnv (paramsToGet: string[]): GetParamsResult {
  const found: ParametersFound = {}
  const missing: string[] = []

  const existingEnvVars = Object.keys(process.env)
  paramsToGet.forEach(paramName => {
    if (existingEnvVars.includes(paramName)) {
      Object.defineProperty(found, paramName, {
        value: process.env[paramName],
        writable: false
      })
    } else {
      missing.push(paramName)
    }
  })
  if (missing.length === 0) {
    logger('Set parameters entirely from environment variables')
  } else if (Object.keys(found).length > 0) {
    logger('Got some (but not all) parameters from environment variables')
  }
  return { found, missing }
}

// Exported for test purposes
export async function getParamsFromSSM (paramsToGet: string[], options: Options): Promise<GetParamsResult> {
  logger('Trying to get parameters from AWS SSM (EC2 Parameter Store)')

  const found: ParametersFound = {}
  let missing: ParametersMissing = []

  if (options.prefix){
    if (options.prefix.startsWith('/') && !options.prefix.endsWith('/')) options.prefix += '/'
    else if (!options.prefix.endsWith('.')) options.prefix += '.'
  }

  const ssmResponse = await ssm.getParameters({
    WithDecryption: true,
    Names: paramsToGet.map(name => `${options.prefix || ''}${name}`)
  }, options.region)

  if (ssmResponse.Parameters) {
    ssmResponse.Parameters.forEach(({ Name, Value }) => {
      if (Name && Value) {
        const key = Name.substring(options.prefix.length) // Anything after the prefix
        found[key] = Value
      }
    })
  }
  if (ssmResponse.InvalidParameters) {
    missing = ssmResponse.InvalidParameters.map(param => param.substring(options.prefix.length))
  }

  return { found, missing }
}

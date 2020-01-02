import * as AWS from 'aws-sdk'
import {SSM} from 'aws-sdk'
import debug from 'debug'
import {Options, ParamsResult} from '../types'

const logger = debug('env-ssm')

export const ssm = {
  getParameters: (ssmParams: SSM.Types.GetParametersRequest, region: string = 'us-west-2'): Promise<SSM.Types.GetParametersResult> => {
    const ssm = new AWS.SSM({ apiVersion: '2014-11-06', region })
    return ssm.getParameters(ssmParams).promise()
  }
}

export function getParamsFromEnv (params: ParamsResult, options: Options): ParamsResult {
  // Check for parameters in environment
  params.missing.forEach(paramName => {
    if (paramName in process.env) {
      params.found = {...params.found, [paramName]: process.env[paramName] as string}

      // Remove entry from missing
      const index = params.missing.indexOf(paramName)
      if (index !== -1) {
        params.missing.splice(index, 1)
      }
    }
  })

  if (params.missing.length === 0) {
    logger('Set parameters entirely from environment variables')
  } else if (Object.keys(params.found).length > 0) {
    logger('Got some (but not all) parameters from environment variables')
  }

  return params
}

// Exported for test purposes
export async function getParamsFromSSM (params: ParamsResult, options: Options = {}): Promise<ParamsResult> {
  logger('Trying to get parameters from AWS SSM (EC2 Parameter Store)')

  // Normalize ssm parameter prefix
  if (options.prefix){
    if (options.prefix.startsWith('/') && !options.prefix.endsWith('/')) options.prefix += '/'
    else if (!options.prefix.endsWith('.')) options.prefix += '.'
  }

  // Retrieve missing parameters from ssm
  const ssmResponse = await ssm.getParameters({
    WithDecryption: true,
    Names: params.missing.map(name => `${options.prefix || ''}${name}`)
  }, options.region)

  if (ssmResponse.Parameters) {
    ssmResponse.Parameters.forEach(({ Name, Value }) => {
      if (Name && Value) {
        const key = options.prefix ? Name.substring(options.prefix.length) : Name
        params.found[key] = Value

        // Remove entry from missing
        const index = params.missing.indexOf(key)
        if (index !== -1) {
          params.missing.splice(index, 1)
        }
      }
    })
  }

  return params
}

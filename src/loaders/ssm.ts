import set from 'lodash.set'
import chunk from 'lodash.chunk'
import {
  DescribeParametersCommand,
  GetParametersByPathCommand,
  GetParametersCommand,
  Parameter,
  ParameterMetadata
} from '@aws-sdk/client-ssm'
import { ResolvedOptions } from '../env-ssm'
import Debugger from 'debug'

const logger = Debugger('env-ssm/ssm-loader')

export async function loadSsmParams (options: ResolvedOptions): Promise<NodeJS.ProcessEnv> {
  const { pathDelimiter } = options

  // Make requests and combine all results into an array of parameters
  // Ensure each parameter has the "Path" that was used to retrieve it
  logger('Checking ssm for parameters')
  const ssmParameters = pathDelimiter === '/' ? await loadSsmParamsByPath(options) : await loadSsmParamsByPrefix(options)

  // Combine all parameters into an environment container, aka NodeJS.ProcessEnv
  return ssmParameters.reduce<NodeJS.ProcessEnv>((agg, { Path, Name, Value }) => {
    if (Name == null) return agg // Shouldn't get here

    // Get hierarchy from parameter path
    const path = Path === Name
      ? Name.split(pathDelimiter).pop() as string
      : Name.replace(RegExp(`^${Path}${pathDelimiter}?`), '').split(pathDelimiter).join('.')

    // Add parameter into environment container
    return set(agg, path, Value)
  }, {})
}

async function loadSsmParamsByPath (options: ResolvedOptions): Promise<Array<Parameter & { Path: string }>> {
  const { ssm, paths } = options
  return await Promise.all(paths.map(async path => {
    const response: Array<Parameter & {Path: string}> = []
    async function getSsmParametersByPath (token?: string): Promise<void> {
      const command = new GetParametersByPathCommand({ Path: path, Recursive: true, ...token != null && { NextToken: token }, WithDecryption: true })
      let nextToken: string | undefined
      try {
        // Send request and transform response
        const result = await ssm.send(command)
        const { Parameters = [] } = result
        nextToken = result.NextToken
        for (const param of Parameters) {
          response.push(({ ...param, Path: path }))
        }
      } catch (e: unknown) {
        // e is technically an unknown/any type
        const message = e instanceof Error ? e.message : JSON.stringify(e)
        // It's possible that the parameter is not required, so we'll handle failed responses and only warn if
        // verbose logging is turned on via the DEBUG environment variable
        logger(`Cannot resolve path from AWS SSM '${path}': ${message}`)
      }

      // Recursively call to get next parameters since the max number returned is 10
      if (nextToken != null) {
        await getSsmParametersByPath(nextToken)
      }
    }
    await getSsmParametersByPath()
    return response
  })).then(parameters => parameters.flat()) // Flatten all responses
}

async function loadSsmParamsByPrefix (options: ResolvedOptions): Promise<Array<Parameter & { Path: string }>> {
  const { ssm, paths } = options

  async function describeSsmParameters (path: string, parameters: ParameterMetadata[] = [], token?: string): Promise<ParameterMetadata[]> {
    const command = new DescribeParametersCommand({ ParameterFilters: [{ Key: 'Name', Option: 'BeginsWith', Values: [path] }], ...token != null && { NextToken: token } })
    try {
      const { Parameters = [], NextToken } = await ssm.send(command)
      parameters.push(...Parameters)
      if (NextToken != null) {
        await describeSsmParameters(path, parameters, NextToken)
      }
    } catch (e: unknown) {
      // e is technically an unknown/any type
      const message = e instanceof Error ? e.message : JSON.stringify(e)
      // It's possible that the parameter is not required, so we'll handle failed responses and only warn if
      // verbose logging is turned on via the DEBUG environment variable
      logger(`Cannot resolve parameter metadata from AWS SSM: ${message}`)
    }
    return parameters
  }

  async function getSsmParametersByName (path: string, metadata: ParameterMetadata[]): Promise<Array<Parameter & {Path: string}>> {
    const chunks = chunk(metadata, 10)
    return await Promise.all(chunks.map(async chunk => {
      const response: Array<Parameter & {Path: string}> = []
      const command = new GetParametersCommand({ Names: chunk.map(datum => datum.Name as string), WithDecryption: true })
      try {
        const result = await ssm.send(command)
        const { Parameters = [], InvalidParameters = [] } = result
        if (InvalidParameters.length > 0) {
          logger(`Invalid parameter names: ${InvalidParameters.join(', ')}`)
        }
        for (const param of Parameters) {
          response.push(({ ...param, Path: path }))
        }
      } catch (e: unknown) {
        // e is technically an unknown/any type
        const message = e instanceof Error ? e.message : JSON.stringify(e)
        // It's possible that the parameter is not required, so we'll handle failed responses and only warn if
        // verbose logging is turned on via the DEBUG environment variable
        logger(`Cannot resolve parameter values from AWS SSM: ${message}`)
      }
      return response
    })).then(parameters => parameters.flat()) // Flatten all responses
  }

  return await Promise.all(paths.map(async path => {
    const metadata = await describeSsmParameters(path)
    return await getSsmParametersByName(path, metadata)
  })).then(parameters => parameters.flat())
}

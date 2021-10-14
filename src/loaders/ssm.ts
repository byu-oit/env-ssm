import set from 'lodash.set'
import chunk from 'lodash.chunk'
import {
  DescribeParametersCommand,
  GetParametersByPathCommand,
  GetParametersCommand,
  Parameter,
  ParameterMetadata,
  SSMClient
} from '@aws-sdk/client-ssm'
import { Options, ResolvedOptions } from '../env-ssm'
import { PathSsm } from '../path-ssm'
import Debugger from 'debug'

const logger = Debugger('env-ssm/ssm-loader')

export function resolvePathDelimiter (input: Options): string {
  input.pathDelimiter = input.pathDelimiter ?? '/'
  return input.pathDelimiter
}

export function resolvePaths (options: Options, delimiter: string): PathSsm[] {
  if (PathSsm.like(options.paths)) {
    return [PathSsm.from(options.paths, delimiter)]
  }
  return options.paths.map(pathLike => PathSsm.from(pathLike))
}

export async function resolveSSMClient (options: Options): Promise<SSMClient> {
  // Import ssm client if not provided (optional dependency)
  return (options.ssm == null)
    ? new (await import('@aws-sdk/client-ssm')).SSMClient({})
    : options.ssm
}

export async function loadSsmParams (options: ResolvedOptions): Promise<NodeJS.ProcessEnv> {
  const { ssm, paths } = options
  // Make requests and combine all results into an array of parameters
  // Ensure each parameter has the "Path" that was used to retrieve it
  logger('Checking ssm for parameters')
  const ssmParameters = await Promise.all(paths.map(async path => {
    return path.delimiter === '/' && path.path.startsWith(path.delimiter)
      ? await fetchSsmParamsByPath(ssm, path)
      : await fetchSsmParamsByPrefix(ssm, path)
  })).then(parameters => parameters.flat())

  // Combine all parameters into an environment container, aka NodeJS.ProcessEnv
  return ssmParameters.reduce<NodeJS.ProcessEnv>((agg, { Path, Name, Value }) => {
    if (Name == null) return agg // Shouldn't get here

    // Get hierarchy from parameter path
    const path = Path.path === Name
      ? Name.split(Path.delimiter).pop() as string
      : Name.replace(RegExp(`^${Path.path}${Path.delimiter}?`), '').split(Path.delimiter).join('.')

    // Add parameter into environment container
    return set(agg, path, Value)
  }, {})
}

async function fetchSsmParamsByPath (ssm: SSMClient, path: PathSsm, parameters: Array<Parameter & { Path: PathSsm }> = [], token?: string): Promise<Array<Parameter & { Path: PathSsm }>> {
  const command = new GetParametersByPathCommand({ Path: path.path, Recursive: true, ...token != null && { NextToken: token }, WithDecryption: true })
  try {
    // Send request and transform response
    const { Parameters = [], NextToken } = await ssm.send(command)
    parameters.push(...Parameters.map(parameter => ({ ...parameter, Path: path })))

    // Recursively call to get next parameters since the max number returned is 10
    if (NextToken != null) {
      await fetchSsmParamsByPath(ssm, path, parameters, NextToken)
    }
  } catch (e: unknown) { // e is technically an unknown/any type
    const message = e instanceof Error ? e.message : JSON.stringify(e)
    // It's possible that the parameter is not required, so we'll handle failed responses and only warn if
    // verbose logging is turned on via the DEBUG environment variable
    logger(`Cannot resolve path from AWS SSM '${path.path}': ${message}`)
  }
  return parameters
}

async function fetchSsmParamsByPrefix (ssm: SSMClient, prefix: PathSsm): Promise<Array<Parameter & { Path: PathSsm }>> {
  const metadata = await describeSsmParameters(ssm, prefix)
  const parameterNames = metadata.map(datum => datum.Name as string)
  const chunks = chunk(parameterNames, 10) // Cannot retrieve more than 10 parameters at a time
  return await Promise.all(chunks.map(async chunk => {
    return await fetchSsmParametersByName(ssm, prefix, chunk)
  })).then(parameters => parameters.flat())
}

async function describeSsmParameters (ssm: SSMClient, prefix: PathSsm, parameters: ParameterMetadata[] = [], token?: string): Promise<ParameterMetadata[]> {
  const command = new DescribeParametersCommand({ ParameterFilters: [{ Key: 'Name', Option: 'BeginsWith', Values: [prefix.path] }], ...token != null && { NextToken: token } })
  try {
    const { Parameters = [], NextToken } = await ssm.send(command)
    parameters.push(...Parameters)

    // Recursively call to get next parameters since the max number returned is 10
    if (NextToken != null) {
      await describeSsmParameters(ssm, prefix, parameters, NextToken)
    }
  } catch (e: unknown) { // e is technically an unknown/any type
    const message = e instanceof Error ? e.message : JSON.stringify(e)
    // It's possible that the parameter is not required, so we'll handle failed responses and only warn if
    // verbose logging is turned on via the DEBUG environment variable
    logger(`Cannot resolve prefix from AWS SSM '${prefix.path}': ${message}`)
  }
  return parameters
}

async function fetchSsmParametersByName (ssm: SSMClient, prefix: PathSsm, names: string[]): Promise<Array<Parameter & {Path: PathSsm}>> {
  const response: Array<Parameter & {Path: PathSsm}> = []
  if (names.length === 0) return response // Early out if names[] is empty

  const command = new GetParametersCommand({ Names: names, WithDecryption: true })
  try {
    const result = await ssm.send(command)
    const { Parameters = [], InvalidParameters = [] } = result
    if (InvalidParameters.length > 0) {
      // Should never see this warning since we're only using GetParametersCommand with the results of
      // DescribeParametersCommand, but it's here for completeness
      logger(`Invalid parameter names: ${InvalidParameters.join(', ')}`)
    }
    for (const param of Parameters) {
      response.push(({ ...param, Path: prefix }))
    }
  } catch (e: unknown) { // e is technically an unknown/any type
    const message = e instanceof Error ? e.message : JSON.stringify(e)
    // It's possible that the parameter is not required, so we'll handle failed responses and only warn if
    // verbose logging is turned on via the DEBUG environment variable
    logger(`Cannot resolve parameter values with prefix "${prefix.path}" from AWS SSM: ${message}`)
  }
  return response
}

import { GetParametersByPathCommand, Parameter, SSMClient } from '@aws-sdk/client-ssm'
import { ExtenderType, ExtenderTypeOptional, Extensions, from, IEnv, IOptionalVariable, IPresentVariable } from 'env-var'
import Debugger from 'debug'
import path from 'path'
import fs from 'fs'
import set from 'lodash.set'
import merge from 'lodash.merge'

const logger = Debugger('env-ssm')

export interface Options {
  /**
    * Specify an SSMClient to use for the request(s)
    */
  ssm?: SSMClient

  /**
    * The paths to use in the AWS SSM GetParametersByPathCommand
    */
  paths: string | string[]

  /**
    * Adds process.env variables to the container (default true).
    */
  processEnv?: boolean

  /**
    * Adds tfvar file variables to the container (default false).
    */
  tfvar?: string

  /**
    * Adds .env file variables to the container (default true).
    */
  dotenv?: boolean | string
}
export interface ResolvedOptions extends Required<Options> {
  paths: string[]
  dotenv: string
}

export type EnvVar<T extends Extensions = {}> = IEnv<IPresentVariable<T> & ExtenderType<T>, IOptionalVariable<T> & ExtenderTypeOptional<T>>

/**
 * Coerces input options into a more consistent format and setting defaults
 */
async function resolveOptions (options: Options): Promise<ResolvedOptions> {
  const processEnv = resolveProcessEnv(options)
  const tfvar = resolveTfVar(options)
  const dotenv = resolveDotEnv(options)
  const paths = resolvePaths(options)
  const ssm = await resolveSSMClient(options)
  return { processEnv, tfvar, dotenv, ssm, paths }
}

function resolveProcessEnv (options: Options): boolean {
  return options.processEnv === undefined ? true : options.processEnv
}

function resolveTfVar (options: Options): string {
  return options.tfvar !== undefined ? path.join(process.cwd(), options.tfvar) : ''
}

function resolveDotEnv (options: Options): string {
  if (typeof options.dotenv === 'string') {
    return path.join(process.cwd(), options.dotenv)
  }
  return options.dotenv === true ? path.join(process.cwd(), '.env') : ''
}

function resolvePaths (options: Options): string[] {
  return !Array.isArray(options.paths)
    ? [options.paths]
    : options.paths
}

async function resolveSSMClient (options: Options): Promise<SSMClient> {
  // Import ssm client if not provided (optional dependency)
  return (options.ssm == null)
    ? new (await import('@aws-sdk/client-ssm')).SSMClient({})
    : options.ssm
}

/**
 * Creates an environment container from a SSM Parameter Store path
 */
export default async function EnvSsm (input: string | string[] | Options): Promise<EnvVar> {
  const options = typeof input === 'string' || Array.isArray(input) ? { paths: input } : input
  const resolvedOptions = await resolveOptions(options)
  const { tfvar, dotenv, processEnv } = resolvedOptions

  // Merge all containers in order of precedence: ssm, .env, .tfvar, process.env
  // Merging with lodash.merge to maintain ssm path tree (e.g. /db/user = 'secret' => {db: {user: 'secret'}})
  const containers: NodeJS.ProcessEnv[] = []
  if (dotenv !== '') containers.push(await loadDotEnv(resolvedOptions))
  if (tfvar !== '') containers.push(await loadTfVar(resolvedOptions))
  if (processEnv) containers.push(loadProcessEnv())
  const container = merge(await loadSsmParams(resolvedOptions), ...containers)

  // Ensure all parameter values are of type string
  for (const prop in container) {
    if (!Object.hasOwnProperty.call(container, prop) || typeof container[prop] === 'string') continue
    container[prop] = JSON.stringify(container[prop])
  }

  // Return an instance of EnvVar for read-able and typed interactions with environment variables
  return from(container)
}

async function loadSsmParams (options: ResolvedOptions): Promise<NodeJS.ProcessEnv> {
  const { ssm, paths } = options

  // Make requests and combine all results into an array of parameters
  // Ensure each parameter has the "Path" that was used to retrieve it
  logger('Checking ssm for parameters')
  const ssmParameters = await Promise.all(paths.map(async path => {
    const response: Array<Parameter & {Path: string}> = []
    async function getSsmParameters (token?: string): Promise<void> {
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
        await getSsmParameters(nextToken)
      }
    }
    await getSsmParameters()
    return response
  })).then(parameters => parameters.flat()) // Flatten all responses

  // Combine all parameters into an environment container, aka NodeJS.ProcessEnv
  return ssmParameters.reduce<NodeJS.ProcessEnv>((agg, { Path, Name, Value }) => {
    if (Name == null) return agg // Shouldn't get here

    // Get hierarchy from parameter path
    const path = Path === Name
      ? Name.split('/').pop() as string
      : Name.replace(Path + '/', '').split('/').join('.')

    // Add parameter into environment container
    return set(agg, path, Value)
  }, {})
}

async function loadDotEnv (options: ResolvedOptions): Promise<NodeJS.ProcessEnv> {
  const { dotenv } = options
  let container: NodeJS.ProcessEnv = {}
  try {
    const DotEnv = await import('dotenv')
    logger('Checking for local .env file')
    container = DotEnv.parse(fs.readFileSync(dotenv))
  } catch (e) {
    if (e.code === 'ENOENT') {
      logger(`Cannot resolve .env file path '${dotenv}`)
    } else throw e
  }
  return container
}

async function loadTfVar (options: ResolvedOptions): Promise<NodeJS.ProcessEnv> {
  const { tfvar } = options
  let container: NodeJS.ProcessEnv = {}
  try {
    const DotTfVars = await import('@byu-oit/dottfvars')
    logger('Checking for local .tfvar file')
    container = DotTfVars.parse(fs.readFileSync(tfvar))
  } catch (e) {
    if (e.code === 'ENOENT') {
      logger(`Cannot resolve .tfvar file path '${tfvar}`)
    } else throw e
  }
  return container
}

function loadProcessEnv (): NodeJS.ProcessEnv {
  logger('Adding process.env variables')
  return process.env
}

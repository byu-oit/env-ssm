import { SSMClient } from '@aws-sdk/client-ssm'
import { ExtenderType, ExtenderTypeOptional, Extensions, from, IEnv, IOptionalVariable, IPresentVariable } from 'env-var'
import merge from 'lodash.merge'
import path from 'path'
import { loadDotEnv, loadProcessEnv, loadSsmParams, loadTfVar } from './loaders'

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

  /**
   * Specify a path delimiter (default "/").
   */
  pathDelimiter?: string
}
export interface ResolvedOptions extends Required<Options> {
  paths: string[]
  dotenv: string
  pathDelimiter: string
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
  const pathDelimiter = resolvePathDelimiter(options)
  const ssm = await resolveSSMClient(options)
  return { processEnv, tfvar, dotenv, ssm, paths, pathDelimiter }
}

function resolveProcessEnv (options: Options): boolean {
  return options.processEnv === undefined ? true : options.processEnv
}

function resolveTfVar (options: Options): string {
  return options.tfvar !== undefined ? path.resolve(process.cwd(), options.tfvar) : ''
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

function resolvePathDelimiter (options: Options): string {
  return options.pathDelimiter ?? '/'
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

import { SSMClient } from '@aws-sdk/client-ssm'
import { from, IEnv, IOptionalVariable } from 'env-var'
import merge from 'lodash.merge'
import {
  loadDotEnv,
  loadProcessEnv,
  loadSsmParams,
  loadTfVar,
  resolveDotEnv,
  resolvePathDelimiter,
  resolvePaths,
  resolveProcessEnv,
  resolveSSMClient,
  resolveTfVar
} from './loaders/index.js'
import { PathSsm, PathSsmLike } from './path-ssm.js'

export interface Options {
  /**
   * The paths to use in the AWS SSM GetParametersByPathCommand
   */
  paths?: PathSsmLike | PathSsm | Array<PathSsmLike | PathSsm>

  /**
   * Specify a path delimiter (default "/").
   */
  pathDelimiter?: string

  /**
   * Specify an SSMClient to use for the request(s)
   */
  ssm?: boolean | SSMClient

  /**
   * Adds process.env variables to the container (default true).
   */
  processEnv?: boolean

  /**
   * Adds tfvar file variables to the container (default false).
   */
  tfvar?: false | string

  /**
   * Adds .env file variables to the container (default true).
   */
  dotenv?: boolean | string
}

export interface ResolvedOptions {
  paths: PathSsm[]
  pathDelimiter: string
  ssm?: SSMClient
  processEnv: boolean
  tfvar?: string
  dotenv?: string
}

/**
 * Coerces input options into a more consistent format and setting defaults
 */
async function resolveOptions (input: PathSsmLike | PathSsmLike[] | Options = {}, delimiter?: string): Promise<ResolvedOptions> {
  const options: Options = PathSsm.like(input) || Array.isArray(input)
    ? { paths: input, pathDelimiter: delimiter }
    : input
  const pathDelimiter = resolvePathDelimiter(options)
  const paths = resolvePaths(options, pathDelimiter)
  const processEnv = resolveProcessEnv(options)
  const tfvar = resolveTfVar(options)
  const dotenv = resolveDotEnv(options)
  const ssm = await resolveSSMClient(options)
  return { processEnv, tfvar, dotenv, ssm, paths, pathDelimiter }
}

/**
 * Creates an environment container from an SSM Parameter Store path
 */
export async function EnvSsm<T extends Record<string, unknown>> (input: PathSsmLike | PathSsmLike[] | Options = {}, delimiter?: string): Promise<IEnv<IOptionalVariable, T>> {
  const options = await resolveOptions(input, delimiter)
  const { tfvar, dotenv, processEnv, ssm, paths } = options

  // Merge all containers in order of precedence: ssm, .env, .tfvar, process.env
  // Merging with lodash.merge to maintain ssm path tree (e.g. /db/user = 'secret' => {db: {user: 'secret'}})
  const containers: NodeJS.ProcessEnv[] = []
  if (ssm !== undefined) containers.push(await loadSsmParams(ssm, paths))
  if (dotenv !== undefined) containers.push(await loadDotEnv(dotenv))
  if (tfvar !== undefined) containers.push(await loadTfVar(tfvar))
  if (processEnv) containers.push(loadProcessEnv())
  const container = merge({}, ...containers)

  // Ensure all parameter values are of type string
  for (const prop in container) {
    /* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions */
    if (!Object.hasOwnProperty.call(container, prop) || typeof container[prop] === 'string') continue
    container[prop] = JSON.stringify(container[prop])
  }

  // Return an instance of EnvVar for read-able and typed interactions with environment variables
  return from(container)
}
export default EnvSsm

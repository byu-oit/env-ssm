import { SSMClient } from '@aws-sdk/client-ssm'
import { merge } from 'lodash-es'
import {
  loadDotEnv,
  loadProcessEnv,
  loadSsmParams,
  resolveDotEnv,
  resolvePathDelimiter,
  resolvePaths,
  resolveProcessEnv,
  resolveSSMClient
} from './loaders/index.js'
import { PathSsm, PathSsmLike } from './path-ssm.js'
import { CoercionContainer } from './coercion.js'
export { CoercionContainer as from } from './coercion.js'

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
   * Adds .env file variables to the container (default true).
   */
  dotenv?: boolean | string
}

export interface ResolvedOptions {
  paths: PathSsm[]
  pathDelimiter: string
  ssm?: SSMClient
  processEnv: boolean
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
  const dotenv = resolveDotEnv(options)
  const ssm = await resolveSSMClient(options)
  return { processEnv, dotenv, ssm, paths, pathDelimiter }
}

/**
 * Creates an environment container from an SSM Parameter Store path
 */
export default async function EnvSsm<T extends Record<string, unknown>> (input: PathSsmLike | PathSsmLike[] | Options = {}, delimiter?: string): Promise<CoercionContainer<T>> {
  const options = await resolveOptions(input, delimiter)
  const { dotenv, processEnv, ssm, paths } = options

  // Merge all sources in order of precedence: ssm, .env, process.env
  // Merging with lodash.merge to maintain ssm path tree (e.g. /db/user = 'secret' => {db: {user: 'secret'}})
  const sources: NodeJS.ProcessEnv[] = []
  if (ssm !== undefined) sources.push(await loadSsmParams(ssm, paths))
  if (dotenv !== undefined) sources.push(await loadDotEnv(dotenv))
  if (processEnv) sources.push(loadProcessEnv())
  const mergedSources = merge({}, ...sources)

  // Return an instance of EnvVar for read-able and typed interactions with environment variables
  return new CoercionContainer(mergedSources)
}

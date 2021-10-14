import { SSMClient } from '@aws-sdk/client-ssm'
import { ExtenderType, ExtenderTypeOptional, Extensions, from, IEnv, IOptionalVariable, IPresentVariable } from 'env-var'
import merge from 'lodash.merge'
import {
  resolveSSMClient, resolvePaths, resolvePathDelimiter, resolveDotEnv, resolveProcessEnv, resolveTfVar,
  loadSsmParams, loadDotEnv, loadProcessEnv, loadTfVar
} from './loaders'
import { PathSsm, PathSsmLike } from './path-ssm'

export interface Options {
  /**
   * The paths to use in the AWS SSM GetParametersByPathCommand
   */
  paths: PathSsmLike | PathSsm | Array<PathSsmLike | PathSsm>

  /**
   * Specify a path delimiter (default "/").
   */
  pathDelimiter?: string

  /**
    * Specify an SSMClient to use for the request(s)
    */
  ssm?: SSMClient

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
  paths: PathSsm[]
  dotenv: string
}

export type EnvVar<T extends Extensions = {}> = IEnv<IPresentVariable<T> & ExtenderType<T>, IOptionalVariable<T> & ExtenderTypeOptional<T>>

/**
 * Coerces input options into a more consistent format and setting defaults
 */
async function resolveOptions (input: PathSsmLike | PathSsmLike[] | Options, delimiter?: string): Promise<ResolvedOptions> {
  const options: Options = PathSsm.like(input) || Array.isArray(input) ? { paths: input, pathDelimiter: delimiter } : input
  const pathDelimiter = resolvePathDelimiter(options)
  const paths = resolvePaths(options, pathDelimiter)
  const processEnv = resolveProcessEnv(options)
  const tfvar = resolveTfVar(options)
  const dotenv = resolveDotEnv(options)
  const ssm = await resolveSSMClient(options)
  return { processEnv, tfvar, dotenv, ssm, paths, pathDelimiter }
}

/**
 * Creates an environment container from a SSM Parameter Store path
 */
export default async function EnvSsm (input: PathSsmLike | PathSsmLike[] | Options, delimiter?: string): Promise<EnvVar> {
  const options = await resolveOptions(input, delimiter)
  const { tfvar, dotenv, processEnv } = options

  // Merge all containers in order of precedence: ssm, .env, .tfvar, process.env
  // Merging with lodash.merge to maintain ssm path tree (e.g. /db/user = 'secret' => {db: {user: 'secret'}})
  const containers: NodeJS.ProcessEnv[] = []
  if (dotenv !== '') containers.push(await loadDotEnv(options))
  if (tfvar !== '') containers.push(await loadTfVar(options))
  if (processEnv) containers.push(loadProcessEnv())
  const container = merge(await loadSsmParams(options), ...containers)

  // Ensure all parameter values are of type string
  for (const prop in container) {
    if (!Object.hasOwnProperty.call(container, prop) || typeof container[prop] === 'string') continue
    container[prop] = JSON.stringify(container[prop])
  }

  // Return an instance of EnvVar for read-able and typed interactions with environment variables
  return from(container)
}

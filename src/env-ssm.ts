import { GetParametersByPathCommand, Parameter, SSMClient } from '@aws-sdk/client-ssm'
import { ExtenderType, ExtenderTypeOptional, Extensions, from, IEnv, IOptionalVariable, IPresentVariable } from 'env-var'
import globby from 'globby'
import * as dottfvars from '@byu-oit/dottfvars'
import Debugger from 'debug'
import * as path from "path";
const logger = Debugger('env-ssm')

export interface Path { path: string, trim?: string }
export interface Options {
  /**
     * Specify an SSMClient to use for the request(s)
     */
  ssm?: SSMClient

  /**
     * The Path to use in the GetParametersByPathCommand
     */
  paths: string | Path | Array<string | Path>

  /**
     * Removes part of the path that matches the trim (default true).
     */
  trim?: boolean

  /**
     * Adds process.env variables to the container (default true).
     */
  processEnv?: boolean

  /**
   * Adds tfvars variables to the container (default true)
   */
  tfvars?: string | boolean
}
export interface ResolvedOptions extends Required<Options> {
  paths: Path[]
  tfvars: string | false
}

export type EnvVar<T extends Extensions = {}> = IEnv<IPresentVariable<T> & ExtenderType<T>, IOptionalVariable<T> & ExtenderTypeOptional<T>>

/**
 * Coerces path input to Path object
 */
function resolvePath (path: string | Path): Path {
  return typeof path === 'string' ? { path } : path
}

/**
 * Coerces input options into a more consistent format and setting defaults
 */
async function resolveOptions (options: Options): Promise<ResolvedOptions> {
  const trim = options.trim === undefined ? true : options.trim
  const processEnv = options.processEnv === undefined ? true : options.processEnv

  let tfvars: undefined | false | string = globby.sync(path.join(process.cwd(), './*.tfvars*'))[0]
  if (typeof options.tfvars === 'string') {
    tfvars = path.join(process.cwd(), options.tfvars)
  } else if (options.tfvars == null) {
    tfvars = false
  }

  // Convert all path inputs into "Path" objects
  const paths = !Array.isArray(options.paths)
    ? [resolvePath(options.paths)]
    : options.paths.map(resolvePath)

  // Import ssm client if not provided (optional dependency)
  const ssm: SSMClient = (options.ssm == null)
    ? new (await import('@aws-sdk/client-ssm')).SSMClient({})
    : options.ssm

  return { trim, processEnv, tfvars, ssm, paths }
}

/**
 * Creates an environment container from a SSM Parameter Store path
 */
export default async function EnvSsm (input: string | string[] | Path[] | Options): Promise<EnvVar> {
  const options = typeof input === 'string' || Array.isArray(input) ? { paths: input } : input
  const { ssm, paths, trim, processEnv, tfvars } = await resolveOptions(options)

  if (tfvars) {
    logger(`Checking for local tfvars files`)
    dottfvars.from(tfvars)
  }

  // Make requests and combine all results into an array of parameters
  // Ensure each parameter has the "Path" that was used to retrieve it
  logger(`Checking ssm for parameters`)
  const parameters = await Promise.all(paths.map(async ({ path, trim }) => {
    // Create request
    const command = new GetParametersByPathCommand({ Path: path, Recursive: true })

    const response: Array<Parameter & {Path: Path}> = []
    try {
      // Send request and transform response
      const { Parameters = [] } = await ssm.send(command)
      for (const param of Parameters) {
        response.push(({ ...param, Path: { path, trim } }))
      }
    } catch (e: unknown) {
      // e is technically an unknown/any type
      const message = e instanceof Error ? e.message : JSON.stringify(e)
      // It's possible that the parameter is not required, so we'll handle failed responses and only warn if
      // verbose logging is turned on via the DEBUG environment variable
      logger(`Cannot resolve path from AWS SSM '${path}': ${message}`)
    }
    return response
  })).then(parameters => parameters.flat()) // Flatten all responses

  // Combine all parameters into an environment container, aka NodeJS.ProcessEnv
  const container = parameters.reduce<NodeJS.ProcessEnv>((agg, { Path, Name, Value }) => {
    if (Name == null) return agg // Shouldn't get here

    // Derive the part of the path to remove (if any)
    let match = Path.trim
    if (match == null && trim) match = Path.path
    if (match != null && !match.endsWith('/')) match += '/'

    // Trim parameter name
    // TODO - Improve trimming
    const key = match != null ? Name.replace(match, '') : Name

    // Add parameter into environment container
    return { ...agg, [key]: Value }
  }, processEnv ? process.env : {})

  return from(container)
}

import fs from 'fs'
import { Options } from '../env-ssm'
import Debugger from 'debug'
import path from 'path'

const logger = Debugger('env-ssm/tfvars-loader')

export const ENV_SSM_TFVAR_KEY = 'ENV_SSM_TFVAR'

export function resolveTfVar (options: Options): string | undefined {
  if (options.tfvar === undefined) {
    const envSsmTfVar = process.env[ENV_SSM_TFVAR_KEY]
    if (envSsmTfVar !== undefined) {
      return path.resolve(process.cwd(), envSsmTfVar)
    }
  }
  if (typeof options.tfvar === 'string') {
    return path.resolve(process.cwd(), options.tfvar)
  }
}

export async function loadTfVar (tfvar: string): Promise<NodeJS.ProcessEnv> {
  let container: NodeJS.ProcessEnv = {}
  try {
    const DotTfVars = await import('@byu-oit/dottfvars')
    logger('Checking for local .tfvar file')
    container = DotTfVars.parse(fs.readFileSync(tfvar))
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      logger(`Cannot resolve .tfvar file path '${tfvar}`)
    } else throw e
  }
  return container
}

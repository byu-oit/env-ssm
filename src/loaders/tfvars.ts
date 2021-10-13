import fs from 'fs'
import { ResolvedOptions } from '../env-ssm'
import Debugger from 'debug'

const logger = Debugger('env-ssm/process-loader')

export async function loadTfVar (options: ResolvedOptions): Promise<NodeJS.ProcessEnv> {
  const { tfvar } = options
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

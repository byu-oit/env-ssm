import fs from 'fs'
import { Options, ResolvedOptions } from '../env-ssm'
import Debugger from 'debug'
import path from 'path'

const logger = Debugger('env-ssm/dotenv-loader')

export function resolveDotEnv (options: Options): string {
  if (typeof options.dotenv === 'string') {
    return path.join(process.cwd(), options.dotenv)
  }
  return options.dotenv === true ? path.join(process.cwd(), '.env') : ''
}

export async function loadDotEnv (options: ResolvedOptions): Promise<NodeJS.ProcessEnv> {
  const { dotenv } = options
  let container: NodeJS.ProcessEnv = {}
  try {
    const DotEnv = await import('dotenv')
    logger('Checking for local .env file')
    container = DotEnv.parse(fs.readFileSync(dotenv))
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      logger(`Cannot resolve .env file path '${dotenv}`)
    } else throw e
  }
  return container
}

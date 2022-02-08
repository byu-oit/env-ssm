import fs from 'fs'
import { Options } from '../env-ssm'
import Debugger from 'debug'
import path from 'path'

const logger = Debugger('env-ssm/dotenv-loader')

export const ENV_SSM_DOTENV_KEY = 'ENV_SSM_DOTENV'

export function resolveDotEnv (options: Options): string | undefined {
  const envSsmDotenv = process.env[ENV_SSM_DOTENV_KEY]
  if (options.dotenv === undefined && envSsmDotenv !== undefined) {
    return path.join(process.cwd(), envSsmDotenv)
  }
  if (typeof options.dotenv === 'string') {
    return path.join(process.cwd(), options.dotenv)
  }
  if (options.dotenv === true) {
    return path.join(process.cwd(), '.env')
  }
}

export async function loadDotEnv (dotenv: string): Promise<NodeJS.ProcessEnv> {
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

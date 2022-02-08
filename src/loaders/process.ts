import Debugger from 'debug'
import { Options } from '../env-ssm'

const logger = Debugger('env-ssm/process-loader')

export const ENV_SSM_PROCESS_ENV_KEY = 'ENV_SSM_PROCESS_ENV'

export function resolveProcessEnv (options: Options): boolean {
  if (options.processEnv === undefined) {
    const envSsmProcessEnv = process.env[ENV_SSM_PROCESS_ENV_KEY]
    if (envSsmProcessEnv !== undefined) {
      return envSsmProcessEnv === 'true'
    }
    return true
  }
  return options.processEnv
}

export function loadProcessEnv (): NodeJS.ProcessEnv {
  logger('Adding process.env variables')
  return process.env
}

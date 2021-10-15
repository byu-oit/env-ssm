import Debugger from 'debug'
import { Options } from '../env-ssm'

const logger = Debugger('env-ssm/process-loader')

export function resolveProcessEnv (options: Options): boolean {
  return options.processEnv === undefined ? true : options.processEnv
}

export function loadProcessEnv (): NodeJS.ProcessEnv {
  logger('Adding process.env variables')
  return process.env
}

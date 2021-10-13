import Debugger from 'debug'

const logger = Debugger('env-ssm/tfvars-loader')

export function loadProcessEnv (): NodeJS.ProcessEnv {
  logger('Adding process.env variables')
  return process.env
}

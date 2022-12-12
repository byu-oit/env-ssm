import fs from 'fs'
import { SSMClient } from './__mocks__/@aws-sdk/client-ssm'
import EnvSsm from '../src/env-ssm'
import { DescribeParametersResult, GetParametersByPathResult, GetParametersResult } from '@aws-sdk/client-ssm'
import {
  ENV_SSM_DOTENV_KEY,
  ENV_SSM_PATH_DELIMITER_KEY,
  ENV_SSM_PATHS_KEY,
  ENV_SSM_PROCESS_ENV_KEY,
  ENV_SSM_TFVAR_KEY,
  resolveDotEnv,
  resolvePathDelimiter,
  resolvePaths, resolveProcessEnv,
  resolveTfVar
} from '../src/loaders'

const ssm = new SSMClient({ region: 'us-west-2' })

const originalProcessEnv = process.env

beforeEach(() => {
  ssm.send.mockClear()
  process.env = originalProcessEnv
})

test('process.env variables overwrite tfvar', async () => {
  const path = '/app/stg/db'
  const name = 'password'
  const output = {
    Parameters: []
  }
  ssm.send.mockResolvedValueOnce(output)
  process.env = { PASSWORD: 'process-secret' }
  const env = await EnvSsm({ paths: path, dotenv: false })
  expect(env.get(name.toUpperCase()).asString()).toEqual('process-secret')
})

test('tfvar overwrite .env variables', async () => {
  const path = '/app/stg/db'
  const name = 'password'
  const output = {
    Parameters: []
  }
  ssm.send.mockResolvedValueOnce(output)
  const env = await EnvSsm({
    paths: path,
    dotenv: 'test/static/test.env',
    tfvar: 'test/static/test.tfvars',
    processEnv: false
  })
  expect(env.get(name.toUpperCase()).asString()).toEqual('tfvars-secret')
})

test('.env variables overwrite ssm parameters', async () => {
  const path = '/app/stg/db'
  const name = 'password'
  const Name = `${path}/${name}`
  const Value = 'ch@ng3m3'
  const output = {
    Parameters: [{ Name, Value }]
  }
  ssm.send.mockResolvedValueOnce(output)
  const env = await EnvSsm({ paths: path, dotenv: 'test/static/test.env', processEnv: false })
  expect(env.get(name.toUpperCase()).asString()).toEqual('env-secret')
})

test('returns an empty object when no parameters are found for a given path', async () => {
  ssm.send.mockResolvedValueOnce({})
  const paths = '/some/path'
  const env = await EnvSsm({ paths, processEnv: false })
  expect(env.get()).toEqual({})
})

test('return ssm variables as json objects when parameter names include `/`', async () => {
  const path = '/app/stg'
  const name = 'db/password'
  const Name = `${path}/${name}`
  const Value = 'ch@ng3m3'
  const output = {
    Parameters: [{ Name, Value }]
  }
  ssm.send.mockResolvedValueOnce(output)
  const env = await EnvSsm({ paths: path, processEnv: false, dotenv: false })
  expect(env.get('db').asJsonObject()).toEqual({ password: Value })
})

test('can load parameters with different delimiters', async () => {
  const periodDelimited = { path: 'app.delimiter', delimiter: '.' }
  const dashDelimited = { path: 'app-delimiter', delimiter: '-' }

  const describePeriodParametersResponse = {
    Parameters: [
      { Name: `${periodDelimited.path}${periodDelimited.delimiter}period` }
    ]
  }
  const describeSlashParametersResponse = {
    Parameters: [
      { Name: `${dashDelimited.path}${dashDelimited.delimiter}dash` }
    ]
  }
  const fetchPeriodParametersByNameResponse = {
    Parameters: [
      { Name: `${periodDelimited.path}${periodDelimited.delimiter}period`, Value: periodDelimited.delimiter }
    ]
  }
  const fetchSlashParametersByNameResponse = {
    Parameters: [
      { Name: `${dashDelimited.path}${dashDelimited.delimiter}dash`, Value: dashDelimited.delimiter }
    ]
  }

  ssm.send.mockResolvedValueOnce(describePeriodParametersResponse)
  ssm.send.mockResolvedValueOnce(describeSlashParametersResponse)

  ssm.send.mockResolvedValueOnce(fetchPeriodParametersByNameResponse)
  ssm.send.mockResolvedValueOnce(fetchSlashParametersByNameResponse)

  const env = await EnvSsm({
    paths: [periodDelimited, dashDelimited],
    processEnv: false,
    dotenv: false
  })
  const period = env.get('period').asString()
  const dash = env.get('dash').asString()

  expect(period).toEqual(periodDelimited.delimiter)
  expect(dash).toEqual(dashDelimited.delimiter)
  expect(ssm.send).toBeCalledTimes(4)
})

test('recursively collects all parameters if the NextToken parameter is returned by AWS', async () => {
  const slashPath = '/app/stg'
  const slashName = 'db/password'
  const periodPath = 'app.stg'
  const periodName = 'db.username'

  const username = 'admin'
  const password = 'ch@ng3m3'

  const getParametersByPathResult: GetParametersByPathResult = {
    Parameters: [{
      Name: `${slashPath}/${slashName}`,
      Value: password
    }],
    NextToken: 'fakeToken'
  }
  const getParametersByPathResult1: GetParametersByPathResult = { Parameters: [] }

  const describeParametersResult: DescribeParametersResult = {
    Parameters: [{ Name: `${periodPath}.${periodName}` }],
    NextToken: 'fakeToken'
  }
  const describeParametersResult1: DescribeParametersResult = { Parameters: [] }
  const getParametersResult: GetParametersResult = {
    Parameters: [{
      Name: `${periodPath}.${periodName}`,
      Value: username
    }]
  }

  ssm.send.mockResolvedValueOnce(getParametersByPathResult)
  ssm.send.mockResolvedValueOnce(describeParametersResult)

  ssm.send.mockResolvedValueOnce(getParametersByPathResult1)
  ssm.send.mockResolvedValueOnce(describeParametersResult1)

  ssm.send.mockResolvedValueOnce(getParametersResult)

  const env = await EnvSsm({
    paths: [{ path: slashPath }, { path: periodPath, delimiter: '.' }],
    processEnv: false,
    dotenv: false
  })
  expect(env.get('db').asJsonObject()).toEqual({ password, username })
  expect(ssm.send).toBeCalledTimes(5)
})

test('use custom ssm client', async () => {
  const path = '/some/path'
  ssm.send.mockResolvedValueOnce({})
  await EnvSsm({ paths: path, ssm, processEnv: false })
  expect(ssm.send).toBeCalled()
})

// TODO - Silence only some AWS errors and allow others to propagate
test('silence AWS errors', async () => {
  const paths = ['/some/path', { path: 'some.path', delimiter: '.' }, { path: 'another.path', delimiter: '.' }]

  // mock error GetParametersByPath (first path)
  ssm.send.mockRejectedValueOnce(Error('Fake Error'))

  // mock DescribeParameters, then mock error GetParameters (second path)
  ssm.send.mockResolvedValueOnce({ Parameters: [{ Name: 'some.path.fake' }] })
  ssm.send.mockRejectedValueOnce(Error('Fake Error')) // Testing rejections in GetParameters

  // mock error DescribeParameters (third path)
  ssm.send.mockRejectedValueOnce(Error('Fake Error'))

  const env = await EnvSsm({ paths, processEnv: false, dotenv: false })
  expect(env.get()).toEqual({})
  expect(ssm.send).toBeCalledTimes(4)
})

test('silence errors when .env file is not found', async () => {
  const readFileSync = fs.readFileSync
  jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw { message: '', code: 'ENOENT' }
  })
  const path = '/some/path'
  const output = {
    Parameters: []
  }
  ssm.send.mockResolvedValueOnce(output)
  const env = await EnvSsm({ paths: path, processEnv: false, dotenv: 'missing.env' })
  await expect(env.get()).toEqual({})
  fs.readFileSync = readFileSync
})

test('silence errors when .tfvars file is not found', async () => {
  const readFileSync = fs.readFileSync
  jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw { message: '', code: 'ENOENT' }
  })
  const path = '/some/path'
  const output = {
    Parameters: []
  }
  ssm.send.mockResolvedValueOnce(output)
  const env = await EnvSsm({ paths: path, processEnv: false, dotenv: false, tfvar: 'missing.tfvars' })
  await expect(env.get()).toEqual({})
  fs.readFileSync = readFileSync
})

test('throws unexpected errors for .env files', async () => {
  const readFileSync = fs.readFileSync
  jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
    throw Error('FakeError')
  })
  const path = '/some/path'
  const output = {
    Parameters: []
  }
  ssm.send.mockResolvedValueOnce(output)
  await expect(async () => await EnvSsm({
    paths: path,
    processEnv: false,
    dotenv: 'missing.env'
  })).rejects.toThrow('FakeError')
  fs.readFileSync = readFileSync
})

test('throws unexpected errors for .tfvars files', async () => {
  const readFileSync = fs.readFileSync
  jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
    throw Error('FakeError')
  })
  const path = '/some/path'
  const output = {
    Parameters: []
  }
  ssm.send.mockResolvedValueOnce(output)
  await expect(async () => await EnvSsm({
    paths: path,
    processEnv: false,
    tfvar: 'missing.tfvars'
  })).rejects.toThrow('FakeError')
  fs.readFileSync = readFileSync
})

test('pass in false for ssm to disable calls to ssm', async () => {
  const env = await EnvSsm({ ssm: false, processEnv: false })
  expect(env.get()).toEqual({})
})

describe('Using ENV_SSM_*', () => {
  test('use ENV_SSM_PATHS to resolve option as comma-seperated list of strings', () => {
    process.env[ENV_SSM_PATHS_KEY] = 'app.dev,app.prd'
    const option = resolvePaths({}, '.')
    expect(option).toEqual([{ delimiter: '.', path: 'app.dev' }, { delimiter: '.', path: 'app.prd' }])
  })

  test('use ENV_SSM_PATHS to resolve option as JSON Array', () => {
    process.env[ENV_SSM_PATHS_KEY] = '[{ "path":"app.dev", "delimiter":"." },{ "path":"/app/prd" }]'
    const arrOption = resolvePaths({}, '.')
    expect(arrOption).toEqual([{ delimiter: '.', path: 'app.dev' }, { delimiter: '/', path: '/app/prd' }])
  })

  test('use ENV_SSM_PATHS to resolve option as JSON Object', () => {
    process.env[ENV_SSM_PATHS_KEY] = '{ "path":"/app/prd" }'
    const objOptions = resolvePaths({}, '.')
    expect(objOptions).toEqual([{ delimiter: '/', path: '/app/prd' }])
  })

  test('using ENV_SSM_PATHS without PathSsmLike throws error', () => {
    process.env[ENV_SSM_PATHS_KEY] = '{ "paths":"/app/prd" }' // Not PathSsmLike
    expect(() => resolvePaths({}, '.')).toThrow(/^Input must be PathSsmLike/)
  })

  test('use ENV_SSM_PATH_DELIMITER to resolve option', () => {
    process.env[ENV_SSM_PATH_DELIMITER_KEY] = '.'
    const option = resolvePathDelimiter({})
    expect(option).toEqual('.')
  })

  test('use ENV_SSM_TFVAR to resolve option', () => {
    process.env[ENV_SSM_TFVAR_KEY] = 'test/static/test.tfvars'
    const option = resolveTfVar({})
    expect(option).toContain('test/static/test.tfvars')
  })

  test('use ENV_SSM_DOTENV to resolve option', () => {
    process.env[ENV_SSM_DOTENV_KEY] = 'test/static/test.env'
    const option = resolveDotEnv({})
    expect(option).toContain('test/static/test.env')
  })

  test('use ENV_SSM_PROCESS_ENV to resolve option', () => {
    process.env[ENV_SSM_PROCESS_ENV_KEY] = 'false'
    const option = resolveProcessEnv({})
    expect(option).toEqual(false)
  })
})

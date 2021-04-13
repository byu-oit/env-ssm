import fs from 'fs'
import { SSMClient } from './__mocks__/@aws-sdk/client-ssm'
import EnvSsm from '../src/env-ssm'
import { GetParametersByPathResult } from '@aws-sdk/client-ssm'

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
  const env = await EnvSsm({ paths: path, dotenv: 'test/static/test.env', tfvar: 'test/static/test.tfvars', processEnv: false })
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

test('recursively collects all parameters if the NextToken parameter is returned by AWS', async () => {
  const path = '/app/stg'
  const name = 'db/password'
  const Name = `${path}/${name}`
  const Value = 'ch@ng3m3'
  const first: GetParametersByPathResult = { Parameters: [{ Name, Value }], NextToken: 'fakeToken' }
  const second: GetParametersByPathResult = { Parameters: [] }
  ssm.send.mockResolvedValueOnce(first)
  ssm.send.mockResolvedValueOnce(second)
  const env = await EnvSsm({ paths: path, processEnv: false, dotenv: false })
  expect(env.get('db').asJsonObject()).toEqual({ password: Value })
  expect(ssm.send).toBeCalledTimes(2)
})

test('use custom ssm client', async () => {
  const path = '/some/path'
  ssm.send.mockResolvedValueOnce({})
  await EnvSsm({ paths: path, ssm, processEnv: false })
  expect(ssm.send).toBeCalled()
})

// TODO - Silence only some AWS errors and allow others to propagate
test('silence AWS errors', async () => {
  const path = '/some/path'
  ssm.send.mockRejectedValueOnce(Error('Fake Error'))
  const env = await EnvSsm({ paths: path, processEnv: false, dotenv: false })
  await expect(env.get()).toEqual({})
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
  await expect(async () => await EnvSsm({ paths: path, processEnv: false, dotenv: 'missing.env' })).rejects.toThrow('FakeError')
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
  await expect(async () => await EnvSsm({ paths: path, processEnv: false, tfvar: 'missing.tfvars' })).rejects.toThrow('FakeError')
  fs.readFileSync = readFileSync
})

import fs from 'node:fs'
import assert from 'node:assert'
import test, { describe, beforeEach } from 'node:test'
import * as mock from './__mocks__/@aws-sdk/client-ssm'
import EnvSsm from '../src/env-ssm.js'
import { DescribeParametersResult, GetParametersByPathResult, GetParametersResult, type SSMClient } from '@aws-sdk/client-ssm'
import {
  ENV_SSM_DOTENV_KEY,
  ENV_SSM_PATH_DELIMITER_KEY,
  ENV_SSM_PATHS_KEY,
  ENV_SSM_PROCESS_ENV_KEY,
  resolveDotEnv,
  resolvePathDelimiter,
  resolvePaths,
  resolveProcessEnv
} from '../src/loaders/index.js'

const ssm = new mock.SSMClient({ region: 'us-west-2' })
const originalProcessEnv = process.env

beforeEach(() => {
  // Reset the Sinon stub call history.
  ssm.send.resetHistory()
  process.env = originalProcessEnv
})

void test('.env variables overwrite ssm parameters', async () => {
  const pathValue = '/app/stg/db'
  const name = 'password'
  const Name = `${pathValue}/${name}`
  const Value = 'ch@ng3m3'
  const output = {
    Parameters: [{ Name, Value }]
  }

  // Set the first call to resolve with the output.
  ssm.send.onCall(0).resolves(output)
  const env = await EnvSsm({ paths: pathValue, ssm: ssm as unknown as SSMClient, dotenv: 'test/static/test.env', processEnv: false })
  assert.strictEqual(env.get(name.toUpperCase()).asString(), 'env-secret')
})

void test('returns an empty object when no parameters are found for a given path', async () => {
  ssm.send.onCall(0).resolves({})
  const paths = '/some/path'
  const env = await EnvSsm({ paths, processEnv: false })
  assert.deepStrictEqual(env.source, {})
})

void test('return ssm variables as json objects when parameter names include `/`', async () => {
  const pathValue = '/app/stg'
  const name = 'db/password'
  const Name = `${pathValue}/${name}`
  const Value = 'ch@ng3m3'
  const output = {
    Parameters: [{ Name, Value }]
  }

  ssm.send.onCall(0).resolves(output)
  const env = await EnvSsm({ paths: pathValue, ssm: ssm as unknown as SSMClient, processEnv: false, dotenv: false })
  assert.deepStrictEqual(env.get('db').asJsonObject(), { password: Value })
})

void test('can load parameters with different delimiters', async () => {
  const periodDelimited = { path: 'app.delimiter', delimiter: '.' }
  const dashDelimited = { path: 'app-delimiter', delimiter: '-' }

  const describePeriodParametersResponse = {
    Parameters: [{ Name: `${periodDelimited.path}${periodDelimited.delimiter}period` }]
  }
  const describeSlashParametersResponse = {
    Parameters: [{ Name: `${dashDelimited.path}${dashDelimited.delimiter}dash` }]
  }
  const fetchPeriodParametersByNameResponse = {
    Parameters: [{ Name: `${periodDelimited.path}${periodDelimited.delimiter}period`, Value: periodDelimited.delimiter }]
  }
  const fetchSlashParametersByNameResponse = {
    Parameters: [{ Name: `${dashDelimited.path}${dashDelimited.delimiter}dash`, Value: dashDelimited.delimiter }]
  }

  ssm.send.onCall(0).resolves(describePeriodParametersResponse)
  ssm.send.onCall(1).resolves(describeSlashParametersResponse)
  ssm.send.onCall(2).resolves(fetchPeriodParametersByNameResponse)
  ssm.send.onCall(3).resolves(fetchSlashParametersByNameResponse)

  const env = await EnvSsm({
    paths: [periodDelimited, dashDelimited],
    ssm: ssm as unknown as SSMClient,
    processEnv: false,
    dotenv: false
  })
  const period = env.get('period').asString()
  const dash = env.get('dash').asString()

  assert.strictEqual(period, periodDelimited.delimiter)
  assert.strictEqual(dash, dashDelimited.delimiter)
  assert.strictEqual(ssm.send.callCount, 4)
})

void test('recursively collects all parameters if the NextToken parameter is returned by AWS', async () => {
  const slashPath = '/app/stg'
  const slashName = 'db/password'
  const periodPath = 'app.stg'
  const periodName = 'db.username'

  const username = 'admin'
  const password = 'ch@ng3m3'

  const getParametersByPathResult: GetParametersByPathResult = {
    Parameters: [{ Name: `${slashPath}/${slashName}`, Value: password }],
    NextToken: 'fakeToken'
  }
  const getParametersByPathResult1: GetParametersByPathResult = { Parameters: [] }

  const describeParametersResult: DescribeParametersResult = {
    Parameters: [{ Name: `${periodPath}.${periodName}` }],
    NextToken: 'fakeToken'
  }
  const describeParametersResult1: DescribeParametersResult = { Parameters: [] }
  const getParametersResult: GetParametersResult = {
    Parameters: [{ Name: `${periodPath}.${periodName}`, Value: username }]
  }

  ssm.send.onCall(0).resolves(getParametersByPathResult)
  ssm.send.onCall(1).resolves(describeParametersResult)
  ssm.send.onCall(2).resolves(getParametersByPathResult1)
  ssm.send.onCall(3).resolves(describeParametersResult1)
  ssm.send.onCall(4).resolves(getParametersResult)

  const env = await EnvSsm({
    paths: [{ path: slashPath }, { path: periodPath, delimiter: '.' }],
    ssm: ssm as unknown as SSMClient,
    processEnv: false,
    dotenv: false
  })
  assert.deepStrictEqual(env.get('db').asJsonObject(), { password, username })
  assert.strictEqual(ssm.send.callCount, 5)
})

void test('use custom ssm client', async () => {
  const pathValue = '/some/path'
  ssm.send.onCall(0).resolves({})
  await EnvSsm({ paths: pathValue, ssm: ssm as unknown as SSMClient, processEnv: false })
  assert.ok(ssm.send.callCount > 0)
})

void test('silence AWS errors', async () => {
  const paths = ['/some/path', { path: 'some.path', delimiter: '.' }, { path: 'another.path', delimiter: '.' }]

  ssm.send.onCall(0).rejects(new Error('Fake Error'))
  ssm.send.onCall(1).resolves({ Parameters: [{ Name: 'some.path.fake' }] })
  ssm.send.onCall(2).rejects(new Error('Fake Error'))
  ssm.send.onCall(3).rejects(new Error('Fake Error'))

  const env = await EnvSsm({ paths, ssm: ssm as unknown as SSMClient, processEnv: false, dotenv: false })
  assert.deepStrictEqual(env.source, {})
  assert.strictEqual(ssm.send.callCount, 4)
})

void test('silence errors when .env file is not found', async () => {
  const originalReadFileSync = fs.readFileSync
  const pathValue = '/some/path'
  const output = { Parameters: [] }

  ssm.send.onCall(0).resolves(output)
  const env = await EnvSsm({ paths: pathValue, ssm: ssm as unknown as SSMClient, processEnv: false, dotenv: 'missing.env' })
  assert.deepStrictEqual(env.source, {})
  fs.readFileSync = originalReadFileSync
})

void test('throws unexpected errors for .env files', async () => {
  const originalReadFileSync = fs.readFileSync
  fs.readFileSync = () => {
    throw new Error('FakeError')
  }
  const pathValue = '/some/path'
  const output = { Parameters: [] }

  ssm.send.onCall(0).resolves(output)
  await assert.rejects(
    async () => {
      await EnvSsm({ paths: pathValue, ssm: ssm as unknown as SSMClient, processEnv: false, dotenv: 'missing.env' })
    },
    /FakeError/
  )
  fs.readFileSync = originalReadFileSync
})

void test('pass in false for ssm to disable calls to ssm', async () => {
  const env = await EnvSsm({ ssm: false, processEnv: false })
  assert.deepStrictEqual(env.source, {})
})

void describe('Using ENV_SSM_*', () => {
  void test('use ENV_SSM_PATHS to resolve option as comma-seperated list of strings', () => {
    process.env[ENV_SSM_PATHS_KEY] = 'app.dev,app.prd'
    const option = resolvePaths({}, '.')
    assert.deepEqual(option, [
      { delimiter: '.', path: 'app.dev' },
      { delimiter: '.', path: 'app.prd' }
    ])
  })

  void test('use ENV_SSM_PATHS to resolve option as JSON Array', () => {
    process.env[ENV_SSM_PATHS_KEY] = '[{ "path":"app.dev", "delimiter":"." },{ "path":"/app/prd" }]'
    const arrOption = resolvePaths({}, '.')
    assert.deepEqual(arrOption, [
      { delimiter: '.', path: 'app.dev' },
      { delimiter: '/', path: '/app/prd' }
    ])
  })

  void test('use ENV_SSM_PATHS to resolve option as JSON Object', () => {
    process.env[ENV_SSM_PATHS_KEY] = '{ "path":"/app/prd" }'
    const objOptions = resolvePaths({}, '.')
    assert.deepEqual(objOptions, [{ delimiter: '/', path: '/app/prd' }])
  })

  void test('using ENV_SSM_PATHS without PathSsmLike throws error', () => {
    process.env[ENV_SSM_PATHS_KEY] = '{ "paths":"/app/prd" }'
    assert.throws(() => resolvePaths({}, '.'), /Input must be PathSsmLike/)
  })

  void test('use ENV_SSM_PATH_DELIMITER to resolve option', () => {
    process.env[ENV_SSM_PATH_DELIMITER_KEY] = '.'
    const option = resolvePathDelimiter({})
    assert.strictEqual(option, '.')
  })

  void test('use ENV_SSM_DOTENV to resolve option', () => {
    process.env[ENV_SSM_DOTENV_KEY] = 'test/static/test.env'
    const option = resolveDotEnv({})
    assert.ok(option, 'Expected dotenv option to resolve')
    assert.ok(option.includes('test/static/test.env'))
  })

  void test('use ENV_SSM_PROCESS_ENV to resolve option', () => {
    process.env[ENV_SSM_PROCESS_ENV_KEY] = 'false'
    const option = resolveProcessEnv({})
    assert.strictEqual(option, false)
  })
})

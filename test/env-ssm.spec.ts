import { SSMClient } from './__mocks__/@aws-sdk/client-ssm'
import EnvSsm from '../src/env-ssm'

const ssm = new SSMClient({ region: 'us-west-2' })

test('returns an empty object when no parameters are found for a given path', async () => {
  ssm.send.mockResolvedValueOnce({})
  const paths = '/some/path'
  const env = await EnvSsm({ paths, processEnv: false })
  expect(env.get()).toEqual({})
})

test('return environment variables without the path prefix by default', async () => {
  const path = '/some/path'
  const params = ['0', '1']
  const output = {
    $metadata: {},
    Parameters: params.map(name => ({
      Name: `${path}/${name}`,
      Value: name
    }))
  }
  ssm.send.mockResolvedValueOnce(output)
  const env = await EnvSsm(path)
  expect(env.get(params[0]).asInt()).toEqual(0)
  expect(env.get(params[1]).asInt()).toEqual(1)
})

test('return environment variables with the path prefix', async () => {
  const path = '/some/path'
  const params = ['0', '1']
  const output = {
    $metadata: {},
    Parameters: params.map(name => ({
      Name: `${path}/${name}`,
      Value: name
    }))
  }
  ssm.send.mockResolvedValueOnce(output)
  const env = await EnvSsm({ paths: path, trim: false, processEnv: false, tfvars: false })
  expect(env.get(`${path}/${params[0]}`).asInt()).toEqual(0)
  expect(env.get(`${path}/${params[1]}`).asInt()).toEqual(1)
})

test('return environment variables with a trimmed path prefix', async () => {
  const path = '/some/path'
  const trim = '/some'
  const trimmed = 'path'
  const params = ['0', '1']
  const output = {
    $metadata: {},
    Parameters: params.map(name => ({
      Name: `${path}/${name}`,
      Value: name
    }))
  }
  ssm.send.mockResolvedValueOnce(output)
  const env = await EnvSsm({ paths: [{ path, trim }], processEnv: false, tfvars: false })
  expect(env.get(`${trimmed}/${params[0]}`).asInt()).toEqual(0)
  expect(env.get(`${trimmed}/${params[1]}`).asInt()).toEqual(1)
})

test('ssm variables overwrite local variables by default', async () => {
  const path = '/some/path'
  const params = ['0', '1']
  const output = {
    $metadata: {},
    Parameters: params.map(name => ({
      Name: `${path}/${name}`,
      Value: name
    }))
  }
  ssm.send.mockResolvedValueOnce(output)
  process.env = { [params[1]]: '-1' }
  const env = await EnvSsm({ paths: [{ path }], tfvars: false })
  expect(env.get(params[0]).asInt()).toEqual(0)
  expect(env.get(params[1]).asInt()).toEqual(1)
})

test('ssm variables overwrite local tfvars by default', async () => {
  const path = '/some/path'
  const params = ['zero', 'one']
  const output = {
    $metadata: {},
    Parameters: [{
      Name: `${path}/${[params[1]]}`,
      Value: params[1]
    }]
  }
  ssm.send.mockResolvedValueOnce(output)
  process.env = { [params[1]]: params[1] }
  const env = await EnvSsm({ paths: [{ path }], tfvars: './test/static/test.tfvars' })
  expect(env.get(params[0]).asString()).toEqual('value-zero')
  expect(env.get(params[1]).asString()).toEqual('one')
})

test('use custom ssm client', async () => {
  const path = '/some/path'
  ssm.send.mockResolvedValueOnce({})
  await EnvSsm({ paths: path, ssm, processEnv: false, tfvars: false })
  expect(ssm.send).toBeCalled()
})

// TODO - Silence only some AWS errors and allow others to propagate
test('silence AWS errors', async () => {
  const path = '/some/path'
  ssm.send.mockRejectedValueOnce(Error('Fake Error'))
  const env = await EnvSsm({ paths: path, processEnv: false, tfvars: false })
  await expect(env.get()).toEqual({})
})

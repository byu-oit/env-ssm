import {SSMClient, GetParametersByPathCommandOutput} from '@aws-sdk/client-ssm'
import {from} from 'env-var'
import EnvSsm from '../src/env-ssm'

/**
 * Using Object.assign to get correct typings while mocking the send function.
 * Javascript equivalent:
 * let ssm = new SSMClient({region: 'us-west-2'})
 * ssm.send = jest.fn()
 */
let ssm = Object.assign(
    new SSMClient({region: 'us-west-2'}),
    {
        send: jest.fn()
    }
)

afterEach(() => {
    ssm.send.mockReset()
})

test('returns an empty object when no parameters are found for a given path', async () => {
    ssm.send.mockResolvedValueOnce({})
    const envSsm = await EnvSsm.fetch(ssm, '/some/path')
    expect(from(envSsm).get()).toEqual({})
})

test('return an object of parameters without the path prefix', async () => {
    const path = '/some/path'
    const params = ['0', '1']
    const output: GetParametersByPathCommandOutput = {
        $metadata: {},
        Parameters: params.map(name => ({
            Name: `${path}/${name}`,
            Value: name
        }))
    }
    ssm.send.mockResolvedValueOnce(output)
    const env = from(await EnvSsm.fetch(ssm, path))
    expect(env.get(params[0]).asInt()).toEqual(0)
    expect(env.get(params[1]).asInt()).toEqual(1)
})

test('return an object of parameters with the path prefix', async () => {
    const path = '/some/path'
    const params = ['0', '1']
    const output: GetParametersByPathCommandOutput = {
        $metadata: {},
        Parameters: params.map(name => ({
            Name: `${path}/${name}`,
            Value: name
        }))
    }
    ssm.send.mockResolvedValueOnce(output)
    const env = from(await EnvSsm.fetch(ssm, path, {trim: false}))
    expect(env.get(`${path}/${params[0]}`).asInt()).toEqual(0)
    expect(env.get(`${path}/${params[1]}`).asInt()).toEqual(1)
})

test('return an object of parameters with a trimmed path prefix', async () => {
    const path = '/some/path'
    const trim = '/some'
    const params = ['0', '1']
    const output: GetParametersByPathCommandOutput = {
        $metadata: {},
        Parameters: params.map(name => ({
            Name: `${path}/${name}`,
            Value: name
        }))
    }
    ssm.send.mockResolvedValueOnce(output)
    const env = from(await EnvSsm.fetch(ssm, path, {trim}))
    expect(env.get(`${path.replace(trim + '/', '')}/${params[0]}`).asInt()).toEqual(0)
    expect(env.get(`${path.replace(trim + '/', '')}/${params[1]}`).asInt()).toEqual(1)
})

test('propagates AWS errors', async () => {
    ssm.send.mockRejectedValueOnce(Error('Fake Error'))
    await expect(() => EnvSsm.fetch(ssm, '/some/path')).rejects.toThrow()
})
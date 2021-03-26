export { GetParametersByPathCommand } from '@aws-sdk/client-ssm'
export const mockSend = jest.fn()
export const SSMClient = jest.fn().mockImplementation(() => {
  return { send: mockSend }
})

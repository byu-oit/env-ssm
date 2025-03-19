import sinon from 'sinon'
import {
  DescribeParametersCommand,
  GetParametersByPathCommand,
  GetParametersCommand
} from '@aws-sdk/client-ssm'

// Create a stub for the 'send' method.
export const mockSend = sinon.stub()

// A simple SSMClient mock that uses our sinon stub.
export class SSMClient {
  public send = mockSend
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor (options: { region: string }) {
    // You can optionally store or use the options if needed.
  }
}

// Re-export the AWS SSM commands.
export { DescribeParametersCommand, GetParametersByPathCommand, GetParametersCommand }

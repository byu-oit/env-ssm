# ENV SSM

Gets params from your environment first, then from the ssm parameter
store.

## Options

| Option     | Type                                                                                              | Description                                                                                                                                                                                                                 | Default      |
|:-----------|:--------------------------------------------------------------------------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:-------------|
| ssm        | [SSMClient](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-ssm/index.html) | An AWS SSM client instance. The [default SSM client can be configured with environment variables](https://docs.aws.amazon.com/sdk-for-java/v1/developer-guide/setup-credentials.html) or a custom instance may be provided. | SSMClient    |
| paths      | string \| [Path](#path-type) \| Array<string \| [Path](#path-type)>                               | The prefix to attach to the beginning of the parameter name. Can also be the key of an environment variable whose value will be the prefix.                                                                                 | **Required** |
| trim       | boolean                                                                                           | If true, the path provided will be trimmed from the parameter name. Paths that specify a trim will ignore the global trim setting.                                                                                          | true         |
| processEnv | boolean                                                                                           | If true, the process.env object will be the base for storing parameters retrieved from the parameter store.                                                                                                                 | true         |
| tfvars     | string \| boolean                                                                                 | Adds local tfvars variables to the environment. These will overwrite anything already in process.env and will be overwritten by retrieved SSM parameters.                                                                   | true         |


### Path Type

| Option | Type   | Description                                                                                        | Default      |
|:-------|:-------|:---------------------------------------------------------------------------------------------------|:-------------|
| path   | string | The path to search in AWS SSM                                                                      | **Required** |
| trim   | string | The part of the path to trim off. By default, the path provided is removed from the parameter name | path         |

# env-ssm

Load environment from SSM Parameter Store.

Variables load (and are overwritten if duplicates are found) in the following order:

1. Load `SSM`
2. Load `.env` file
3. Load `.tfvars` file
4. Load `process.env`

## Options

| Option     | Type                                                                                              | Description                                                                                                                                                                                                                 | Default                   |
|:-----------|:--------------------------------------------------------------------------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:--------------------------|
| ssm        | [SSMClient](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-ssm/index.html) | An AWS SSM client instance. The [default SSM client can be configured with environment variables](https://docs.aws.amazon.com/sdk-for-java/v1/developer-guide/setup-credentials.html) or a custom instance may be provided. | SSMClient                 |
| paths      | string \| string[]                                                                                | The prefix to attach to the beginning of the parameter name. Can also be the key of an environment variable whose value will be the prefix.                                                                                 | **Required**              |
| processEnv | boolean                                                                                           | If true, the process.env object will be the base for storing parameters retrieved from the parameter store.                                                                                                                 | true                      |
| tfvars     | string                                                                                            | Adds local tfvars variables to the environment. These will overwrite anything already in process.env and will be overwritten by retrieved SSM parameters.                                                                   | false                     |
| dotenv     | boolean \| string                                                                                 | Adds local .env variables to the environment.                                                                                                                                                                               | `process.cwd() + '/.env'` |

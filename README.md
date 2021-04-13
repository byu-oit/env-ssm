# env-ssm

Load environment from SSM Parameter Store.

## Install

This package has a peer dependency to `env-var`. To install, use the following command:

`npm install @byu-oit/env-ssm env-var`

If specifying a tfvars file, please install @byu-oit/dottfvars:
`npm install @byu-oit/dottfvars`

If specifying a dotenv file, please install dotenv:
`npm install dotenv`

For convenience installing them all:
`npm install @byu-oit/env env-var @byu-oit/dottfvars dotenv`

## Options

| Option     | Type                                                                                              | Description                                                                                                                                                                                                                      | Default                   |
|:-----------|:--------------------------------------------------------------------------------------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:--------------------------|
| ssm        | [SSMClient](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-ssm/index.html) | An AWS SSM client instance. The [default SSM client can be configured with environment variables](https://docs.aws.amazon.com/sdk-for-java/v1/developer-guide/setup-credentials.html) or a custom instance may be provided.      | SSMClient                 |
| paths      | string \| string[]                                                                                | The SSM parameter store path to use. All parameters that fall under this path will be returned as properties in the environment variables object. Parameters with multiple nested children will be returned as stringified JSON. | **Required**              |
| processEnv | boolean                                                                                           | If true, it will add process.env variables to the container.                                                                                                                                                                     | true                      |
| tfvars     | string                                                                                            | Adds local tfvars variables to the environment. Must be the exact path to the tfvars file relative to the project or package root.                                                                                               | false                     |
| dotenv     | boolean \| string                                                                                 | Adds local .env variables to the environment. Can be false, which disables `.env` support. May also be the exact path to the .env file relative to the project or package root.                                                  | `process.cwd() + '/.env'` |
| maxResults | number                                                                                            | Max number of SSM parameters to fetch.                                                                                                                                                                                           | 100                       |

## Usage

Variables load (and are overwritten if duplicates are found) in the
following order:

1. Load `SSM`
2. Load `.env` file
3. Load `.tfvars` file
4. Load `process.env`

Simple example:

SSM Path: `/my/app` SSM Parameters:
- /my/app/db/user => `admin`
- /my/app/db/pass => `ch@ng3m3`
- /my/app/host => `example.com`

```ts
import EnvSsm from 'env-ssm'

/**
 * @returns {db: {user: 'admin', pass: 'ch@ng3m3'}, host: 'example.com'}
 */
async function getParams() {
    const env = await EnvSsm(path)
    const db = env.get('db').required().asJsonObject()
    const host = env.get('api').required().asString()
    return { db, host }
}
```

Local development example:

For the given tfvars, .env, and ssm path:

SSM Path: `/my/app` SSM Parameters:
- /my/app/db/user => `admin`

```hcl-terraform
# local.tfvars file located in current working directory
db = {
  user = 'user'
  pass = 'ch@ng3m3'
}
host = 'JohnDoe.com'
```

```dotenv
# .env file located in current working directory
host='example.com'
```

```ts
/**
 * @returns {db: {user: 'user', pass: 'ch@ng3m3'}, host: 'JohnDoe.com'}
 */
async function getParams() {
    const env = await EnvSsm({
        // Allows multiple paths
        paths: [path],
        
        // Specify file name relative to process.cwd()
        tfvars: 'local.tfvars',
        
        // By default, checks process.cwd() + '/.env' or else specify a file name relative to process.cwd()
        // dotenv: .env
    })
    const db = env.get('db').required().asJsonObject()
    const host = env.get('api').required().asString()
    return { db, host }
}
```


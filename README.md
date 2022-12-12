[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
![ npm ](https://img.shields.io/npm/v/@byu-oit/env-ssm)

# env-ssm

Load environment from SSM Parameter Store.

## Install

This package has a peer dependency to `env-var` and `@aws-sdk/client-ssm`. To install, use the following command:

`npm install @byu-oit/env-ssm @aws-sdk/client-ssm env-var`

If specifying a tfvars file, please install @byu-oit/dottfvars: `npm install @byu-oit/dottfvars`

If specifying a dotenv file, please install dotenv: `npm install dotenv`

For convenience installing them all: `npm install @byu-oit/env @aws-sdk/client-ssm env-var @byu-oit/dottfvars dotenv`

## Options

| Option        | Type                                                                                              | Description                                                                                                                                                                                                                      | Default                   |
|:--------------|:--------------------------------------------------------------------------------------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:--------------------------|
| ssm           | [SSMClient](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-ssm/index.html) | An AWS SSM client instance. The [default SSM client can be configured with environment variables](https://docs.aws.amazon.com/sdk-for-java/v1/developer-guide/setup-credentials.html) or a custom instance may be provided.      | SSMClient                 |
| paths         | [PathSsmLike](./src/path-ssm.ts) OR [PathSsmLike](./src/path-ssm.ts)[]                            | The SSM parameter store path to use. All parameters that fall under this path will be returned as properties in the environment variables object. Parameters with multiple nested children will be returned as stringified JSON. | []                        |
| pathDelimiter | string                                                                                            | Specify a path delimiter.                                                                                                                                                                                                        | `/`                       |
| processEnv    | boolean                                                                                           | If true, it will add process.env variables to the container.                                                                                                                                                                     | true                      |
| tfvars        | string                                                                                            | Adds local tfvars variables to the environment. Must be the exact path to the tfvars file relative to the project or package root.                                                                                               | false                     |
| dotenv        | boolean OR string                                                                                 | Adds local .env variables to the environment. Can be false, which disables `.env` support. May also be the exact path to the .env file relative to the project or package root.                                                  | `process.cwd() + '/.env'` |

> ProTip: Use environment variables to the following options:
> - **ENV_SSM_PATHS**
> - **ENV_SSM_PATH_DELIMITER**
> - **ENV_SSM_PROCESS_ENV**
> - **ENV_SSM_TFVARS**
> - **ENV_SSM_DOTENV**
>
> NOTE: All the options are cast from string to the type listed in the table above. When using ENV_SSM_PATHS, a
> comma-delimited list of paths (e.g. `/app/dev,/app/prd`) or JSON object or array of [PathSsmLike](./src/path-ssm.ts)
> may be supplied.

## Usage

Variables load (and are overwritten if duplicates are found) in the following order:

1. Load `SSM`
2. Load `.env` file
3. Load `.tfvars` file
4. Load `process.env`

### Single Path

SSM Path: `/my/app` SSM Parameters:

- /my/app/db/user => `admin`
- /my/app/db/pass => `ch@ng3m3`
- /my/app/host => `example.com`

```ts
import EnvSsm from 'env-ssm'

/**
 * @returns {db: {user: 'admin', pass: 'ch@ng3m3'}, host: 'example.com'}
 */
async function getParams () {
  const env = await EnvSsm(path)
  const db = env.get('db').required().asJsonObject()
  const host = env.get('api').required().asString()
  return { db, host }
}
```

### Multiple Paths & Delimiters

SSM Paths:

- `/my/app`
- `my.app`

SSM Parameters:

- /my/app/db/user => `admin`
- /my/app/db/pass => `ch@ng3m3`
- my.app.host => `example.com`

```ts
import EnvSsm from 'env-ssm'

/**
 * @returns {db: {user: 'admin', pass: 'ch@ng3m3'}, host: 'example.com'}
 */
async function getParams () {
  const env = await EnvSsm([
    '/my/app',

    // If no delimiter is specified, the path is treated as a single property name
    { path: 'my.app', delimiter: '.' }
  ])
  const db = env.get('db').required().asJsonObject()
  const host = env.get('api').required().asString()
  return { db, host }
}
```

### For Local Development

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
async function getParams () {
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


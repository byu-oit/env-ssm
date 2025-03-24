![ npm ](https://img.shields.io/npm/v/@byu-oit/env-ssm)

# env-ssm

A lightweight solution to load environment variables from AWS SSM Parameter Store—with support for `.env` files and `process.env`—and seamlessly integrate with a type coercion API for safe, validated configuration.

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
    - [Loading Environment Variables from SSM](#loading-environment-variables-from-ssm)
    - [Using the Coercion API](#using-the-coercion-api)
3. [API Reference](#api-reference)
    - [EnvSsm Options](#envssm-options)
    - [CoercionContainer Class](#coercioncontainer-class)
    - [Coercion Class](#coercion-class)
4. [Error Handling](#error-handling)

---

## Installation

This package has peer dependencies `@aws-sdk/client-ssm`. To install the core functionality, run:

```bash
npm install @byu-oit/env-ssm @aws-sdk/client-ssm
```

If you want to support loading variables from a .env file, install dotenv:

```bash
npm install dotenv
```

---

## Quick Start

The package loads environment variables from three sources, in the following order (later sources overwrite earlier ones):
1.	SSM Parameter Store
2.	`.env` file
3.	`process.env`

### Loading Environment Variables from SSM

#### Usage Examples

SSM Path: `/my/app`

SSM Parameters:
- /my/app/db/user => `admin`
- /my/app/db/pass => `ch@ng3m3`
- /my/app/host => `https://example.com`

```js
import EnvSsm from 'env-ssm'

/**
 * Retrieves environment variables.
 * @returns { db: { user: 'admin', pass: 'ch@ng3m3' }, host: 'https://example.com' }
 */
async function getParams () {
  const env = await EnvSsm('/my/app')
  const db = env.get('db').required().asJsonObject()
  const host = env.get('api').required().asUrlString()
  return { db, host }
}
```

If your SSM parameters are spread across multiple paths or use custom delimiters, you can specify these as follows:

SSM Paths:
- /my/app
- my.app (using `.` as a delimiter)

Parameters:

- /my/app/db/user → admin
- /my/app/db/pass → ch@ng3m3
- my.app.host → example.com

```js
import EnvSsm from 'env-ssm'

/**
 * Retrieves environment variables from multiple SSM paths.
 * @returns { db: { user: 'admin', pass: 'ch@ng3m3' }, host: 'example.com' }
 */
async function getParams () {
  const env = await EnvSsm([
    '/my/app',
    { path: 'my.app', delimiter: '.' }
  ])
  const db = env.get('db').required().asJsonObject()
  const host = env.get('api').required().asString()
  return { db, host }
}
```

### Using the Coercion API

Once your environment variables are loaded, you can use the built-in coercion library for type-safe access. For example:

```js
import { CoercionContainer } from '@byu-oit/env-ssm'

// Define a sample environment source
const envSource = {
PORT: '8080',
DEBUG: 'true',
CONFIG: '{"key": "value"}',
MODE: 'production'
}

// Create a container instance with the source
const env = new CoercionContainer(envSource)

// Retrieve and coerce variables with defaults and validations
const port = env.get('PORT')
  .default(3000)
  .asPortNumber()

const debug = env.get('DEBUG')
  .required()
  .asBool()

const config = env.get('CONFIG')
  .default('{}')
  .asJsonObject()

const mode = env.get('MODE')
  .asEnum(['development', 'production', 'test'])

console.log(`Server will run on port: ${port}`)
console.log(`Debug mode: ${debug}`)
console.log(`Configuration:`, config)
console.log(`Running mode: ${mode}`)
```

In this example:
- **PORT** is converted into a valid port number with a default.
- **DEBUG** is required and coerced to a boolean.
- **CONFIG** is parsed as a JSON object.
- **MODE** is validated against allowed values.

---

## API Reference

### EnvSsm Options

| Option        | Type                                                                                              | Description                                                                                                                                                                                                                      | Default                   |
|:--------------|:--------------------------------------------------------------------------------------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:--------------------------|
| ssm           | [SSMClient](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-ssm/index.html) | An AWS SSM client instance. The [default SSM client can be configured with environment variables](https://docs.aws.amazon.com/sdk-for-java/v1/developer-guide/setup-credentials.html) or a custom instance may be provided.      | SSMClient                 |
| paths         | [PathSsmLike](./src/path-ssm.ts) OR [PathSsmLike](./src/path-ssm.ts)[]                            | The SSM parameter store path to use. All parameters that fall under this path will be returned as properties in the environment variables object. Parameters with multiple nested children will be returned as stringified JSON. | []                        |
| pathDelimiter | string                                                                                            | Specify a path delimiter.                                                                                                                                                                                                        | `/`                       |
| processEnv    | boolean                                                                                           | If true, it will add process.env variables to the container.                                                                                                                                                                     | true                      |
| dotenv        | boolean OR string                                                                                 | Adds local .env variables to the environment. Can be false, which disables `.env` support. May also be the exact path to the .env file relative to the project or package root.                                                  | `process.cwd() + '/.env'` |

> [TIP!]
> You can also configure options using environment variables:
> - ENV_SSM_PATHS
> - ENV_SSM_PATH_DELIMITER
> - ENV_SSM_PROCESS_ENV
> - ENV_SSM_DOTENV

> [NOTE!]
> All options provided as environment variables are cast from strings to their respective types. For ENV_SSM_PATHS, you can supply a comma-delimited list (e.g. /app/dev,/app/prd) or a JSON object/array.

---

### CoercionContainer Class

Wraps an object of environment variables and provides a method for type-safe variable access.

#### Constructor

```ts
constructor(source: T)
```

- source: An object conforming to the Source interface.

#### Method: get

```ts
get(key: keyof T | string): Coercion
```

- key: The name of the environment variable.
- Returns: A Coercion instance for chaining validation and conversion methods.

### Coercion Class

A builder class for handling an individual environment variable. It allows marking a variable as required, setting default values, and converting the variable into various types.

Methods

```ts
required(condition?: boolean): this
```

Marks the variable as required (default is true).
Throws an error if the variable is missing when required.

```ts
default(defaultValue: unknown): this
```

Sets a fallback value if the variable is absent.

```ts
asString(): string
```

Converts the variable to a string.

```ts
asBool(): boolean
```

Converts the variable to a boolean. Accepts native boolean values or the strings "true"/"false" (case-insensitive).
Throws an error if the conversion fails.

```ts
asNumber(): number
```

Converts the variable to a number.
Throws an error if the result is NaN.

```ts
asPortNumber(): number
```

Converts the variable to a number and validates that it falls within the range 1–65535.
Throws an error if the port number is out of range.

```ts
asJsonObject<T = any>(): T
```

Converts the variable to a JSON object. If the value is a string, it is parsed as JSON.
Throws an error if parsing fails or if the value is not a valid JSON object.

```ts
asEnum<T extends string>(allowed: T[]): T
```

Validates that the variable’s string value is one of the allowed values.
Throws an error if the value is not in the allowed list.

```ts
asUrlString(): string
```

Converts the variable to a string and validates that it is a well-formed URL.
Throws an error if the URL is invalid.

```ts
asUrlObject(): URL
```

Converts the variable to a URL object using the URL constructor.
Throws an error if the value is not a valid URL.

---

## Error Handling

Each coercion method checks for the presence and validity of its target variable:
- If a variable is missing and marked as required, an error is thrown.
- If conversion fails (e.g., an invalid number, malformed JSON, or a bad URL), a descriptive error is provided.

This helps catch configuration issues early during application startup.

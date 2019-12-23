# ENV SSM
Gets params from your environment first, then from the ssm parameter store.

## Options

| Option | Description |
|---| --- |
| region | The AWS SSM region where the parameters are stored. |
| prefix | The prefix to attach to the beginning of the parameter name. Can also be the key of an environment variable who's value will be the prefix. |


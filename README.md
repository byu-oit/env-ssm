# ENV SSM

Gets params from your environment first, then from the ssm parameter
store.

## Options # ENV SSM

Gets params from your environment first, then from the ssm parameter
store.

## Options

| Option | Description                                                                                                                                 |
|:-------|:--------------------------------------------------------------------------------------------------------------------------------------------|
| region | The AWS SSM region where the parameters are stored.                                                                                         |
| prefix | The prefix to attach to the beginning of the parameter name. Can also be the key of an environment variable who's value will be the prefix. |



| Option | Description                                                                                                                                 |
|:-------|:--------------------------------------------------------------------------------------------------------------------------------------------|
| region | The AWS SSM region where the parameters are stored.                                                                                         |
| prefix | The prefix to attach to the beginning of the parameter name. Can also be the key of an environment variable who's value will be the prefix. |


---

TFVARS_FILE_PATH=local.tfvars.json
TFVARS_FILE_PATH=local.tfvars

from(local.tfvars.json)

Traverse upward to check if tfvars is above .git root

import {SSMClient} from '@aws-sdk/client-ssm'
const ssm = new SSMClient({region: 'us-west-2'})

const path = '/some/second'
env = await EnvSsm.from(ssm).path('', {}).path('', {}).load()
env = await EnvSsm.fetch(ssm, path, {})
env.get()
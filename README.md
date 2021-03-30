# ENV SSM

Gets params from your environment first, then from the ssm parameter
store.

## Options

| Option | Description                                                                                                                                 |
|:-------|:--------------------------------------------------------------------------------------------------------------------------------------------|
| region | The AWS SSM region where the parameters are stored.                                                                                         |
| prefix | The prefix to attach to the beginning of the parameter name. Can also be the key of an environment variable whose value will be the prefix. |

---

Traverse upward to check if tfvars is above .git root?

import {SSMClient} from '@aws-sdk/client-ssm'
const ssm = new SSMClient({region: 'us-west-2'})

const path = '/some/second'
env = await EnvSsm.from(ssm).path('', {}).path('', {}).load()
env = await EnvSsm.fetch(ssm, path, {})
env.get()
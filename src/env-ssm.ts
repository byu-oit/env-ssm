import {SSMClient, GetParametersByPathCommand} from '@aws-sdk/client-ssm'

export type Options = {
    /**
     * Removes part of the path that matches the trim (default true).
     */
    trim?: boolean | string
    /**
     * Adds process.env variables to the container (default false).
     * Behavior only changes when used on the global level.
     */
    processEnv?: boolean
}

export default class EnvSsm {
    private ssm: SSMClient
    private trim?: Options['trim']
    private readonly processEnv: Options['processEnv']

    private promises: Promise<NodeJS.ProcessEnv>[] = []

    /**
     * Alias for EnvSsm constructor
     */
    static from(ssm: SSMClient, options?: Options) {
        return new EnvSsm(ssm, options)
    }

    /**
     * Alias for EnvSsm.prototype.fetch method
     */
    static async fetch (ssm: SSMClient, path: string, options?: Options) {
        return await EnvSsm.from(ssm, options).fetch(path)
    }

    constructor(ssm: SSMClient, options: Options = {}) {
        this.ssm = ssm
        this.trim = options.trim === undefined ? true : options.trim
        this.processEnv = options.processEnv === true
    }

    /**
     * Shortcut for making a single GetParametersByPath request
     */
    async fetch (path: string, options: Options = {}): Promise<NodeJS.ProcessEnv> {
        return await this.path(path, options).load()
    }

    /**
     * Adds GetParametersByPath request to the batch.
     */
    path(path: string, options: Options = {}): this {
        const command = new GetParametersByPathCommand({
            Path: path,
            Recursive: true
        })
        const promise = this.ssm.send(command)
            .then(data => {
                const {Parameters: parameters = []} = data

                // Combine all parameters into an environment container, aka NodeJS.ProcessEnv
                return parameters.reduce((agg, {Name: name, Value: value}) => {
                    if (name == null) return agg // Shouldn't get here

                    // Use global trim if a local trim isn't defined
                    const trim = options.trim !== undefined ? options.trim : this.trim

                    // Derive the part of the path to remove (if any)
                    let match
                    if (typeof trim === 'string') {
                        // Local trim
                        match = trim + '/'
                    }
                    else if (trim === true) {
                        // Global trim
                        match = path + '/'
                    } else {
                        // No trim
                        match = ''
                    }

                    // Apply trim to parameter name
                    const key = trim ? name.replace(match, '') : name

                    // Add parameter into environment container
                    return {...agg, [key]: value}
                }, {} as NodeJS.ProcessEnv) // Do not initialize with process.env here to optimize resolution time
            })
            .catch(e => {
                throw new Error(`Cannot resolve path from AWS SSM '${path}': ${e.message}`)
            })

        // Add to list of ssm requests
        this.promises.push(promise)
        return this
    }

    /**
     * Completes GetParametersByPath requests and aggregates results into environment container.
     */
    async load(): Promise<NodeJS.ProcessEnv> {
        const envs = await Promise.all(this.promises)
        this.promises.length = 0 // clear previous requests
        const container = this.processEnv ? process.env : {}
        return envs.reduce((env, cur) => ({...env, ...cur}), container)
    }
}

import {
	DescribeParametersCommand,
	GetParametersByPathCommand,
	GetParametersCommand,
	type Parameter,
	type ParameterMetadata,
	type SSMClient,
} from '@aws-sdk/client-ssm'
import Debugger from 'debug'
import { chunk, set } from 'lodash-es'
import type { Options } from '../env-ssm.js'
import { PathSsm } from '../path-ssm.js'

const logger = Debugger('env-ssm/ssm-loader')

export const ENV_SSM_PATHS_KEY = 'ENV_SSM_PATHS'
export const ENV_SSM_PATH_DELIMITER_KEY = 'ENV_SSM_PATH_DELIMITER'

export function resolvePathDelimiter(input: Options): string {
	input.pathDelimiter =
		input.pathDelimiter ?? process.env[ENV_SSM_PATH_DELIMITER_KEY] ?? '/'
	return input.pathDelimiter
}

export function resolvePaths(options: Options, delimiter: string): PathSsm[] {
	const paths: PathSsm[] = []
	if (options.paths === undefined) {
		const envSsmPath = process.env[ENV_SSM_PATHS_KEY]
		if (envSsmPath !== undefined) {
			let result: unknown
			try {
				result = JSON.parse(envSsmPath)
				logger('Parsed ENV_SSM_PATH value as JSON')
			} catch (e) {
				result = envSsmPath.split(',')
				logger('Parsed ENV_SSM_PATH value as comma-seperated list of SSM paths')
			}
			if (!Array.isArray(result)) {
				paths.push(PathSsm.from(result))
			} else {
				paths.push(...result.map((path) => PathSsm.from(path, delimiter)))
			}
		}
	} else if (PathSsm.like(options.paths)) {
		paths.push(PathSsm.from(options.paths, delimiter))
	} else if (Array.isArray(options.paths)) {
		paths.push(...options.paths.map((pathLike) => PathSsm.from(pathLike)))
	}
	return paths
}

export async function resolveSSMClient(
	options: Options,
): Promise<SSMClient | undefined> {
	if (options.ssm === false) {
		// Disabling SSM Parameters
		return
	}
	// Import ssm client if not provided (optional dependency)
	return options.ssm === undefined || options.ssm === true
		? new (await import('@aws-sdk/client-ssm')).SSMClient({})
		: options.ssm
}

export async function loadSsmParams(
	ssm: SSMClient,
	paths: PathSsm[],
): Promise<NodeJS.ProcessEnv> {
	// Make requests and combine all results into an array of parameters
	// Ensures each parameter has the "Path" that was used to retrieve it
	logger('Checking ssm for parameters')
	const ssmParameters = await Promise.all(
		paths.map(async (path) => {
			return path.delimiter === '/' && path.path.startsWith(path.delimiter)
				? await fetchSsmParamsByPath(ssm, path)
				: await fetchSsmParamsByPrefix(ssm, path)
		}),
	).then((parameters) => parameters.flat())

	// Combine all parameters into an environment container, aka NodeJS.ProcessEnv
	return ssmParameters.reduce<NodeJS.ProcessEnv>(
		(agg, { Path, Name, Value }) => {
			if (Name == null) return agg // Shouldn't get here

			// Get hierarchy from parameter path
			const path =
				Path.path === Name
					? (Name.split(Path.delimiter).pop() as string)
					: Name.replace(RegExp(`^${Path.path}${Path.delimiter}?`), '')
							.split(Path.delimiter)
							.join('.')

			// Add parameter into environment container
			return set(agg, path, Value)
		},
		{},
	)
}

async function fetchSsmParamsByPath(
	ssm: SSMClient,
	path: PathSsm,
	parameters: Array<Parameter & { Path: PathSsm }> = [],
	token?: string,
): Promise<Array<Parameter & { Path: PathSsm }>> {
	const command = new GetParametersByPathCommand({
		Path: path.path,
		Recursive: true,
		...(token != null && { NextToken: token }),
		WithDecryption: true,
	})
	try {
		// Send request and transform response
		const { Parameters = [], NextToken } = await ssm.send(command)
		parameters.push(
			...Parameters.map((parameter) => ({ ...parameter, Path: path })),
		)

		// Recursively call to get next parameters since the max number returned is 10
		if (NextToken != null) {
			await fetchSsmParamsByPath(ssm, path, parameters, NextToken)
		}
	} catch (e: unknown) {
		// e is technically an unknown/any type
		const message = e instanceof Error ? e.message : JSON.stringify(e)
		// It's possible that the parameter is not required, so we'll handle failed responses and only warn if
		// verbose logging is turned on via the DEBUG environment variable
		logger(`Cannot resolve path from AWS SSM '${path.path}': ${message}`)
	}
	return parameters
}

async function fetchSsmParamsByPrefix(
	ssm: SSMClient,
	prefix: PathSsm,
): Promise<Array<Parameter & { Path: PathSsm }>> {
	const metadata = await describeSsmParameters(ssm, prefix)
	const parameterNames = metadata.map((datum) => datum.Name as string)
	const chunks = chunk(parameterNames, 10) // Cannot retrieve more than 10 parameters at a time
	return await Promise.all(
		chunks.map(async (chunk) => {
			return await fetchSsmParametersByName(ssm, prefix, chunk)
		}),
	).then((parameters) => parameters.flat())
}

async function describeSsmParameters(
	ssm: SSMClient,
	prefix: PathSsm,
	parameters: ParameterMetadata[] = [],
	token?: string,
): Promise<ParameterMetadata[]> {
	const command = new DescribeParametersCommand({
		ParameterFilters: [
			{ Key: 'Name', Option: 'BeginsWith', Values: [prefix.path] },
		],
		...(token != null && { NextToken: token }),
	})
	try {
		const { Parameters = [], NextToken } = await ssm.send(command)
		parameters.push(...Parameters)

		// Recursively call to get next parameters since the max number returned is 10
		if (NextToken != null) {
			await describeSsmParameters(ssm, prefix, parameters, NextToken)
		}
	} catch (e: unknown) {
		// e is technically an unknown/any type
		const message = e instanceof Error ? e.message : JSON.stringify(e)
		// It's possible that the parameter is not required, so we'll handle failed responses and only warn if
		// verbose logging is turned on via the DEBUG environment variable
		logger(`Cannot resolve prefix from AWS SSM '${prefix.path}': ${message}`)
	}
	return parameters
}

async function fetchSsmParametersByName(
	ssm: SSMClient,
	prefix: PathSsm,
	names: string[],
): Promise<Array<Parameter & { Path: PathSsm }>> {
	const response: Array<Parameter & { Path: PathSsm }> = []
	if (names.length === 0) return response // Early out if names[] is empty

	const command = new GetParametersCommand({
		Names: names,
		WithDecryption: true,
	})
	try {
		const result = await ssm.send(command)
		const { Parameters = [], InvalidParameters = [] } = result
		if (InvalidParameters.length > 0) {
			// Should never see this warning since we're only using GetParametersCommand with the results of
			// DescribeParametersCommand, but it's here for completeness
			logger(`Invalid parameter names: ${InvalidParameters.join(', ')}`)
		}
		for (const param of Parameters) {
			response.push({ ...param, Path: prefix })
		}
	} catch (e: unknown) {
		// e is technically an unknown/any type
		const message = e instanceof Error ? e.message : JSON.stringify(e)
		// It's possible that the parameter is not required, so we'll handle failed responses and only warn if
		// verbose logging is turned on via the DEBUG environment variable
		logger(
			`Cannot resolve parameter values with prefix "${prefix.path}" from AWS SSM: ${message}`,
		)
	}
	return response
}

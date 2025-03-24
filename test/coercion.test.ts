import test from 'node:test'
import assert from 'assert'
import { CoercionContainer, Coercion } from '../src/coercion.js' // adjust the import path if necessary

// --- Tests for CoercionContainer ---

test('CoercionContainer.get returns a Coercion wrapping the value', () => {
  const source = { FOO: 'bar' }
  const container = new CoercionContainer(source)
  const coercion = container.get('FOO')
  assert.strictEqual(coercion.asString(), 'bar')
})

test('CoercionContainer.get returns undefined if value is missing and no default is provided', () => {
  const source = {}
  const container = new CoercionContainer(source)
  // Not required and no default provided returns undefined.
  // (Note: asString() returns the value as-is if nullish.)
  assert.strictEqual(container.get('MISSING').asString(), undefined)
})

// --- Tests for Coercion.asString and default ---

test('Coercion.asString returns a string representation of the value', () => {
  const coercion = new Coercion('num', 123)
  assert.strictEqual(coercion.asString(), '123')
})

test('Coercion.default sets a fallback value when the original is missing', () => {
  const coercion = new Coercion('missing', undefined).default('defaultValue')
  assert.strictEqual(coercion.asString(), 'defaultValue')
})

// --- Tests for Coercion.asBool ---

test('Coercion.asBool converts boolean values correctly', () => {
  assert.strictEqual(new Coercion('bool', true).asBool(), true)
  assert.strictEqual(new Coercion('bool', false).asBool(), false)
})

test('Coercion.asBool converts string "true"/"false" (case-insensitive)', () => {
  assert.strictEqual(new Coercion('bool', 'true').asBool(), true)
  assert.strictEqual(new Coercion('bool', 'FALSE').asBool(), false)
})

test('Coercion.asBool throws for invalid boolean strings', () => {
  const coercion = new Coercion('bool', 'notabool')
  assert.throws(() => coercion.asBool(), /Invalid boolean value/)
})

test('Coercion.asBool throws if value is missing and marked required', () => {
  const coercion = new Coercion('bool', undefined).required()
  assert.throws(() => coercion.asBool(), /Missing required environment variable/)
})

// --- Tests for Coercion.asNumber ---

test('Coercion.asNumber converts values to numbers', () => {
  assert.strictEqual(new Coercion('num', '42').asNumber(), 42)
  assert.strictEqual(new Coercion('num', 3.14).asNumber(), 3.14)
})

test('Coercion.asNumber throws for invalid number values', () => {
  const coercion = new Coercion('num', 'notanumber')
  assert.throws(() => coercion.asNumber(), /Invalid number value/)
})

// --- Tests for Coercion.asPortNumber ---

test('Coercion.asPortNumber returns valid port numbers', () => {
  assert.strictEqual(new Coercion('port', '8080').asPortNumber(), 8080)
})

test('Coercion.asPortNumber throws for numbers below 1 or above 65535', () => {
  assert.throws(() => new Coercion('port', 0).asPortNumber(), /Invalid port number/)
  assert.throws(() => new Coercion('port', 70000).asPortNumber(), /Invalid port number/)
})

// --- Tests for Coercion.asJsonObject ---

test('Coercion.asJsonObject returns object if value is already an object', () => {
  const obj = { a: 1 }
  assert.deepStrictEqual(new Coercion('json', obj).asJsonObject(), obj)
})

test('Coercion.asJsonObject parses a valid JSON string', () => {
  const jsonString = '{"a":1,"b":2}'
  assert.deepStrictEqual(new Coercion('json', jsonString).asJsonObject(), { a: 1, b: 2 })
})

test('Coercion.asJsonObject throws for an invalid JSON string', () => {
  const coercion = new Coercion('json', 'not json')
  assert.throws(() => coercion.asJsonObject(), /Invalid JSON object/)
})

test('Coercion.asJsonObject throws for non-object values', () => {
  const coercion = new Coercion('json', 123)
  assert.throws(() => coercion.asJsonObject(), /Invalid JSON object/)
})

// --- Tests for Coercion.asEnum ---

test('Coercion.asEnum returns the value if it is in the allowed set', () => {
  const coercion = new Coercion('color', 'blue')
  assert.strictEqual(coercion.asEnum(['red', 'blue', 'green']), 'blue')
})

test('Coercion.asEnum throws if the value is not in the allowed set', () => {
  const coercion = new Coercion('color', 'yellow')
  assert.throws(() => coercion.asEnum(['red', 'blue', 'green']), /Invalid value for/)
})

// --- Tests for Coercion.asUrlString ---
test('Coercion.asUrlString throws for a valid URL string', () => {
  const expected = 'http://example.com'
  const coercion = new Coercion('url', expected)
  assert.strictEqual(coercion.asUrlString(), expected)
})

test('Coercion.asUrlString behavior for non-string values', () => {
  const coercion = new Coercion('url', 12345)
  // asUrlString calls asString which converts 12345 to "12345", then URL.parse("12345") returns an object,
  // so the method will throw.
  assert.throws(() => coercion.asUrlString(), /Invalid URL string/)
})

// --- Tests for Coercion.asUrlObject ---
test('Coercion.asUrlObject throws for a valid URL string', () => {
  const expected = 'http://example.com'
  const coercion = new Coercion('url', expected)
  assert.deepStrictEqual(coercion.asUrlObject(), new URL(expected))
})

test('Coercion.asUrlObject behavior for non-string values', () => {
  const coercion = new Coercion('url', 12345)
  // asUrlString calls asString which converts 12345 to "12345", then URL.parse("12345") returns an object,
  // so the method will throw.
  assert.throws(() => coercion.asUrlObject(), /Invalid URL string/)
})

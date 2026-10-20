// @typesafe-ai/sdk 0.7.0 (MIT, https://github.com/typesafe-ai/typesafe-sdk-js), its dist/index.mjs vendored as is:
// a mod imports only its own files. Update with: npm pack @typesafe-ai/sdk@<version>.
const requestIdFrom = (headers) => headers.get("x-typesafe-request-id") ?? void 0;
/**
* A promise for the parsed result with access to the HTTP response.
*
* Non-2xx responses reject with an `APIError`, including through `asResponse()`.
*/
var APIPromise = class APIPromise extends Promise {
	#responsePromise;
	#parseResponse;
	#parsed;
	constructor(responsePromise, parseResponse) {
		super((resolve) => resolve(void 0));
		this.#responsePromise = responsePromise;
		this.#parseResponse = parseResponse;
	}
	/**
	* Resolves to the raw `Response` without parsing the body. SDK requests buffer the full
	* body under the request timeout before handoff; reading it afterwards is caller-owned.
	* The caller owns the body; don't also `await` the parsed result on the same promise.
	*/
	asResponse() {
		return this.#responsePromise;
	}
	/** Return the parsed result, HTTP response, and request ID. */
	async withResponse() {
		const [data, response] = await Promise.all([this.#parse(), this.#responsePromise]);
		return {
			data,
			response,
			requestId: requestIdFrom(response.headers)
		};
	}
	/** Transform the parsed result, sharing the HTTP response and a single body parse. */
	map(fn) {
		return new APIPromise(this.#responsePromise, () => this.#parse().then(fn));
	}
	#parse() {
		this.#parsed ??= this.#responsePromise.then(this.#parseResponse);
		return this.#parsed;
	}
	then(onfulfilled, onrejected) {
		return this.#parse().then(onfulfilled, onrejected);
	}
	catch(onrejected) {
		return this.#parse().catch(onrejected);
	}
	finally(onfinally) {
		return this.#parse().finally(onfinally);
	}
};
const range = (from, to) => Array.from({ length: to - from }, (_, i) => from + i);
/** Default SDK retry policy. */
const DEFAULT_RETRY_POLICY = {
	maxRetries: 2,
	backoffInitialMs: 500,
	backoffMaxMs: 5e3,
	backoffJitter: .25,
	/** HTTP 408, 429, and 5xx responses. */
	httpStatuses: /* @__PURE__ */ new Set([
		408,
		429,
		...range(500, 600)
	]),
	respectRetryAfter: true,
	/** Maximum server retry delay before falling back to backoff. */
	maxRetryAfterMs: 6e4,
	apiConnectionError: true,
	apiTimeoutError: true
};
DEFAULT_RETRY_POLICY.maxRetries;
/** Whether the policy retries an HTTP status code. */
const isRetryableStatus = (status, policy = DEFAULT_RETRY_POLICY) => policy.httpStatuses.has(status);
/**
* Parse `retry-after-ms` or `Retry-After` into milliseconds, preferring `retry-after-ms`.
*
* Return `undefined` when neither header contains a valid delay.
*/
const parseRetryAfter = (headers, now = Date.now()) => {
	const ms = Number(headers.get("retry-after-ms"));
	if (headers.has("retry-after-ms") && Number.isFinite(ms) && ms >= 0) return ms;
	const raw = headers.get("retry-after");
	if (raw === null) return void 0;
	const seconds = Number(raw);
	if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1e3 : void 0;
	const date = Date.parse(raw);
	if (!Number.isNaN(date)) return Math.max(0, date - now);
};
/**
* Calculate the delay in milliseconds for a zero-based retry attempt.
*
* Use an allowed server delay; otherwise use capped exponential backoff with jitter.
*/
const retryDelayMs = (attempt, headers, policy = DEFAULT_RETRY_POLICY, random = Math.random) => {
	if (policy.respectRetryAfter && headers !== void 0) {
		const retryAfter = parseRetryAfter(headers);
		if (retryAfter !== void 0 && retryAfter <= policy.maxRetryAfterMs) return retryAfter;
	}
	const exponential = Math.min(policy.backoffInitialMs * 2 ** attempt, policy.backoffMaxMs);
	return Math.round(exponential * (1 - random() * policy.backoffJitter));
};
/** Wait `ms` milliseconds, rejecting with `signal.reason` on cancellation. */
const sleep = (ms, signal) => new Promise((resolve, reject) => {
	if (signal?.aborted) return reject(signal.reason);
	const onAbort = () => {
		clearTimeout(timer);
		reject(signal?.reason);
	};
	const timer = setTimeout(() => {
		signal?.removeEventListener("abort", onAbort);
		resolve();
	}, ms);
	signal?.addEventListener("abort", onAbort, { once: true });
});
//#endregion
//#region src/errors.ts
/** Base class for SDK errors. */
var TypeSafeError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = new.target.name;
	}
};
const isRecord = (value) => typeof value === "object" && value !== null;
/** Extract a message from a text, error, or validation response body. */
const extractMessage = (body) => {
	if (typeof body === "string") return body || void 0;
	if (!isRecord(body)) return void 0;
	const { error, message, detail } = body;
	if (typeof error === "string") return error;
	if (isRecord(error) && typeof error.message === "string") return error.message;
	if (typeof message === "string") return message;
	if (typeof detail === "string") return detail;
	if (isRecord(detail) && typeof detail.message === "string") return detail.message;
	if (Array.isArray(detail)) return describeValidationErrors(detail);
};
/** Format validation errors as semicolon-separated `path: message` entries. */
const describeValidationErrors = (errors) => {
	const parts = errors.flatMap((e) => {
		if (!isRecord(e) || typeof e.msg !== "string") return [];
		const loc = Array.isArray(e.loc) ? e.loc.filter((x) => x !== "body").join(".") : "";
		return [loc ? `${loc}: ${e.msg}` : e.msg];
	});
	return parts.length > 0 ? parts.join("; ") : void 0;
};
const MAX_RAW_BODY_IN_MESSAGE = 200;
/** An unsuccessful HTTP response from the API. */
var APIError = class APIError extends TypeSafeError {
	/** HTTP response status code. */
	status;
	/** HTTP response headers. */
	headers;
	/** Parsed JSON, response text, or `undefined` for an empty body. */
	body;
	/** Request ID from `x-typesafe-request-id`, or `undefined` when absent. */
	requestId;
	constructor(status, body, headers, message) {
		super(message ?? APIError.describe(status, body));
		this.status = status;
		this.body = body;
		this.headers = headers;
		this.requestId = requestIdFrom(headers);
	}
	static describe(status, body) {
		const detail = extractMessage(body);
		if (detail) return `${status} ${detail}`;
		if (body === void 0) return `${status} status code (no body)`;
		const raw = typeof body === "string" ? body : JSON.stringify(body);
		return `${status} ${raw.length > MAX_RAW_BODY_IN_MESSAGE ? `${raw.slice(0, MAX_RAW_BODY_IN_MESSAGE)}…` : raw}`;
	}
	/** Create the error subclass for an HTTP status code. */
	static fromResponse(status, body, headers) {
		if (status === 400) return new BadRequestError(status, body, headers);
		if (status === 401) return new AuthenticationError(status, body, headers);
		if (status === 403) return new PermissionDeniedError(status, body, headers);
		if (status === 404) return new NotFoundError(status, body, headers);
		if (status === 422) return new UnprocessableEntityError(status, body, headers);
		if (status === 429) return new RateLimitError(status, body, headers);
		if (status >= 500) return new InternalServerError(status, body, headers);
		return new APIError(status, body, headers);
	}
};
/** HTTP 400: the request is invalid. */
var BadRequestError = class extends APIError {};
/** HTTP 401: authentication failed. */
var AuthenticationError = class extends APIError {};
/** HTTP 403: access is denied. */
var PermissionDeniedError = class extends APIError {};
/** HTTP 404: the resource was not found. */
var NotFoundError = class extends APIError {};
/** HTTP 422: request validation failed. */
var UnprocessableEntityError = class extends APIError {};
/** HTTP 429: the rate limit was exceeded. */
var RateLimitError = class extends APIError {
	/** Server retry delay in milliseconds, or `undefined` when absent or invalid. */
	retryAfterMs = parseRetryAfter(this.headers);
};
/** HTTP 5xx: the server failed to handle the request. */
var InternalServerError = class extends APIError {};
/** The request or response-body delivery failed (DNS, TLS, connection closed, etc.). */
var APIConnectionError = class extends TypeSafeError {
	constructor(message = "Connection error.", options) {
		super(message, options);
	}
};
/** The full response did not arrive within the timeout. A kind of `APIConnectionError`. */
var APITimeoutError = class extends APIConnectionError {
	/** Configured timeout in milliseconds. */
	timeoutMs;
	constructor(timeoutMs, options) {
		super(`Request timed out after ${timeoutMs}ms.`, options);
		this.timeoutMs = timeoutMs;
	}
};
/** The caller cancelled the request through an `AbortSignal`. */
var APIUserAbortError = class extends TypeSafeError {
	constructor(message = "Request was aborted.", options) {
		super(message, options);
	}
};
//#endregion
//#region src/assets.ts
/**
* The file signatures that PNG (PNG spec §5.2) and JPEG (ITU T.81 SOI marker) files start
* with, and the content type each identifies.
*/
const CONTENT_TYPES = [["image/png", [
	137,
	80,
	78,
	71,
	13,
	10,
	26,
	10
]], ["image/jpeg", [
	255,
	216,
	255
]]];
/** Matches `String(image)`: the reference an image is sent under. */
const REFERENCE = /<image:[0-9a-f]{32}>/g;
/** Marks `Image` objects, including those created by another copy of the SDK. */
const IMAGE = Symbol.for("@typesafe-ai/sdk/image");
/** Marks `TextWithAssets` objects, including those created by another copy of the SDK. */
const TEXT_WITH_ASSETS = Symbol.for("@typesafe-ai/sdk/text-with-assets");
/** 32 random lowercase hex digits. */
const randomHex = () => Array.from(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
const isImage = (value) => IMAGE in value;
const isTextWithAssets = (value) => TEXT_WITH_ASSETS in value;
/** `value`'s `Symbol.toStringTag`, such as `Promise`, or its `typeof` when it isn't an object. */
const typeName = (value) => {
	if (value === null) return "null";
	if (typeof value !== "object") return typeof value;
	return Object.prototype.toString.call(value).slice(8, -1);
};
/** A `Uint8Array` over the bytes `data` holds or views, without copying them. */
const toBytes = (data) => {
	if (!ArrayBuffer.isView(data) && Object.prototype.toString.call(data) !== "[object ArrayBuffer]") throw new TypeSafeError(`Image data must be file bytes or a Blob; got ${typeName(data)}.`);
	return ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
};
/** The content type whose signature `bytes` start with, or `application/octet-stream`. */
const contentTypeOf = (bytes) => {
	for (const [contentType, signature] of CONTENT_TYPES) if (signature.every((byte, i) => bytes[i] === byte)) return contentType;
	return "application/octet-stream";
};
/** A PNG or JPEG image asset, created by `image` or `Image.fromBase64`. */
var Image = class Image {
	type = "image";
	/** The image file bytes, or a `Blob` read when the request is sent. */
	data;
	#reference = `<image:${randomHex()}>`;
	/** @throws {TypeSafeError} `data` is empty or isn't file bytes or a `Blob`. */
	constructor(data) {
		this.data = data instanceof Blob ? data : toBytes(data);
		if ((this.data instanceof Blob ? this.data.size : this.data.byteLength) === 0) throw new TypeSafeError("Image data is empty.");
	}
	/**
	* Create an image from base64-encoded file bytes, decoding them now.
	*
	* @param text - The image file bytes, base64-encoded, without a `data:` URL prefix.
	* @throws {TypeSafeError} `text` isn't valid base64 or decodes to no bytes.
	*
	* @example
	* ```ts
	* const photo = Image.fromBase64(upload.photoBase64);
	* ```
	*/
	static fromBase64(text) {
		let binary;
		try {
			binary = atob(text);
		} catch (err) {
			throw new TypeSafeError("Image data must contain valid base64 text.", { cause: err });
		}
		return new Image(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
	}
	/** The unique reference this image is sent under, for referencing it inside text. */
	toString() {
		return this.#reference;
	}
	/** The reference, written by `JSON.stringify` wherever the image appears in a request. */
	toJSON() {
		return this.#reference;
	}
};
Object.defineProperty(Image.prototype, IMAGE, { value: true });
/** Text from a `withAssets` tagged template, with the assets interpolated into it. */
var TextWithAssets = class {
	/** The text, with each asset replaced by its reference. */
	text;
	/** The assets interpolated into the text, including those in nested `withAssets` text. */
	assets;
	constructor(text, assets) {
		this.text = text;
		this.assets = assets;
	}
	toString() {
		return this.text;
	}
	/** The text, written by `JSON.stringify` wherever this value appears in a request. */
	toJSON() {
		return this.text;
	}
};
Object.defineProperty(TextWithAssets.prototype, TEXT_WITH_ASSETS, { value: true });
/**
* Create an image asset for `systemOne`.
*
* Place the image in `state` or question content, or interpolate it into a `withAssets`
* tagged template; either way it is sent under its own reference, `String(image)`. To
* reference it by a name of your choice, pass it in `assets` instead.
*
* The image must be PNG or JPEG. The API detects the format from the file bytes and rejects
* other formats with a `BadRequestError`. `Blob` data is read when the request is sent, and its
* `type` is ignored. For base64 text, use `Image.fromBase64`.
*
* @param data - Image file bytes, or a `Blob` such as a `File`.
* @throws {TypeSafeError} `data` is empty or isn't file bytes or a `Blob`.
*
* @example
* ```ts
* // Node: `openAsBlob` reads a file as a Blob and is exported by "node:fs".
* const { answers } = await client.systemOne({
*   state: image(await openAsBlob("product.png")),
*   questions: { damaged: noul("Is the product damaged?") },
* });
* ```
*/
const image = (data) => new Image(data);
/** `text` with the assets in `values` whose references it contains, in order of appearance. */
const textWithAssets = (text, values) => {
	const interpolated = /* @__PURE__ */ new Map();
	collectAssets(values, interpolated, /* @__PURE__ */ new Set());
	const assets = /* @__PURE__ */ new Map();
	for (const [reference] of text.matchAll(REFERENCE)) {
		const asset = interpolated.get(reference);
		if (asset !== void 0) assets.set(reference, asset);
	}
	return new TextWithAssets(text, [...assets.values()]);
};
/**
* Tag a template literal so the assets interpolated into it are sent with the text.
*
* Each asset is replaced by its reference; other values are converted to strings, as in an
* untagged template literal. To write a list of assets with a separator, use
* `withAssets.join`.
*
* @example
* ```ts
* const { answers } = await client.systemOne({
*   state: withAssets`Compare ${photo} with the listing.`,
*   questions: { same: noul(withAssets`Is ${photo} the product in ${listing}?`) },
* });
* ```
*/
const withAssets = Object.assign((strings, ...values) => textWithAssets(strings.reduce((joined, piece, i) => joined + String(values[i - 1]) + piece), values), { join: (values, separator) => textWithAssets(values.join(separator), values) });
/** Add the assets in `value`, including those in `withAssets` text, to `found` by reference. */
const collectAssets = (value, found, visited) => {
	if (typeof value !== "object" || value === null || visited.has(value)) return;
	visited.add(value);
	if (isImage(value)) found.set(String(value), value);
	else if (isTextWithAssets(value)) for (const asset of value.assets) found.set(String(asset), asset);
	else for (const item of Object.values(value)) collectAssets(item, found, visited);
};
/**
* Serialize `payload` to JSON, writing each asset as its name in `assets`, or else as its
* reference, and collect the assets the request sends.
*
* The assets are those in `assets`, then each asset whose reference appears in the JSON, in
* order of appearance: assets placed in content, in `withAssets` text, or in `assets`.
*
* @throws {TypeSafeError} The JSON holds the reference of an asset not attached to the request,
*   or doesn't contain the name of an asset in `assets`.
*/
const serializeRequest = (payload, assets = {}) => {
	const names = new Map(Object.entries(assets).map(([name, asset]) => [asset, name]));
	const known = new Map(Object.values(assets).map((asset) => [String(asset), asset]));
	const json = JSON.stringify(payload, function(key, value) {
		if (typeof value === "number" && !Number.isFinite(value)) return String(value);
		const original = this[key];
		if (typeof original !== "object" || original === null) return value;
		if (isImage(original)) {
			const name = names.get(original);
			if (name !== void 0) return name;
			known.set(String(original), original);
		} else if (isTextWithAssets(original)) {
			let text = original.text;
			for (const asset of original.assets) {
				const name = names.get(asset);
				if (name === void 0) known.set(String(asset), asset);
				else text = text.replaceAll(String(asset), name);
			}
			return text;
		}
		return value;
	});
	const unreferenced = Object.keys(assets).filter((name) => !json.includes(JSON.stringify(name).slice(1, -1)));
	if (unreferenced.length > 0) throw new TypeSafeError(`Assets not referenced in the request: ${unreferenced.join(", ")}. Write each name in \`assets\` into \`state\`, question instructions, or criteria.`);
	const sent = new Map(Object.entries(assets));
	const missing = /* @__PURE__ */ new Set();
	for (const [reference] of json.matchAll(REFERENCE)) {
		if (sent.has(reference)) continue;
		const asset = known.get(reference);
		if (asset === void 0) missing.add(reference);
		else sent.set(reference, asset);
	}
	if (missing.size > 0) throw new TypeSafeError(`Image references without an attached image: ${[...missing].join(", ")}. Tag template literals that interpolate images with \`withAssets\`.`);
	return {
		json,
		assets: sent.size === 0 ? void 0 : Object.fromEntries(sent)
	};
};
/** A `multipart/form-data` request body (RFC 7578) whose first part is a JSON payload. */
var MultipartBody = class {
	/** The JSON payload, sent as the `request` part. */
	payload;
	/** The `Content-Type` header value, including the boundary. */
	contentType;
	/** The encoded body. */
	content;
	constructor(payload, parts) {
		const boundary = randomHex();
		const chunks = [];
		for (const { name, contentType, content, filename } of [{
			name: "request",
			contentType: "application/json",
			content: JSON.stringify(payload)
		}, ...parts]) {
			const disposition = filename === void 0 ? `name="${name}"` : `name="${name}"; filename="${filename}"`;
			chunks.push(`--${boundary}\r\nContent-Disposition: form-data; ${disposition}\r\n`, `Content-Type: ${contentType}\r\n\r\n`, content, "\r\n");
		}
		chunks.push(`--${boundary}--\r\n`);
		this.payload = payload;
		this.contentType = `multipart/form-data; boundary=${boundary}`;
		this.content = new Blob(chunks);
	}
};
/** The image's file bytes, reading `Blob` data. */
const readImage = async (alias, { data }) => {
	if (!(data instanceof Blob)) return data;
	try {
		return new Uint8Array(await data.arrayBuffer());
	} catch (err) {
		throw new TypeSafeError(`Asset "${alias}" could not be read: ${err.message}`, { cause: err });
	}
};
/** `bytes`, copied when backed by a `SharedArrayBuffer`, which `Blob` doesn't accept. */
const unshared = (bytes) => bytes.buffer instanceof ArrayBuffer ? bytes : bytes.slice();
/**
* `assets`, with each asset's file bytes copied, so writes to the caller's buffers after this
* call don't change what is sent. `Blob` data can't change, and isn't copied.
*/
const copyAssetBytes = (assets) => Object.fromEntries(Object.entries(assets).map(([alias, asset]) => [alias, asset.data instanceof Uint8Array ? new Image(asset.data.slice()) : asset]));
/**
* A `multipart/form-data` body whose first part, `request`, is `payload` with `assets` added,
* followed by each asset's file bytes in a part its entry names. `Blob` data is read
* concurrently.
*
* @throws {TypeSafeError} A `Blob` can't be read.
*/
const encodeAssets = async (payload, assets) => {
	const read = await Promise.all(Object.entries(assets).map(async ([alias, asset]) => [
		alias,
		asset,
		await readImage(alias, asset)
	]));
	const parts = [];
	const entries = [];
	for (const [alias, { type }, data] of read) {
		const name = `asset-${parts.length}`;
		parts.push({
			name,
			contentType: contentTypeOf(data),
			content: unshared(data),
			filename: name
		});
		entries.push([alias, {
			type,
			part: name
		}]);
	}
	return new MultipartBody({
		...payload,
		assets: Object.fromEntries(entries)
	}, parts);
};
const g$1 = globalThis;
/** `node:zlib`, read without an import so the SDK still loads where Node modules don't exist. */
const zlib = () => {
	try {
		return g$1.process?.getBuiltinModule?.("node:zlib");
	} catch {
		return;
	}
};
const hasZstd = () => typeof zlib()?.zstdCompress === "function";
/**
* Resolve the `compression` option to the `Content-Encoding` request bodies are sent with:
* zstd when the runtime has it, otherwise `false`.
*
* @throws {TypeSafeError} The value isn't a supported option, or the runtime lacks it.
*/
const resolveCompression = (compression) => {
	if (compression === void 0) return hasZstd() ? "zstd" : false;
	if (compression === false) return false;
	if (compression === "zstd") {
		if (!hasZstd()) throw new TypeSafeError("zstd compression requires Node.js 22.15 or newer. Pass `compression: false` instead.");
		return compression;
	}
	throw new TypeSafeError(`\`compression\` must be "zstd" or false, got ${JSON.stringify(compression)}.`);
};
const zstd = async (body) => {
	const data = new Uint8Array(await body.arrayBuffer());
	const compressed = await new Promise((resolve, reject) => {
		zlib()?.zstdCompress?.(data, (err, result) => err ? reject(err) : resolve(result));
	});
	return new Uint8Array(compressed);
};
/** The size of a request body in bytes, with text measured as UTF-8. */
const byteLength = (body) => typeof body === "string" ? new TextEncoder().encode(body).byteLength : body.size;
/** Compress a request body with zstd. */
const compressBody = (body) => zstd(typeof body === "string" ? new Blob([body]) : body);
//#endregion
//#region src/env.ts
/** Environment variable names for client configuration. Explicit options take precedence. */
const ENV = {
	/** Required API key; used when `apiKey` is omitted. */
	apiKey: "TYPESAFE_API_KEY",
	/** API root; defaults to `https://api.typesafe.ai`. */
	baseURL: "TYPESAFE_BASE_URL",
	/** Default model name; defaults to `jev-latest`. */
	defaultModel: "TYPESAFE_DEFAULT_MODEL",
	/** Log level; defaults to `warn`. */
	logLevel: "TYPESAFE_LOG_LEVEL"
};
/** Read a trimmed environment value, returning `undefined` for missing or blank values. */
const readEnv = (name) => {
	if (typeof process === "undefined" || !process.env) return void 0;
	return process.env[name]?.trim() || void 0;
};
/** Return the explicit value, falling back to the environment. */
const fromCodeOrEnv = (fromCode, envVar) => fromCode ?? readEnv(envVar);
//#endregion
//#region src/logging.ts
/** Supported log levels, from most to least verbose. */
const LOG_LEVELS = [
	"debug",
	"info",
	"warn",
	"error",
	"off"
];
const DEFAULT_LOG_LEVEL = "warn";
const isLogLevel = (value) => LOG_LEVELS.includes(value);
/** Validate a configured log level, throwing `TypeSafeError` for unknown values. */
const parseLogLevel = (value, source) => {
	if (isLogLevel(value)) return value;
	throw new TypeSafeError(`Invalid log level "${value}" from ${source}. Expected one of: ${LOG_LEVELS.join(", ")}.`);
};
const PREFIX = "[typesafe-sdk]";
/** Default console logger with the `[typesafe-sdk]` prefix. */
const consoleLogger = {
	debug: (message, ...args) => console.debug(`${PREFIX} ${message}`, ...args),
	info: (message, ...args) => console.info(`${PREFIX} ${message}`, ...args),
	warn: (message, ...args) => console.warn(`${PREFIX} ${message}`, ...args),
	error: (message, ...args) => console.error(`${PREFIX} ${message}`, ...args)
};
const RANK = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	off: 4
};
const drop = () => {};
/** Filter logger calls to the configured level and above. */
const withLevel = (sink, level) => {
	const enabled = (at) => RANK[at] >= RANK[level];
	return {
		debug: enabled("debug") ? (message, ...args) => sink.debug(message, ...args) : drop,
		info: enabled("info") ? (message, ...args) => sink.info(message, ...args) : drop,
		warn: enabled("warn") ? (message, ...args) => sink.warn(message, ...args) : drop,
		error: enabled("error") ? (message, ...args) => sink.error(message, ...args) : drop
	};
};
/** Credential headers that retain a key suffix for identification. */
const KEY_HEADERS = /* @__PURE__ */ new Set([
	"authorization",
	"proxy-authorization",
	"x-api-key"
]);
/** Headers whose values are redacted in full. */
const OPAQUE_HEADERS = /* @__PURE__ */ new Set(["cookie", "set-cookie"]);
/** Mask a key, preserving its scheme and the last four characters of secrets longer than eight. */
const redactKey = (value) => {
	const [scheme, secret] = value.includes(" ") ? value.split(/\s+/, 2) : [void 0, value];
	const tail = secret && secret.length > 8 ? secret.slice(-4) : "";
	return `${scheme ? `${scheme} ` : ""}***${tail}`;
};
const redact = (name, value) => {
	const lower = name.toLowerCase();
	if (KEY_HEADERS.has(lower)) return redactKey(value);
	if (OPAQUE_HEADERS.has(lower)) return "***";
	return value;
};
/** Copy headers with known credential values redacted. */
const redactHeaders = (headers) => Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, redact(name, value)]));
//#endregion
//#region src/questions.ts
/**
* Create a yes/no question with optional descriptions for either outcome.
*
* @param instructions - The question as text, a JSON object or array; `null` or omitted
* requires `criteria` to describe at least one outcome.
* @param criteria - Descriptions of the yes and no outcomes.
*/
const noul = (instructions = null, criteria) => ({
	type: "noul",
	instructions,
	criteria
});
/**
* Create a score question using an ordered rubric.
*
* @param instructions - The question as text, a JSON object or array, or `null`.
* @param criteria - At least two descriptions indexed by score from zero; entries may be `null`.
*   A list built at runtime, such as a `string[]`, is accepted, and `systemOne` rejects it when
*   it has fewer than two entries.
*/
const score = (instructions, criteria) => {
	const rubric = criteria;
	if (!Array.isArray(criteria)) throw new TypeSafeError("Score criteria must be a list of descriptions indexed by score from zero, not a map.");
	return {
		type: "score",
		instructions,
		criteria: rubric
	};
};
/**
* Create a question that selects between named alternatives.
*
* @param instructions - The question as text, a JSON object or array, or `null`.
* @param criteria - Labels mapped to descriptions, or `null` for undescribed labels.
*/
const choice = (instructions, criteria) => {
	if (Array.isArray(criteria)) throw new TypeSafeError("Choice criteria must be a map of labels to descriptions, not a list.");
	return {
		type: "choice",
		instructions,
		criteria
	};
};
/**
* Create a question that locates what its instructions describe in the request's image.
* Use the `jev-preview` model for `box` questions.
*
* @param instructions - What to locate, as text, an asset, a JSON object or array; defaults to `null`.
*
* @example
* ```ts
* const { answers } = await client.systemOne({
*   state: image(await openAsBlob("photo.jpg")),
*   questions: { dog: box("The dog") },
*   model: "jev-preview",
* });
* const { top, bottom, left, right } = answers.dog.box;
* ```
*/
const box = (instructions = null) => ({
	type: "box",
	instructions
});
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const validateChoice = (name, { criteria }) => {
	if (!isObject(criteria)) throw new TypeSafeError(`Choice question "${name}" has criteria that are not a map; choice criteria must be a map of labels to descriptions.`);
	if (Object.keys(criteria).length === 0) throw new TypeSafeError(`Choice question "${name}" has no criteria; at least one choice is required.`);
};
const validateNoul = (name, { instructions, criteria }) => {
	if (criteria != null && !isObject(criteria)) throw new TypeSafeError(`Noul question "${name}" criteria must be an object.`);
	if (instructions == null && !Object.values(criteria ?? {}).some((value) => value != null)) throw new TypeSafeError(`Noul question "${name}" has neither instructions nor criteria; at least one is required.`);
};
/**
* Reject empty question sets, score questions without a list of at least two criteria, choice
* questions without a nonempty map of criteria, and noul questions with non-object criteria or
* with neither instructions nor a described outcome.
*/
const validateQuestions = (questions) => {
	if (Object.keys(questions).length === 0) throw new TypeSafeError("At least one question is required.");
	for (const [name, question] of Object.entries(questions)) {
		if (question.type === "choice") validateChoice(name, question);
		if (question.type === "noul") validateNoul(name, question);
		if (question.type !== "score") continue;
		if (!Array.isArray(question.criteria)) throw new TypeSafeError(`Score question "${name}" has criteria that are not a list; score criteria must be a list of descriptions indexed by score from zero.`);
		if (question.criteria.length < 2) throw new TypeSafeError(`Score question "${name}" has ${question.criteria.length} criteria; at least two scores are required.`);
	}
};
//#endregion
//#region src/resources/models.ts
/** Access to the Models API resource. */
var Models = class {
	#transport;
	constructor(transport) {
		this.#transport = transport;
	}
	/** List the models available to the account. */
	list(options = {}) {
		return this.#transport.request("GET", "/v1/models", options).map(unwrapModels);
	}
};
const unwrapModels = (wire) => {
	if (Array.isArray(wire?.models)) return wire.models;
	throw new TypeSafeError("Unexpected response shape from GET /v1/models; expected { models: [...] }.");
};
//#endregion
//#region src/runtime.ts
const g = globalThis;
/** Whether browser page globals are present. */
const isBrowser = () => typeof g.window !== "undefined" && typeof g.window.document !== "undefined" && typeof g.navigator !== "undefined";
/** Runtime name, version, and platform for the `X-TypeSafe-Runtime` header. */
const describeRuntime = () => {
	const platform = g.process?.platform && g.process?.arch ? ` (${g.process.platform}; ${g.process.arch})` : "";
	if (g.Bun?.version) return `bun/${g.Bun.version}${platform}`;
	if (g.Deno?.version?.deno) return `deno/${g.Deno.version.deno}${platform}`;
	if (g.EdgeRuntime !== void 0) return "vercel-edge";
	if (g.navigator?.userAgent === "Cloudflare-Workers") return "cloudflare-workers";
	if (g.process?.versions?.node) return `node/${g.process.versions.node}${platform}`;
	if (isBrowser()) return "browser";
	return "unknown";
};
//#endregion
//#region src/version.ts
const VERSION = "0.7.0";
const missingApiKey = () => {
	throw new TypeSafeError(`No API key was provided. Pass \`apiKey\` to the TypeSafeClient constructor or set the ${ENV.apiKey} environment variable.`);
};
const missingFetch = () => {
	throw new TypeSafeError("No global `fetch` is available in this runtime. Pass a `fetch` implementation to the TypeSafeClient constructor.");
};
const refuseBrowser = () => {
	throw new TypeSafeError("TypeSafeClient is running in a browser, which would expose your API key to anyone using the page. Call the API from a server instead, or pass `dangerouslyAllowBrowser: true` if you understand the risk.");
};
/** Call global `fetch` with its required receiver in browsers. */
const defaultFetch = (input, init) => globalThis.fetch(input, init);
const assertNonNegativeInteger = (name, value) => {
	if (!Number.isInteger(value) || value < 0) throw new TypeSafeError(`\`${name}\` must be a non-negative integer, got ${String(value)}.`);
	return value;
};
const assertPositiveMs = (name, value) => {
	if (!Number.isFinite(value) || value <= 0) throw new TypeSafeError(`\`${name}\` must be a positive number of milliseconds, got ${String(value)}.`);
	return value;
};
const assertNonNegativeMs = (name, value) => {
	if (!Number.isFinite(value) || value < 0) throw new TypeSafeError(`\`${name}\` must be a non-negative number of milliseconds, got ${String(value)}.`);
	return value;
};
const assertFraction = (name, value) => {
	if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeSafeError(`\`${name}\` must be between 0 and 1, got ${String(value)}.`);
	return value;
};
const assertStatusSet = (name, statuses) => {
	for (const status of statuses) if (!Number.isInteger(status) || status < 100 || status > 999) throw new TypeSafeError(`\`${name}\` must contain HTTP status codes, got ${String(status)}.`);
	return statuses;
};
/** Merge and validate retry overrides, copying the status set to isolate later mutations. */
const resolveRetryPolicy = (base, overrides) => {
	const o = overrides ?? {};
	return {
		maxRetries: o.maxRetries === void 0 ? base.maxRetries : assertNonNegativeInteger("retry.maxRetries", o.maxRetries),
		backoffInitialMs: o.backoffInitialMs === void 0 ? base.backoffInitialMs : assertNonNegativeMs("retry.backoffInitialMs", o.backoffInitialMs),
		backoffMaxMs: o.backoffMaxMs === void 0 ? base.backoffMaxMs : assertNonNegativeMs("retry.backoffMaxMs", o.backoffMaxMs),
		backoffJitter: o.backoffJitter === void 0 ? base.backoffJitter : assertFraction("retry.backoffJitter", o.backoffJitter),
		httpStatuses: new Set(o.httpStatuses === void 0 ? base.httpStatuses : assertStatusSet("retry.httpStatuses", o.httpStatuses)),
		respectRetryAfter: o.respectRetryAfter ?? base.respectRetryAfter,
		maxRetryAfterMs: o.maxRetryAfterMs === void 0 ? base.maxRetryAfterMs : assertNonNegativeMs("retry.maxRetryAfterMs", o.maxRetryAfterMs),
		apiConnectionError: o.apiConnectionError ?? base.apiConnectionError,
		apiTimeoutError: o.apiTimeoutError ?? base.apiTimeoutError
	};
};
/** Whether the policy retries a connection error or timeout. */
const isRetryableError = (err, policy) => {
	if (err instanceof APITimeoutError) return policy.apiTimeoutError;
	if (err instanceof APIConnectionError) return policy.apiConnectionError;
	return false;
};
/** Resolve and validate the log level from configuration or the environment. */
const resolveLogLevel = (fromCode) => {
	if (fromCode !== void 0) return parseLogLevel(fromCode, "the `logLevel` option");
	const fromEnv = readEnv(ENV.logLevel);
	if (fromEnv !== void 0) return parseLogLevel(fromEnv, ENV.logLevel);
	return DEFAULT_LOG_LEVEL;
};
const stripTrailingSlashes = (url) => url.replace(/\/+$/, "");
/** Last value wins regardless of casing; undefined removes a protected header. */
const mergeHeaders = (...sources) => {
	const entries = /* @__PURE__ */ new Map();
	for (const source of sources) for (const [name, value] of Object.entries(source)) if (value === void 0) entries.delete(name.toLowerCase());
	else entries.set(name.toLowerCase(), [name, value]);
	return Object.fromEntries(entries.values());
};
/** Drain a clone so the original response retains its metadata and a readable, buffered body. */
const bufferResponse = async (response, signal) => {
	const reader = response.clone().body?.getReader();
	if (!reader) return;
	const original = response.body?.getReader();
	const cancel = () => {
		reader.cancel(signal.reason).catch(() => {});
		original?.cancel(signal.reason).catch(() => {});
	};
	signal.addEventListener("abort", cancel, { once: true });
	try {
		if (signal.aborted) cancel();
		signal.throwIfAborted();
		while (!(await reader.read()).done) signal.throwIfAborted();
		signal.throwIfAborted();
	} finally {
		signal.removeEventListener("abort", cancel);
		reader.releaseLock();
		original?.releaseLock();
	}
};
/**
* Call `start` and settle with its result, or reject with the signal's reason when the signal
* aborts first. `start` isn't called if the signal has already aborted.
*/
const untilAborted = (start, signal) => {
	if (signal === void 0) return start();
	return new Promise((resolve, reject) => {
		if (signal.aborted) return reject(signal.reason);
		const onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		start().then((value) => {
			signal.removeEventListener("abort", onAbort);
			resolve(value);
		}, (err) => {
			signal.removeEventListener("abort", onAbort);
			reject(err);
		});
	});
};
/** Runtime description cached for the process lifetime. */
const RUNTIME = describeRuntime();
/** An `APIPromise` rejected with `err`, for failures found before a request is sent. */
const rejectedAPIPromise = (err) => {
	const response = Promise.reject(err);
	return new APIPromise(response, () => response);
};
/** Client for the TypeSafe AI API. */
var TypeSafeClient = class {
	/** API key excluded from serialization and public properties. */
	#apiKey;
	/** API root with trailing slashes removed. */
	baseURL;
	/** Model used when a request omits `model`. */
	defaultModel;
	/** Configured log verbosity. */
	logLevel;
	/** The configured logger, filtered to `logLevel`. */
	logger;
	/** Retry settings with constructor overrides applied. */
	retry;
	/** Timeout per attempt in milliseconds. */
	timeout;
	/** Additional headers sent with each request. */
	defaultHeaders;
	/** Request body compression, or `false` when bodies are sent uncompressed. */
	compression;
	/** HTTP fetch implementation. */
	fetch;
	/** The models available to the account. */
	models;
	#requestCount = 0;
	/**
	* Create a client for the TypeSafe AI API.
	*
	* Explicit options take precedence over environment variables, then SDK defaults.
	* Empty or whitespace-only environment values are ignored.
	*
	* @throws {TypeSafeError} The API key is missing, configuration is invalid, the runtime is
	*   unsupported, or the runtime lacks the requested compression.
	*/
	constructor(config = {}) {
		if (isBrowser() && !config.dangerouslyAllowBrowser) refuseBrowser();
		this.#apiKey = fromCodeOrEnv(config.apiKey, ENV.apiKey) ?? missingApiKey();
		this.baseURL = stripTrailingSlashes(fromCodeOrEnv(config.baseURL, ENV.baseURL) ?? "https://api.typesafe.ai");
		this.defaultModel = fromCodeOrEnv(config.defaultModel, ENV.defaultModel) ?? "jev-latest";
		this.logLevel = resolveLogLevel(config.logLevel);
		this.logger = withLevel(config.logger ?? consoleLogger, this.logLevel);
		this.retry = resolveRetryPolicy(DEFAULT_RETRY_POLICY, config.retry);
		this.timeout = assertPositiveMs("timeout", config.timeout ?? 1e4);
		this.defaultHeaders = { ...config.defaultHeaders };
		this.compression = resolveCompression(config.compression);
		if (config.fetch === void 0 && typeof globalThis.fetch !== "function") missingFetch();
		this.fetch = config.fetch ?? defaultFetch;
		const transport = {
			request: (method, path, options) => this.#request(method, path, options),
			defaultModel: this.defaultModel
		};
		this.models = new Models(transport);
	}
	/**
	* Answer named questions about text, structured state, or assets.
	*
	* @param request - State, questions, an optional model override, and optional assets.
	*   Assets in `state`, question content, or `withAssets` text are sent under their references.
	* @param options - Per-call timeout, retry, headers, and cancellation settings.
	* @returns Answers typed by question name and criteria, with model and token usage. Every
	*   failure below rejects the returned promise; the call itself doesn't throw.
	* @throws {TypeSafeError} State is `null` or omitted, questions are empty, score criteria are not
	*   a list of at least two entries, choice criteria are not a nonempty map, a noul question has
	*   neither instructions nor a described outcome, a string holds the reference of an asset not
	*   attached to the request, a name in `assets` doesn't appear in the request, or a `Blob`
	*   asset can't be read.
	* @throws {APIError} The server returns a non-2xx response after retries.
	* @throws {APIConnectionError} The request cannot connect or times out after retries.
	* @throws {APIUserAbortError} The caller aborts the request.
	*
	* @example
	* ```ts
	* const { answers } = await client.systemOne({
	*   state: "I was charged twice. Please help.",
	*   questions: { billing: noul("Is this about billing?") },
	* });
	* console.log(answers.billing.noul);
	* ```
	*/
	systemOne(request, options = {}) {
		let body;
		try {
			if (request.state == null) throw new TypeSafeError("State is required.");
			validateQuestions(request.questions);
			const { assets, ...rest } = request;
			const { json, assets: sent } = serializeRequest({
				...rest,
				model: request.model ?? this.defaultModel
			}, assets);
			const payload = JSON.parse(json);
			const copied = sent === void 0 ? void 0 : copyAssetBytes(sent);
			body = copied === void 0 ? payload : () => encodeAssets(payload, copied);
		} catch (err) {
			return rejectedAPIPromise(err);
		}
		return this.#request("POST", "/v1/systemone", {
			...options,
			body
		});
	}
	/** Send a request and parse its response body. */
	#request(method, path, options = {}) {
		let resolved;
		try {
			resolved = {
				method,
				path,
				body: options.body,
				headers: mergeHeaders(this.defaultHeaders, options.headers ?? {}),
				signal: options.signal,
				timeout: options.timeout === void 0 ? this.timeout : assertPositiveMs("timeout", options.timeout),
				retry: resolveRetryPolicy(this.retry, options.retry)
			};
		} catch (err) {
			return rejectedAPIPromise(err);
		}
		const tag = `#${++this.#requestCount} ${method} ${path}`;
		return new APIPromise(this.fetchWithRetries(tag, resolved), async (res) => {
			const parsed = await parseBody(res);
			this.logger.debug(`${tag} <- body`, parsed);
			return parsed;
		});
	}
	/** Retry eligible failures, logging attempt summaries at `info` and headers and bodies at `debug`. */
	async fetchWithRetries(tag, req) {
		const url = `${this.baseURL}${req.path}`;
		let resolved = req.body;
		if (typeof resolved === "function") try {
			resolved = await untilAborted(resolved, req.signal);
		} catch (err) {
			if (!req.signal?.aborted) throw err;
			this.logger.info(`${tag} aborted by caller while reading assets`);
			throw new APIUserAbortError(void 0, { cause: err });
		}
		const multipart = resolved instanceof MultipartBody ? resolved : void 0;
		const payload = multipart === void 0 ? resolved : multipart.payload;
		const encoded = multipart?.content ?? (payload === void 0 ? void 0 : JSON.stringify(payload));
		const encoding = encoded === void 0 || byteLength(encoded) < 1024 ? false : this.compression;
		let body = encoded;
		if (encoded !== void 0 && encoding !== false) try {
			body = await untilAborted(() => compressBody(encoded), req.signal);
		} catch (err) {
			if (!req.signal?.aborted) throw err;
			this.logger.info(`${tag} aborted by caller while compressing the body`);
			throw new APIUserAbortError(void 0, { cause: err });
		}
		const headers = mergeHeaders(req.headers, {
			Authorization: `Bearer ${this.#apiKey}`,
			Accept: "application/json",
			"User-Agent": `typesafe-sdk/${VERSION}`,
			"X-TypeSafe-SDK": `typesafe-sdk/${VERSION}`,
			"X-TypeSafe-Runtime": RUNTIME,
			"Content-Type": multipart?.contentType ?? (body === void 0 ? void 0 : "application/json"),
			"Content-Encoding": encoding === false ? void 0 : encoding,
			"X-TypeSafe-Retry-Count": void 0
		});
		for (let attempt = 0;; attempt++) {
			const retriesLeft = req.retry.maxRetries - attempt;
			const attemptHeaders = attempt === 0 ? headers : {
				...headers,
				"X-TypeSafe-Retry-Count": String(attempt)
			};
			this.logger.debug(`${tag} -> ${url}`, {
				headers: redactHeaders(attemptHeaders),
				body: payload
			});
			const started = Date.now();
			let res;
			try {
				res = await this.attempt(tag, url, {
					method: req.method,
					headers: attemptHeaders,
					body
				}, req);
			} catch (err) {
				if (err instanceof APIUserAbortError || retriesLeft <= 0) throw err;
				if (!isRetryableError(err, req.retry)) throw err;
				await this.backOff(tag, attempt, retriesLeft, err.message, void 0, req);
				continue;
			}
			const requestId = requestIdFrom(res.headers);
			this.logger.info(`${tag} <- ${res.status} in ${Date.now() - started}ms${requestId ? ` (request ${requestId})` : ""}`);
			if (res.ok) return res;
			const errorBody = await parseBody(res);
			this.logger.debug(`${tag} <- error body`, errorBody);
			const error = APIError.fromResponse(res.status, errorBody, res.headers);
			if (retriesLeft <= 0 || !isRetryableStatus(res.status, req.retry)) throw error;
			await this.backOff(tag, attempt, retriesLeft, `${res.status}`, res.headers, req);
		}
	}
	/**
	* One HTTP round trip, including body delivery, with a timeout. The caller's signal and our
	* timer both abort the same controller; we check which fired to choose the error class.
	*/
	async attempt(tag, url, init, { signal, timeout }) {
		const controller = new AbortController();
		const abortFromCaller = () => controller.abort(signal?.reason);
		if (signal?.aborted) abortFromCaller();
		signal?.addEventListener("abort", abortFromCaller, { once: true });
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeout);
		const started = Date.now();
		const elapsed = () => `${Date.now() - started}ms`;
		try {
			const response = await this.fetch(url, {
				...init,
				signal: controller.signal
			});
			await bufferResponse(response, controller.signal);
			return response;
		} catch (err) {
			if (signal?.aborted) {
				this.logger.info(`${tag} aborted by caller after ${elapsed()}`);
				throw new APIUserAbortError(void 0, { cause: err });
			}
			if (timedOut) {
				this.logger.info(`${tag} timed out after ${elapsed()}`);
				throw new APITimeoutError(timeout, { cause: err });
			}
			this.logger.info(`${tag} connection error after ${elapsed()}`, err);
			throw new APIConnectionError(err instanceof Error ? `Connection error: ${err.message}` : void 0, { cause: err });
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abortFromCaller);
		}
	}
	/** Wait before retrying; caller cancellation throws `APIUserAbortError`. */
	async backOff(tag, attempt, retriesLeft, reason, headers, { retry, signal }) {
		const delay = retryDelayMs(attempt, headers, retry);
		const nth = attempt + 1;
		const total = attempt + retriesLeft;
		this.logger.info(`${tag} retrying in ${delay}ms (retry ${nth}/${total}) after ${reason}`);
		try {
			await sleep(delay, signal);
		} catch (err) {
			this.logger.info(`${tag} aborted by caller while waiting to retry`);
			throw new APIUserAbortError(void 0, { cause: err });
		}
	}
};
const parseBody = async (res) => {
	const text = await res.text();
	if (text.length === 0) return void 0;
	if ((res.headers.get("content-type") ?? "").includes("application/json")) try {
		return JSON.parse(text);
	} catch {
		return text;
	}
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
//#endregion
export { APIConnectionError, APIError, APIPromise, APITimeoutError, APIUserAbortError, AuthenticationError, BadRequestError, ENV, Image, InternalServerError, LOG_LEVELS, NotFoundError, PermissionDeniedError, RateLimitError, TypeSafeClient, TypeSafeError, UnprocessableEntityError, VERSION, box, choice, image, noul, score, withAssets };

//# sourceMappingURL=index.mjs.map
//#region src/api-promise.d.ts
/** Parsed data with its HTTP response and request ID. */
interface WithResponse<T> {
  /** The parsed response body. */
  data: T;
  /** The HTTP response, with its body consumed by parsing. */
  response: Response;
  /** Request ID from `x-typesafe-request-id`, or `undefined` when absent. */
  requestId: string | undefined;
}
/**
 * A promise for the parsed result with access to the HTTP response.
 *
 * Non-2xx responses reject with an `APIError`, including through `asResponse()`.
 */
declare class APIPromise<T> extends Promise<T> {
  #private;
  constructor(responsePromise: Promise<Response>, parseResponse: (response: Response) => Promise<T>);
  /**
   * Resolves to the raw `Response` without parsing the body. SDK requests buffer the full
   * body under the request timeout before handoff; reading it afterwards is caller-owned.
   * The caller owns the body; don't also `await` the parsed result on the same promise.
   */
  asResponse(): Promise<Response>;
  /** Return the parsed result, HTTP response, and request ID. */
  withResponse(): Promise<WithResponse<T>>;
  /** Transform the parsed result, sharing the HTTP response and a single body parse. */
  map<U>(fn: (data: T) => U): APIPromise<U>;
  override then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2>;
  override catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null): Promise<T | TResult>;
  override finally(onfinally?: (() => void) | null): Promise<T>;
}
//#endregion
//#region src/types.d.ts
/** A JSON-compatible value. */
type JsonValue = string | number | boolean | null | JsonValue[] | {
  [key: string]: JsonValue;
};
/**
 * A JSON-compatible value that may also hold assets, each written as its name in `assets`, or
 * else as its reference.
 */
type ContentValue = string | number | boolean | null | Asset | TextWithAssets | ContentValue[] | {
  [key: string]: ContentValue;
};
/**
 * Text, an asset, a JSON object or array, or `null` for instructions and criteria.
 *
 * Each asset in it is written as its name in `assets`, or else as its reference, and sent
 * with the request.
 */
type EntryType = string | Asset | TextWithAssets | {
  [key: string]: ContentValue;
} | ContentValue[] | null;
/** A criterion description; `null` leaves the label undescribed. */
type Description = EntryType;
/** A yes/no question with optional descriptions for either outcome. */
interface NoulQuestion {
  type: "noul";
  /** The question as text, a JSON object, or an array; optional when `criteria` describes an outcome. */
  instructions?: EntryType;
  /** Descriptions of the yes and no outcomes; at least one is required when `instructions` is omitted or `null`. */
  criteria?: {
    /** Description of the yes outcome. */
    true?: EntryType;
    /** Description of the no outcome. */
    false?: EntryType;
  } | null;
}
/** Labels mapped to descriptions, or `null` for undescribed labels. */
type ChoiceCriteria = {
  [label: string]: Description;
};
/** A question that selects between named alternatives. */
interface ChoiceQuestion<T extends ChoiceCriteria = ChoiceCriteria> {
  type: "choice";
  /** The question as text, a JSON object, or an array; optional or `null`. */
  instructions?: EntryType;
  /** Descriptions of the available outcomes; at least one label is required. */
  criteria: T;
}
/** At least two descriptions indexed by score from zero; `null` leaves a score undescribed. */
type ScoreCriteria = readonly [EntryType, EntryType, ...EntryType[]];
/** A question that assigns a score using an ordered rubric. */
interface ScoreQuestion<T extends ScoreCriteria = ScoreCriteria> {
  type: "score";
  /** The question as text, a JSON object, or an array; optional or `null`. */
  instructions?: EntryType;
  /** Descriptions of the available outcomes. */
  criteria: T;
}
/** A question that locates what its instructions describe in the request's image. */
interface BoxQuestion {
  type: "box";
  /** What to locate, as text, an asset, a JSON object, or an array; optional or `null`. */
  instructions?: EntryType;
}
/** A question identified by its `type` field. */
type Question = NoulQuestion | ScoreQuestion | ChoiceQuestion | BoxQuestion;
/** Questions keyed by the names used to identify their answers. */
interface Questions {
  [name: string]: Question;
}
/** An asset sent with a request under a reference. */
type Asset = Image;
/** A yes/no answer. */
interface NoulResponse {
  readonly type: "noul";
  /** Probability of a yes answer, from zero to one. */
  readonly noul: number;
}
/** A selected label and its probabilities. */
interface ChoiceResponse<T extends ChoiceCriteria = ChoiceCriteria> {
  readonly type: "choice";
  /** The selected label. */
  readonly choice: keyof T & string;
  /** Reported confidence in the selected label. */
  readonly confidence: number;
  /** Probabilities keyed by label. */
  readonly probabilities: { readonly [label in keyof T]: number; };
}
/** Score keys inferred from the rubric; a fixed-length tuple yields its indices, otherwise `number`. */
type ScoreOf<T extends ScoreCriteria> = number extends T["length"] ? number : Extract<keyof T, `${number}`>;
/** Content as the API returns it, with assets and `withAssets` text written as strings. */
type SentContent<T> = T extends Asset | TextWithAssets ? string : T extends object ? { readonly [key in keyof T]: SentContent<T[key]>; } : T;
/** Rubric descriptions keyed by score. */
type ScoreLegend<T extends ScoreCriteria> = { readonly [score in ScoreOf<T>]: SentContent<T[score]>; };
/** An expected score with its rubric and probabilities. */
interface ScoreResponse<T extends ScoreCriteria = ScoreCriteria> {
  readonly type: "score";
  /** Expected score, which may fall between integer rubric levels. */
  readonly score: number;
  /** Reported confidence in the score. */
  readonly confidence: number;
  /** Rubric descriptions keyed by score. */
  readonly legend: ScoreLegend<T>;
  /** Probabilities keyed by score. */
  readonly probabilities: { readonly [score in ScoreOf<T>]: number; };
}
/** A box's edges as fractions of the image's height (`top`, `bottom`) and width (`left`, `right`). */
interface BoxCoordinates {
  /** Top edge, as a fraction of image height from the top, from zero to one. */
  readonly top: number;
  /** Bottom edge, as a fraction of image height from the top, from zero to one. */
  readonly bottom: number;
  /** Left edge, as a fraction of image width from the left, from zero to one. */
  readonly left: number;
  /** Right edge, as a fraction of image width from the left, from zero to one. */
  readonly right: number;
}
/** The answer to a `box` question. */
interface BoxResponse {
  readonly type: "box";
  /** Where the instructions' subject is in the image. */
  readonly box: BoxCoordinates;
  /** Confidence in the box, from zero to one, or `null` when the API didn't report it. */
  readonly confidence: number | null;
}
/** The answer type for a question, preserving its criteria keys. */
type ResultFor<T extends Question> = T extends NoulQuestion ? NoulResponse : T extends ScoreQuestion<infer S> ? ScoreResponse<S> : T extends ChoiceQuestion<infer E> ? ChoiceResponse<E> : T extends BoxQuestion ? BoxResponse : never;
/** Token usage for a request. */
interface Usage {
  /** Number of input tokens used, or `null` when the API did not report it. */
  readonly input_tokens: number | null;
  /** Number of output tokens used, or `null` when the API did not report it. */
  readonly output_tokens: number | null;
}
/** Answers keyed by question name, with model and usage metadata. */
interface SystemOneResult<Q extends Questions> {
  /** The model used to answer the request. */
  readonly model: string;
  /** Answers with types inferred from the supplied questions. */
  readonly answers: { readonly [K in keyof Q]: ResultFor<Q[K]>; };
  /** Token usage for the request. */
  readonly usage: Usage;
}
/** Metadata for an available model. */
interface ModelCard {
  readonly name: string;
  readonly description: string;
  readonly release_date: string;
}
/**
 * State and named questions for `systemOne`.
 *
 * Additional properties on a request variable are forwarded, including `null` values.
 */
interface SystemOneRequest<Q extends Questions = Questions> {
  /** Text, an asset, a JSON object, or an array to evaluate. */
  state: NonNullable<EntryType>;
  /** Nonempty questions keyed by the names used to identify their answers. */
  questions: Q;
  /** Model override; omitted values inherit `defaultModel`. */
  model?: string;
  /**
   * References mapped to assets, for referencing assets by name.
   *
   * References are matched literally in string values within `state`, question instructions,
   * or criteria. Use distinct delimiters (such as `<photo>`) to avoid matching ordinary text.
   * Assets placed directly in `state` or question content, or in `withAssets` text, are sent
   * without being listed here. Every name must appear in the request; otherwise the call
   * rejects before sending.
   */
  assets?: Record<string, Asset>;
}
/** Retry configuration. Partial overrides inherit unset fields from the client or SDK defaults. */
interface RetryPolicy {
  /** Maximum retries after the initial attempt; `0` disables retries. Default: 2. */
  readonly maxRetries: number;
  /** First backoff delay in milliseconds, doubled up to `backoffMaxMs`. Default: 500. */
  readonly backoffInitialMs: number;
  /** Maximum backoff delay in milliseconds. Default: 5000. */
  readonly backoffMaxMs: number;
  /** Fraction of each backoff delay randomly subtracted, from 0 to 1. Default: 0.25. */
  readonly backoffJitter: number;
  /** HTTP status codes to retry. Default: 408, 429, and 500–599. */
  readonly httpStatuses: ReadonlySet<number>;
  /** Honor `Retry-After` and `retry-after-ms` up to `maxRetryAfterMs`. Default: true. */
  readonly respectRetryAfter: boolean;
  /** Maximum server retry delay in milliseconds; longer delays use backoff. Default: 60000. */
  readonly maxRetryAfterMs: number;
  /** Retry connection failures, including interrupted response bodies (`APIConnectionError`). Default: true. */
  readonly apiConnectionError: boolean;
  /** Whether to retry `APITimeoutError`. Default: true. */
  readonly apiTimeoutError: boolean;
}
/** Per-call options that override client settings. */
interface RequestOptions {
  /** Cancellation signal for the request and pending retries. */
  signal?: AbortSignal;
  /** Timeout per attempt in milliseconds; there is no total retry budget. */
  timeout?: number;
  /** Retry overrides for this call; omitted fields inherit client settings. */
  retry?: Partial<RetryPolicy>;
  /** Additional headers, merged over `defaultHeaders`. */
  headers?: Record<string, string>;
}
/** HTTP fetch implementation compatible with the global `fetch`. */
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
/** Request body compression: `"zstd"`, or `false` to send bodies uncompressed. */
type Compression = "zstd" | false;
/** Log verbosity; `off` disables logging. */
type LogLevel = "debug" | "info" | "warn" | "error" | "off";
/** Log methods accepting a message and structured values; compatible with `console`. */
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
/** Client options. Explicit values take precedence over environment variables, then SDK defaults. */
interface TypeSafeClientConfig {
  /** Required API key; falls back to `TYPESAFE_API_KEY`. */
  apiKey?: string;
  /** API root; falls back to `TYPESAFE_BASE_URL`, then `https://api.typesafe.ai`. */
  baseURL?: string;
  /** Default model; falls back to `TYPESAFE_DEFAULT_MODEL`, then `jev-latest`. */
  defaultModel?: string;
  /**
   * Log level; falls back to `TYPESAFE_LOG_LEVEL`, then `warn`.
   * `info` logs request summaries; `debug` adds headers and bodies.
   * Known credential headers are redacted; bodies are not.
   */
  logLevel?: LogLevel;
  /** Logger filtered to `logLevel` and above. Default: prefixed `console`. */
  logger?: Logger;
  /** Retry overrides; omitted fields use the defaults in `RetryPolicy`. */
  retry?: Partial<RetryPolicy>;
  /** Timeout per attempt in milliseconds, without a total retry budget. Default: 10000. */
  timeout?: number;
  /** Additional request headers; per-call headers take precedence. */
  defaultHeaders?: Record<string, string>;
  /**
   * Request body compression, sent as `Content-Encoding`. Default: `"zstd"` on runtimes that
   * have it (Node.js 22.15 or newer), otherwise `false`. Bodies under 1 KiB are always sent
   * uncompressed. Pass `false` to send all bodies uncompressed, for example to an API that
   * doesn't accept compressed requests.
   */
  compression?: Compression;
  /** Allow browser use, exposing the API key to page users. Default: false. */
  dangerouslyAllowBrowser?: boolean;
  /** Custom HTTP fetch implementation for transport configuration or tests. Default: global `fetch`. */
  fetch?: Fetch;
}
//#endregion
//#region src/assets.d.ts
/** A PNG or JPEG image asset, created by `image` or `Image.fromBase64`. */
declare class Image {
  #private;
  readonly type = "image";
  /** The image file bytes, or a `Blob` read when the request is sent. */
  readonly data: Uint8Array | Blob;
  /** @throws {TypeSafeError} `data` is empty or isn't file bytes or a `Blob`. */
  constructor(data: Blob | ArrayBuffer | ArrayBufferView);
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
  static fromBase64(text: string): Image;
  /** The unique reference this image is sent under, for referencing it inside text. */
  toString(): string;
  /** The reference, written by `JSON.stringify` wherever the image appears in a request. */
  toJSON(): string;
}
/** Text from a `withAssets` tagged template, with the assets interpolated into it. */
declare class TextWithAssets {
  /** The text, with each asset replaced by its reference. */
  readonly text: string;
  /** The assets interpolated into the text, including those in nested `withAssets` text. */
  readonly assets: readonly Asset[];
  constructor(text: string, assets: readonly Asset[]);
  toString(): string;
  /** The text, written by `JSON.stringify` wherever this value appears in a request. */
  toJSON(): string;
}
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
declare const image: (data: Blob | ArrayBuffer | ArrayBufferView) => Image;
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
declare const withAssets: {
  (strings: TemplateStringsArray, ...values: readonly unknown[]): TextWithAssets;
  /**
   * Join `values` with `separator`, as `Array.prototype.join` does, and send the assets among
   * them with the text. The result can be passed as content or interpolated into `withAssets`.
   *
   * @param separator - Written between values. Default: `","`.
   *
   * @example
   * ```ts
   * const { answers } = await client.systemOne({
   *   state: withAssets`The seller uploaded ${withAssets.join(uploads, ", ")}.`,
   *   questions: { same: noul("Do the uploads show the same product?") },
   * });
   * ```
   */
  join(values: readonly unknown[], separator?: string): TextWithAssets;
};
//#endregion
//#region src/resources/models.d.ts
/** Access to the Models API resource. */
declare class Models {
  #private;
  constructor(transport: Transport);
  /** List the models available to the account. */
  list(options?: RequestOptions): APIPromise<ModelCard[]>;
}
//#endregion
//#region src/client.d.ts
/**
 * Per-call transport options with an optional JSON body or `MultipartBody`, or a function called
 * at send time that returns a promise for one.
 */
interface RawRequestOptions extends RequestOptions {
  body?: unknown;
}
/** Internal transport interface used by API resources. */
interface Transport {
  request<T>(method: "GET" | "POST", path: string, options?: RawRequestOptions): APIPromise<T>;
  readonly defaultModel: string;
}
/** Client for the TypeSafe AI API. */
declare class TypeSafeClient {
  #private;
  /** API root with trailing slashes removed. */
  readonly baseURL: string;
  /** Model used when a request omits `model`. */
  readonly defaultModel: string;
  /** Configured log verbosity. */
  readonly logLevel: LogLevel;
  /** The configured logger, filtered to `logLevel`. */
  readonly logger: Logger;
  /** Retry settings with constructor overrides applied. */
  readonly retry: RetryPolicy;
  /** Timeout per attempt in milliseconds. */
  readonly timeout: number;
  /** Additional headers sent with each request. */
  readonly defaultHeaders: Readonly<Record<string, string>>;
  /** Request body compression, or `false` when bodies are sent uncompressed. */
  readonly compression: Compression;
  /** HTTP fetch implementation. */
  readonly fetch: Fetch;
  /** The models available to the account. */
  readonly models: Models;
  /**
   * Create a client for the TypeSafe AI API.
   *
   * Explicit options take precedence over environment variables, then SDK defaults.
   * Empty or whitespace-only environment values are ignored.
   *
   * @throws {TypeSafeError} The API key is missing, configuration is invalid, the runtime is
   *   unsupported, or the runtime lacks the requested compression.
   */
  constructor(config?: TypeSafeClientConfig);
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
  systemOne<const Q extends Questions>(request: SystemOneRequest<Q>, options?: RequestOptions): APIPromise<SystemOneResult<Q>>;
  /** Retry eligible failures, logging attempt summaries at `info` and headers and bodies at `debug`. */
  private fetchWithRetries;
  /**
   * One HTTP round trip, including body delivery, with a timeout. The caller's signal and our
   * timer both abort the same controller; we check which fired to choose the error class.
   */
  private attempt;
  /** Wait before retrying; caller cancellation throws `APIUserAbortError`. */
  private backOff;
}
//#endregion
//#region src/env.d.ts
/** Environment variable names for client configuration. Explicit options take precedence. */
declare const ENV: {
  /** Required API key; used when `apiKey` is omitted. */
  readonly apiKey: "TYPESAFE_API_KEY";
  /** API root; defaults to `https://api.typesafe.ai`. */
  readonly baseURL: "TYPESAFE_BASE_URL";
  /** Default model name; defaults to `jev-latest`. */
  readonly defaultModel: "TYPESAFE_DEFAULT_MODEL";
  /** Log level; defaults to `warn`. */
  readonly logLevel: "TYPESAFE_LOG_LEVEL";
};
type EnvVar = (typeof ENV)[keyof typeof ENV];
//#endregion
//#region src/errors.d.ts
/** Base class for SDK errors. */
declare class TypeSafeError extends Error {
  constructor(message: string, options?: ErrorOptions);
}
/** An unsuccessful HTTP response from the API. */
declare class APIError extends TypeSafeError {
  /** HTTP response status code. */
  readonly status: number;
  /** HTTP response headers. */
  readonly headers: Headers;
  /** Parsed JSON, response text, or `undefined` for an empty body. */
  readonly body: unknown;
  /** Request ID from `x-typesafe-request-id`, or `undefined` when absent. */
  readonly requestId: string | undefined;
  constructor(status: number, body: unknown, headers: Headers, message?: string);
  private static describe;
  /** Create the error subclass for an HTTP status code. */
  static fromResponse(status: number, body: unknown, headers: Headers): APIError;
}
/** HTTP 400: the request is invalid. */
declare class BadRequestError extends APIError {}
/** HTTP 401: authentication failed. */
declare class AuthenticationError extends APIError {}
/** HTTP 403: access is denied. */
declare class PermissionDeniedError extends APIError {}
/** HTTP 404: the resource was not found. */
declare class NotFoundError extends APIError {}
/** HTTP 422: request validation failed. */
declare class UnprocessableEntityError extends APIError {}
/** HTTP 429: the rate limit was exceeded. */
declare class RateLimitError extends APIError {
  /** Server retry delay in milliseconds, or `undefined` when absent or invalid. */
  readonly retryAfterMs: number | undefined;
}
/** HTTP 5xx: the server failed to handle the request. */
declare class InternalServerError extends APIError {}
/** The request or response-body delivery failed (DNS, TLS, connection closed, etc.). */
declare class APIConnectionError extends TypeSafeError {
  constructor(message?: string, options?: ErrorOptions);
}
/** The full response did not arrive within the timeout. A kind of `APIConnectionError`. */
declare class APITimeoutError extends APIConnectionError {
  /** Configured timeout in milliseconds. */
  readonly timeoutMs: number;
  constructor(timeoutMs: number, options?: ErrorOptions);
}
/** The caller cancelled the request through an `AbortSignal`. */
declare class APIUserAbortError extends TypeSafeError {
  constructor(message?: string, options?: ErrorOptions);
}
//#endregion
//#region src/logging.d.ts
/** Supported log levels, from most to least verbose. */
declare const LOG_LEVELS: readonly LogLevel[];
//#endregion
//#region src/questions.d.ts
/**
 * Create a yes/no question with optional descriptions for either outcome.
 *
 * @param instructions - The question as text, a JSON object or array; `null` or omitted
 * requires `criteria` to describe at least one outcome.
 * @param criteria - Descriptions of the yes and no outcomes.
 */
declare const noul: {
  (instructions: NonNullable<EntryType>, criteria?: NoulQuestion["criteria"]): NoulQuestion;
  (instructions: EntryType | undefined, criteria: {
    true: NonNullable<EntryType>;
    false?: EntryType;
  } | {
    true?: EntryType;
    false: NonNullable<EntryType>;
  }): NoulQuestion;
};
/**
 * Create a score question using an ordered rubric.
 *
 * @param instructions - The question as text, a JSON object or array, or `null`.
 * @param criteria - At least two descriptions indexed by score from zero; entries may be `null`.
 *   A list built at runtime, such as a `string[]`, is accepted, and `systemOne` rejects it when
 *   it has fewer than two entries.
 */
declare const score$1: {
  <const T extends ScoreCriteria>(instructions: EntryType, criteria: T): ScoreQuestion<T>;
  <const T extends readonly EntryType[]>(instructions: EntryType, criteria: T & (number extends T["length"] ? unknown : never)): ScoreQuestion<readonly [T[number], T[number], ...T[number][]]>;
};
/**
 * Create a question that selects between named alternatives.
 *
 * @param instructions - The question as text, a JSON object or array, or `null`.
 * @param criteria - Labels mapped to descriptions, or `null` for undescribed labels.
 */
declare const choice: <const T extends ChoiceCriteria>(instructions: EntryType, criteria: T) => ChoiceQuestion<T>;
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
declare const box: (instructions?: EntryType) => BoxQuestion;
//#endregion
//#region src/version.d.ts
declare const VERSION = "0.7.0";
//#endregion
export { APIConnectionError, APIError, APIPromise, APITimeoutError, APIUserAbortError, type Asset, AuthenticationError, BadRequestError, type BoxCoordinates, type BoxQuestion, type BoxResponse, type ChoiceCriteria, type ChoiceQuestion, type ChoiceResponse, type Compression, type ContentValue, type Description, ENV, type EntryType, type EnvVar, type Fetch, Image, InternalServerError, type JsonValue, LOG_LEVELS, type LogLevel, type Logger, type ModelCard, type Models, NotFoundError, type NoulQuestion, type NoulResponse, PermissionDeniedError, type Question, type Questions, RateLimitError, type RequestOptions, type ResultFor, type RetryPolicy, type ScoreCriteria, type ScoreLegend, type ScoreOf, type ScoreQuestion, type ScoreResponse, type SentContent, type SystemOneRequest, type SystemOneResult, type TextWithAssets, TypeSafeClient, type TypeSafeClientConfig, TypeSafeError, UnprocessableEntityError, type Usage, VERSION, type WithResponse, box, choice, image, noul, score$1 as score, withAssets };
//# sourceMappingURL=index.d.mts.map
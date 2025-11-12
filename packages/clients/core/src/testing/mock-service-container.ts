import type {
	AbortControllerFactory,
	AbortControllerLike,
	AbortSignalLike,
} from "../services/abort-controller-service";
import type { ChecksumService } from "../services/checksum-service";
import type {
	Base64Service,
	FileReaderService,
	FileSource,
	SliceResult,
} from "../services/file-reader-service";
import type { FingerprintService } from "../services/fingerprint-service";
import type {
	ConnectionMetrics,
	DetailedConnectionMetrics,
	HeadersLike,
	HttpClient,
	HttpRequestOptions,
	HttpResponse,
} from "../services/http-client";
import type { IdGenerationService } from "../services/id-generation-service";
import type { PlatformService } from "../services/platform-service";
import type { ServiceContainer } from "../services/service-container";
import type { StorageService } from "../services/storage-service";
import type {
	WebSocketFactory,
	WebSocketLike,
} from "../services/websocket-service";

/**
 * Mock HTTP response configuration for testing
 */
export interface MockHttpResponseConfig {
	status?: number;
	statusText?: string;
	headers?: Record<string, string>;
	body?: unknown;
	delay?: number;
}

/**
 * Mock HTTP client for testing upload logic without actual network calls
 *
 * Allows configuring responses for specific URLs and methods, with support
 * for delays to simulate network latency.
 *
 * @example Basic usage
 * ```typescript
 * const httpClient = new MockHttpClient();
 * httpClient.mockResponse('https://api.example.com/upload', {
 *   status: 200,
 *   body: { uploadId: 'abc123' }
 * });
 * ```
 */
export class MockHttpClient implements HttpClient {
	private responses = new Map<string, MockHttpResponseConfig>();
	private defaultResponse: MockHttpResponseConfig = {
		status: 200,
		statusText: "OK",
		body: {},
	};
	private requestLog: Array<{ url: string; options?: HttpRequestOptions }> = [];

	/**
	 * Configure a mock response for a specific URL
	 */
	mockResponse(url: string, config: MockHttpResponseConfig): void {
		this.responses.set(url, config);
	}

	/**
	 * Set the default response for unmocked URLs
	 */
	setDefaultResponse(config: MockHttpResponseConfig): void {
		this.defaultResponse = config;
	}

	/**
	 * Get the log of all requests made
	 */
	getRequestLog(): Array<{ url: string; options?: HttpRequestOptions }> {
		return [...this.requestLog];
	}

	/**
	 * Clear the request log
	 */
	clearRequestLog(): void {
		this.requestLog = [];
	}

	async request(
		url: string,
		options?: HttpRequestOptions,
	): Promise<HttpResponse> {
		// Log the request
		this.requestLog.push({ url, options });

		// Get the configured response or use default
		const config = this.responses.get(url) || this.defaultResponse;

		// Simulate network delay if configured
		if (config.delay) {
			await new Promise((resolve) => setTimeout(resolve, config.delay));
		}

		// Create mock headers
		const headers: HeadersLike = {
			get: (name: string) => config.headers?.[name] ?? null,
			has: (name: string) => config.headers?.[name] !== undefined,
			forEach: (callback: (value: string, name: string) => void) => {
				if (config.headers) {
					for (const [key, value] of Object.entries(config.headers)) {
						callback(value, key);
					}
				}
			},
		};

		// Create mock response
		const status = config.status ?? 200;
		const response: HttpResponse = {
			status,
			statusText: config.statusText ?? "OK",
			headers,
			ok: status >= 200 && status < 300,
			json: async () => config.body,
			text: async () =>
				typeof config.body === "string"
					? config.body
					: JSON.stringify(config.body),
			arrayBuffer: async () => {
				const text =
					typeof config.body === "string"
						? config.body
						: JSON.stringify(config.body);
				return new TextEncoder().encode(text).buffer;
			},
		};

		return response;
	}

	getMetrics(): ConnectionMetrics {
		return {
			activeConnections: 0,
			totalConnections: this.requestLog.length,
			reuseRate: 0,
			averageConnectionTime: 0,
		};
	}

	getDetailedMetrics(): DetailedConnectionMetrics {
		return {
			activeConnections: 0,
			totalConnections: this.requestLog.length,
			reuseRate: 0,
			averageConnectionTime: 0,
			idleConnections: 0,
			errors: 0,
			timeouts: 0,
			retries: 0,
			fastConnections: this.requestLog.length,
			slowConnections: 0,
			http2Info: {
				supported: false,
				enabled: false,
				activeStreams: 0,
			},
		};
	}

	reset(): void {
		this.requestLog = [];
		this.responses.clear();
	}

	async close(): Promise<void> {
		// No-op for mock
	}

	async warmupConnections(_urls: string[]): Promise<void> {
		// No-op for mock
	}
}

/**
 * Mock storage service for testing without actual persistent storage
 *
 * Uses in-memory storage that can be inspected and manipulated for testing.
 */
export class MockStorageService implements StorageService {
	private storage = new Map<string, string>();

	async getItem(key: string): Promise<string | null> {
		return this.storage.get(key) ?? null;
	}

	async setItem(key: string, value: string): Promise<void> {
		this.storage.set(key, value);
	}

	async removeItem(key: string): Promise<void> {
		this.storage.delete(key);
	}

	async findAll(): Promise<Record<string, string>> {
		const result: Record<string, string> = {};
		for (const [key, value] of this.storage.entries()) {
			result[key] = value;
		}
		return result;
	}

	async find(prefix: string): Promise<Record<string, string>> {
		const result: Record<string, string> = {};
		for (const [key, value] of this.storage.entries()) {
			if (key.startsWith(prefix)) {
				result[key] = value;
			}
		}
		return result;
	}

	/**
	 * Get the current storage state for inspection
	 */
	getStorageState(): Map<string, string> {
		return new Map(this.storage);
	}

	/**
	 * Clear all storage
	 */
	clear(): void {
		this.storage.clear();
	}
}

/**
 * Mock file reader service for testing file operations
 *
 * Accepts either File/Blob objects or mock file data (Uint8Array).
 */
export class MockFileReaderService<UploadInput = unknown>
	implements FileReaderService<UploadInput>
{
	async openFile(
		input: UploadInput,
		_chunkSize: number,
	): Promise<FileSource> {
		// Handle File/Blob objects
		if (input instanceof Blob || (input && typeof input === "object" && "size" in input)) {
			const file = input as Blob & { name?: string; lastModified?: number };
			return {
				input,
				size: file.size,
				name: "name" in file && typeof file.name === "string" ? file.name : null,
				type: file.type || null,
				lastModified:
					"lastModified" in file && typeof file.lastModified === "number"
						? file.lastModified
						: null,
				slice: async (start: number, end: number): Promise<SliceResult> => {
					if (start >= file.size) {
						return { done: true, value: null, size: null };
					}
					const blob = file.slice(start, end);
					const arrayBuffer = await blob.arrayBuffer();
					const chunk = new Uint8Array(arrayBuffer);
					return { done: false, value: chunk, size: chunk.length };
				},
				close: () => {
					// No-op for Blob
				},
			};
		}

		// Handle Uint8Array for testing
		if (input instanceof Uint8Array) {
			const data = input;
			return {
				input,
				size: data.length,
				name: "test-file.bin",
				type: "application/octet-stream",
				lastModified: Date.now(),
				slice: async (start: number, end: number): Promise<SliceResult> => {
					if (start >= data.length) {
						return { done: true, value: null, size: null };
					}
					const chunk = data.slice(start, end);
					return { done: false, value: chunk, size: chunk.length };
				},
				close: () => {
					// No-op for Uint8Array
				},
			};
		}

		// Fallback for unknown types
		throw new Error(
			`MockFileReaderService: Unsupported input type: ${typeof input}`,
		);
	}
}

/**
 * Mock abort controller for testing cancellation
 */
export class MockAbortController implements AbortControllerLike {
	private _aborted = false;
	private listeners: Array<() => void> = [];

	get signal(): AbortSignalLike {
		return {
			aborted: this._aborted,
			addEventListener: (_event: string, listener: () => void) => {
				this.listeners.push(listener);
			},
			removeEventListener: (_event: string, listener: () => void) => {
				const index = this.listeners.indexOf(listener);
				if (index !== -1) {
					this.listeners.splice(index, 1);
				}
			},
		};
	}

	abort(): void {
		this._aborted = true;
		for (const listener of this.listeners) {
			listener();
		}
	}
}

/**
 * Mock abort controller factory
 */
export class MockAbortControllerFactory implements AbortControllerFactory {
	create(): AbortControllerLike {
		return new MockAbortController();
	}
}

/**
 * Mock WebSocket for testing real-time events
 */
export class MockWebSocket implements WebSocketLike {
	readyState = 0; // CONNECTING
	private messageHandlers: Array<(event: { data: string }) => void> = [];
	private openHandlers: Array<() => void> = [];
	private errorHandlers: Array<(error: Error) => void> = [];
	private closeHandlers: Array<() => void> = [];

	constructor(public url: string) {
		// Simulate connection opening after a short delay
		setTimeout(() => {
			this.readyState = 1; // OPEN
			for (const handler of this.openHandlers) {
				handler();
			}
		}, 10);
	}

	send(data: string): void {
		if (this.readyState !== 1) {
			throw new Error("WebSocket is not open");
		}
		// Mock implementation - in tests, you can override this
	}

	close(): void {
		this.readyState = 3; // CLOSED
		for (const handler of this.closeHandlers) {
			handler();
		}
	}

	addEventListener(event: string, handler: (...args: unknown[]) => void): void {
		if (event === "message") {
			this.messageHandlers.push(handler as (event: { data: string }) => void);
		} else if (event === "open") {
			this.openHandlers.push(handler as () => void);
		} else if (event === "error") {
			this.errorHandlers.push(handler as (error: Error) => void);
		} else if (event === "close") {
			this.closeHandlers.push(handler as () => void);
		}
	}

	removeEventListener(
		event: string,
		handler: (...args: unknown[]) => void,
	): void {
		if (event === "message") {
			const index = this.messageHandlers.indexOf(
				handler as (event: { data: string }) => void,
			);
			if (index !== -1) this.messageHandlers.splice(index, 1);
		} else if (event === "open") {
			const index = this.openHandlers.indexOf(handler as () => void);
			if (index !== -1) this.openHandlers.splice(index, 1);
		} else if (event === "error") {
			const index = this.errorHandlers.indexOf(
				handler as (error: Error) => void,
			);
			if (index !== -1) this.errorHandlers.splice(index, 1);
		} else if (event === "close") {
			const index = this.closeHandlers.indexOf(handler as () => void);
			if (index !== -1) this.closeHandlers.splice(index, 1);
		}
	}

	/**
	 * Simulate receiving a message (for testing)
	 */
	simulateMessage(data: string): void {
		if (this.readyState === 1) {
			for (const handler of this.messageHandlers) {
				handler({ data });
			}
		}
	}

	/**
	 * Simulate an error (for testing)
	 */
	simulateError(error: Error): void {
		for (const handler of this.errorHandlers) {
			handler(error);
		}
	}
}

/**
 * Mock WebSocket factory
 */
export class MockWebSocketFactory implements WebSocketFactory {
	create(url: string): WebSocketLike {
		return new MockWebSocket(url);
	}
}

/**
 * Mock platform service
 */
export class MockPlatformService implements PlatformService {
	constructor(
		private browser = true,
		private node = false,
	) {}

	isBrowser(): boolean {
		return this.browser;
	}

	isNode(): boolean {
		return this.node;
	}

	isReactNative(): boolean {
		return !this.browser && !this.node;
	}
}

/**
 * Mock checksum service
 */
export class MockChecksumService implements ChecksumService {
	async computeChecksum(_data: Uint8Array): Promise<string> {
		// Return a mock checksum
		return "mock-checksum-" + Math.random().toString(36).substring(7);
	}
}

/**
 * Mock fingerprint service
 */
export class MockFingerprintService<UploadInput>
	implements FingerprintService<UploadInput>
{
	async computeFingerprint(_input: UploadInput): Promise<string> {
		// Return a mock fingerprint
		return "mock-fingerprint-" + Math.random().toString(36).substring(7);
	}
}

/**
 * Mock ID generation service
 */
export class MockIdGenerationService implements IdGenerationService {
	private counter = 0;

	generateId(): string {
		return `mock-id-${++this.counter}`;
	}

	generateUploadId(): string {
		return `mock-upload-${++this.counter}`;
	}
}

/**
 * Mock base64 service
 */
export class MockBase64Service implements Base64Service {
	toBase64(data: ArrayBuffer): string {
		// Simple mock implementation
		const bytes = new Uint8Array(data);
		let binary = "";
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	fromBase64(data: string): ArrayBuffer {
		const binary = atob(data);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}
}

/**
 * Create a complete mock service container for testing
 *
 * @example
 * ```typescript
 * const services = createMockServiceContainer();
 * const client = createUploadistaClient({
 *   apiUrl: 'https://api.example.com',
 *   services,
 * });
 * ```
 */
export function createMockServiceContainer<
	UploadInput = unknown,
>(): ServiceContainer<UploadInput> {
	return {
		storage: new MockStorageService(),
		idGeneration: new MockIdGenerationService(),
		httpClient: new MockHttpClient(),
		fileReader: new MockFileReaderService<UploadInput>(),
		base64: new MockBase64Service(),
		websocket: new MockWebSocketFactory(),
		abortController: new MockAbortControllerFactory(),
		platform: new MockPlatformService(),
		checksumService: new MockChecksumService(),
		fingerprintService: new MockFingerprintService<UploadInput>(),
	};
}

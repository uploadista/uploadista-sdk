import { UploadistaError } from "@uploadista/core/errors";
import {
  CredentialProvider as CredentialProviderService,
  type DocumentAiContext,
  DocumentAiPlugin,
  type OcrResult,
} from "@uploadista/core/flow";
import { Effect, Layer, Option } from "effect";
import Replicate from "replicate";

type ModelId = `${string}/${string}` | `${string}/${string}:${string}`;

type ReplicateCredentials = {
  apiKey: string;
};

// Credential provider function type
type CredentialProvider = (
  context: DocumentAiContext & { serviceType: "replicate" },
) => Effect.Effect<ReplicateCredentials, UploadistaError>;

// Plugin configuration can be either a static API key or options with credential provider or service
type PluginConfig =
  | string
  | {
      credentialProvider?: CredentialProvider;
      useCredentialProviderService?: boolean;
      ocrModelId?: ModelId;
    };

/**
 * Map OcrTaskType to Replicate model task type
 */
function mapTaskType(taskType: string): string {
  switch (taskType) {
    case "convertToMarkdown":
      return "Convert to Markdown";
    case "freeOcr":
      return "Free OCR";
    case "parseFigure":
      return "Parse Figure";
    case "locateObject":
      return "Locate Object by Reference";
    default:
      return "Convert to Markdown";
  }
}

/**
 * Map OcrResolution to Replicate resolution parameter
 */
function mapResolution(resolution?: string): string {
  switch (resolution) {
    case "tiny":
      return "Tiny";
    case "small":
      return "Small";
    case "base":
      return "Base";
    case "gundam":
      return "Gundam (Recommended)";
    case "large":
      return "Large";
    default:
      return "Gundam (Recommended)";
  }
}

/**
 * Determine format based on task type
 */
function getFormatFromTaskType(taskType: string): "markdown" | "plain" | "structured" {
  switch (taskType) {
    case "convertToMarkdown":
      return "markdown";
    case "parseFigure":
      return "structured";
    default:
      return "plain";
  }
}

/**
 * Create the Replicate DocumentAI plugin
 * Supports both static credentials (OSS) and dynamic credential providers (UploadistaCloud)
 *
 * @example
 * // Static credentials (OSS)
 * documentAiPlugin(process.env.REPLICATE_API_TOKEN)
 *
 * @example
 * // Dynamic credentials with function (UploadistaCloud)
 * documentAiPlugin({
 *   credentialProvider: (context) => Effect.succeed({ apiKey: "..." })
 * })
 *
 * @example
 * // Dynamic credentials with Effect service (UploadistaCloud)
 * documentAiPlugin({
 *   useCredentialProviderService: true
 * })
 */
export const documentAiPlugin = (
  config: PluginConfig,
  options?: {
    ocrModelId?: ModelId;
  },
) => {
  // Parse configuration
  const isStatic = typeof config === "string";
  const staticApiKey = isStatic ? config : null;
  const credentialProvider = isStatic ? null : config.credentialProvider;
  const useCredentialProviderService = isStatic
    ? false
    : config.useCredentialProviderService;

  // Model ID for DeepSeek-OCR
  const ocrModelId =
    (isStatic ? options?.ocrModelId : config.ocrModelId) ||
    "lucataco/deepseek-ocr:0080ec8faf4da6a14afb8502e96f5bb53afbc28b40e2d4a5e17945b8f69eb863";

  // Helper to get API token (either static, from provider function, or from service)
  const getApiToken = (context: DocumentAiContext) => {
    if (staticApiKey) {
      return Effect.succeed(staticApiKey);
    }
    if (useCredentialProviderService) {
      return Effect.gen(function* () {
        const credentialProviderService = yield* Effect.serviceOption(
          CredentialProviderService,
        );

        if (Option.isNone(credentialProviderService)) {
          return yield* Effect.fail(
            UploadistaError.fromCode("UNKNOWN_ERROR", {
              cause: new Error("Credential provider service not found"),
            }),
          );
        }

        const credentials =
          yield* credentialProviderService.value.getCredential({
            clientId: context.clientId,
            serviceType: "replicate",
          });

        if (
          typeof credentials === "object" &&
          credentials !== null &&
          "apiKey" in credentials &&
          typeof credentials.apiKey === "string"
        ) {
          return credentials.apiKey;
        }

        return yield* Effect.fail(
          UploadistaError.fromCode("UNKNOWN_ERROR", {
            cause: new Error("Invalid credential format from service"),
          }),
        );
      });
    }
    if (credentialProvider) {
      return Effect.gen(function* () {
        const credentials = yield* credentialProvider({
          ...context,
          serviceType: "replicate",
        });
        return credentials.apiKey;
      });
    }
    return Effect.fail(
      UploadistaError.fromCode("UNKNOWN_ERROR", {
        cause: new Error("No API credentials configured"),
      }),
    );
  };

  return Layer.succeed(
    DocumentAiPlugin,
    DocumentAiPlugin.of({
      performOCR: (inputUrl, params, context) => {
        return Effect.gen(function* () {
          // Get API token (static or from credential provider)
          const apiToken = yield* getApiToken(context);

          yield* Effect.logInfo(
            `Starting OCR for document with task type: ${params.taskType}`
          );

          const output = yield* Effect.tryPromise({
            try: async () => {
              const replicate = new Replicate({
                auth: apiToken,
              });

              const input: Record<string, unknown> = {
                image: inputUrl,
                task_type: mapTaskType(params.taskType),
                resolution_size: mapResolution(params.resolution),
              };

              // Add reference text if provided and task type is locateObject
              if (params.taskType === "locateObject" && params.referenceText) {
                input.reference_text = params.referenceText;
              }

              const result = await replicate.run(ocrModelId, {
                input,
              });

              return result;
            },
            catch: (error) => {
              const errorMessage = error instanceof Error ? error.message : String(error);

              return UploadistaError.fromCode("OCR_FAILED", {
                cause: errorMessage,
              });
            },
          }).pipe(
            Effect.tapError((error) =>
              Effect.logError(`OCR failed: ${error instanceof UploadistaError ? error.cause : String(error)}`)
            )
          );

          // Extract text from the result
          // Replicate OCR typically returns a string or an object with text
          let extractedText: string;

          if (typeof output === "string") {
            extractedText = output;
          } else if (
            typeof output === "object" &&
            output !== null &&
            "text" in output &&
            typeof output.text === "string"
          ) {
            extractedText = output.text;
          } else {
            // Try to stringify if it's a different format
            extractedText = JSON.stringify(output);
          }

          yield* Effect.logInfo(`OCR completed, extracted ${extractedText.length} characters`);

          const result: OcrResult = {
            extractedText,
            format: getFormatFromTaskType(params.taskType),
          };

          return result;
        });
      },
    })
  );
};

// Export live layer with credential provider service
export const ReplicateDocumentAiPluginLive = documentAiPlugin({
  useCredentialProviderService: true,
});

// Export factory function for custom configuration
export const createReplicateDocumentAiPlugin = documentAiPlugin;

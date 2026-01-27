import { UploadistaError } from "@uploadista/core/errors";
import {
  CredentialProvider as CredentialProviderService,
  type ImageAiContext,
  ImageAiPlugin,
} from "@uploadista/core/flow";
import { withOperationSpan } from "@uploadista/observability";
import { Effect, Layer, Option } from "effect";
import Replicate from "replicate";

type ModelId = `${string}/${string}` | `${string}/${string}:${string}`;

type RemoveBackgroundOutput = {
  url: () => string;
};

type ReplicateCredentials = {
  apiKey: string;
};

// Credential provider function type
type CredentialProvider = (
  context: ImageAiContext & { serviceType: "replicate" },
) => Effect.Effect<ReplicateCredentials, UploadistaError>;

// Plugin configuration can be either a static API key or options with credential provider or service
type PluginConfig =
  | string
  | {
      credentialProvider?: CredentialProvider;
      useCredentialProviderService?: boolean;
      removeBackgroundModelId?: ModelId;
      describeImageModelId?: ModelId;
    };

/**
 * Create the Replicate ImageAI plugin
 * Supports both static credentials (OSS) and dynamic credential providers (UploadistaCloud)
 *
 * @example
 * // Static credentials (OSS)
 * imageAiPlugin(process.env.REPLICATE_API_TOKEN)
 *
 * @example
 * // Dynamic credentials with function (UploadistaCloud)
 * imageAiPlugin({
 *   credentialProvider: (context) => Effect.succeed({ apiKey: "..." })
 * })
 *
 * @example
 * // Dynamic credentials with Effect service (UploadistaCloud)
 * imageAiPlugin({
 *   useCredentialProviderService: true
 * })
 */
export const imageAiPlugin = (
  config: PluginConfig,
  options?: {
    removeBackgroundModelId?: ModelId;
    describeImageModelId?: ModelId;
  },
) => {
  // Parse configuration
  const isStatic = typeof config === "string";
  const staticApiKey = isStatic ? config : null;
  const credentialProvider = isStatic ? null : config.credentialProvider;
  const useCredentialProviderService = isStatic
    ? false
    : config.useCredentialProviderService;

  // Model IDs can come from either the config object or the options parameter
  const removeBackgroundModelId =
    (isStatic
      ? options?.removeBackgroundModelId
      : config.removeBackgroundModelId) ||
    "lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1";
  const describeImageModelId =
    (isStatic ? options?.describeImageModelId : config.describeImageModelId) ||
    "zsxkib/blip-3:499bec581d8f64060fd695ec0c34d7595c6824c4118259aa8b0788e0d2d903e1";

  // Helper to get API token (either static, from provider function, or from service)
  const getApiToken = (context: ImageAiContext) => {
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
        } else {
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
    ImageAiPlugin,
    ImageAiPlugin.of({
      removeBackground: (inputUrl, context) => {
        return Effect.gen(function* () {
          // Get API token (static or from credential provider)
          const apiToken = yield* getApiToken(context);

          const output = yield* Effect.tryPromise({
            try: async () => {
              const replicate = new Replicate({
                auth: apiToken,
              });

              const input = {
                image: inputUrl,
              };

              console.log("input", input);

              return (await replicate.run(removeBackgroundModelId, {
                input,
              })) as RemoveBackgroundOutput;
            },
            catch: (error) => {
              console.log("error", error);
              return UploadistaError.fromCode("UNKNOWN_ERROR", {
                cause: error,
              });
            },
          });
          return { outputUrl: output.url() };
        }).pipe(
          withOperationSpan("ai", "remove-background", {
            "ai.provider": "replicate",
            "ai.model": removeBackgroundModelId,
            "ai.client_id": context.clientId,
          }),
        );
      },
      describeImage: (inputUrl, context) => {
        return Effect.gen(function* () {
          // Get API token (static or from credential provider)
          const apiToken = yield* getApiToken(context);

          yield* Effect.logInfo(
            `[Replicate describeImage] Starting with URL: ${inputUrl}`,
          );

          const output = yield* Effect.tryPromise({
            try: async () => {
              const replicate = new Replicate({
                auth: apiToken,
              });

              console.log(
                "[Replicate describeImage] Calling Replicate API with model:",
                describeImageModelId,
              );

              const result = await replicate.run(describeImageModelId, {
                input: {
                  image: inputUrl,
                  top_k: 50,
                  top_p: 1,
                  caption: false,
                  question: "What is shown in the image?",
                  do_sample: false,
                  num_beams: 1,
                  temperature: 1,
                  system_prompt:
                    "A chat between a curious user and an artificial intelligence assistant. The assistant gives helpful, detailed, and polite answers to the user's questions.",
                  length_penalty: 1,
                  max_new_tokens: 768,
                  repetition_penalty: 1,
                },
              });

              console.log(
                "[Replicate describeImage] Raw result type:",
                typeof result,
              );
              console.log(
                "[Replicate describeImage] Raw result:",
                JSON.stringify(result, null, 2),
              );

              // Handle different response formats from Replicate
              // Some models return arrays, some return strings directly
              let description: string;
              if (typeof result === "string") {
                description = result;
              } else if (Array.isArray(result) && result.length > 0) {
                // Some models return output as an array
                description =
                  typeof result[0] === "string" ? result[0] : String(result[0]);
              } else if (result != null) {
                // Fallback: stringify the result
                console.log(
                  "[Replicate describeImage] Fallback: result is not string or array, stringifying",
                );
                description = String(result);
              } else {
                console.error(
                  "[Replicate describeImage] ERROR: result is null or undefined",
                );
                throw new Error(
                  `Replicate returned empty or undefined response for image description. Result was: ${result}`,
                );
              }

              console.log(
                "[Replicate describeImage] Final description:",
                description.substring(0, 100),
              );
              return description;
            },
            catch: (error) => {
              console.error("[Replicate describeImage] Caught error:", error);
              return UploadistaError.fromCode("UNKNOWN_ERROR", {
                cause: error,
              });
            },
          });
          return { description: output };
        }).pipe(
          withOperationSpan("ai", "describe-image", {
            "ai.provider": "replicate",
            "ai.model": describeImageModelId,
            "ai.client_id": context.clientId,
          }),
        );
      },
    }),
  );
};

import { Context, Effect, Layer } from "effect";

export type GenerateIdShape = {
  generateId: () => Effect.Effect<string>;
};

// Declaring a tag for a service that generates random id
export class GenerateId extends Context.Tag("UploadistaGenerateIdService")<
  GenerateId,
  { readonly generateId: () => Effect.Effect<string> }
>() {}

/**
 * Effect-based ID generation services
 */
export const GenerateIdService = GenerateId.Service;

/**
 * Generates a random UUID using Effect
 * @returns Effect that produces a random UUID string
 */
export const GenerateIdRandom = GenerateId.of({
  generateId: () => Effect.succeed(crypto.randomUUID()),
});

export const GenerateIdLive = Layer.succeed(GenerateId, GenerateIdRandom);

/**
 * Generates a timestamp-based ID using Effect
 * @returns Effect that produces a timestamp-based ID
 */
export const GenerateIdTimestamp = GenerateId.of({
  generateId: () =>
    Effect.succeed(`${Date.now()}-${Math.random().toString(36).slice(2, 11)}`),
});

import { Context, type Effect } from "effect";
import type { UploadistaError } from "@/errors";

// Define the credential provider service shape
export interface CredentialProviderShape {
  getCredential: (params: {
    clientId: string | null;
    serviceType?: string;
  }) => Effect.Effect<Record<string, unknown>, UploadistaError>;
}

// Create the service tag
export class CredentialProvider extends Context.Tag("CredentialProvider")<
  CredentialProvider,
  CredentialProviderShape
>() {}

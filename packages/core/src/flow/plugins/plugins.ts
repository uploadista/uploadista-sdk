import type {
  CredentialProvider,
  CredentialProviderLayer,
} from "./credential-provider";
import type { ImageAiPlugin, ImageAiPluginLayer } from "./image-ai-plugin";
import type { ImagePlugin, ImagePluginLayer } from "./image-plugin";
import type { ZipPlugin, ZipPluginLayer } from "./zip-plugin";

export type Plugin =
  | ImagePlugin
  | ImageAiPlugin
  | CredentialProvider
  | ZipPlugin;

export type PluginLayer =
  | ImagePluginLayer
  | ImageAiPluginLayer
  | CredentialProviderLayer
  | ZipPluginLayer;

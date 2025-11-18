import type {
  CredentialProvider,
  CredentialProviderLayer,
} from "./credential-provider";
import type {
  DocumentAiPlugin,
  DocumentAiPluginLayer,
} from "./document-ai-plugin";
import type { DocumentPlugin, DocumentPluginLayer } from "./document-plugin";
import type { ImageAiPlugin, ImageAiPluginLayer } from "./image-ai-plugin";
import type { ImagePlugin, ImagePluginLayer } from "./image-plugin";
import type { VideoPlugin, VideoPluginLayer } from "./video-plugin";
import type {
  VirusScanPlugin,
  VirusScanPluginLayer,
} from "./virus-scan-plugin";
import type { ZipPlugin, ZipPluginLayer } from "./zip-plugin";

export type Plugin =
  | ImagePlugin
  | ImageAiPlugin
  | VideoPlugin
  | DocumentPlugin
  | DocumentAiPlugin
  | VirusScanPlugin
  | CredentialProvider
  | ZipPlugin;

export type PluginLayer =
  | ImagePluginLayer
  | ImageAiPluginLayer
  | VideoPluginLayer
  | DocumentPluginLayer
  | DocumentAiPluginLayer
  | VirusScanPluginLayer
  | CredentialProviderLayer
  | ZipPluginLayer;

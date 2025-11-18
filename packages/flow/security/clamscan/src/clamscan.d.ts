// Type declarations for clamscan npm package
declare module "clamscan" {
  interface ClamScanOptions {
    preference?: "clamdscan" | "clamscan";
    remove_infected?: boolean;
    debug_mode?: boolean;
    clamdscan?: {
      socket?: string;
      host?: string;
      port?: number;
      timeout?: number;
      local_fallback?: boolean;
    };
    clamscan?: {
      path?: string;
      scan_archives?: boolean;
      active?: boolean;
    };
  }

  interface ScanResult {
    isInfected: boolean;
    file: string;
    viruses: string[];
  }

  interface VersionResult {
    version: string;
  }

  class NodeClam {
    init(options?: ClamScanOptions): Promise<NodeClam>;
    isInfected(filePath: string): Promise<ScanResult>;
    getVersion(): Promise<VersionResult>;
    scanStream(stream: NodeJS.ReadableStream): Promise<ScanResult>;
  }

  export = NodeClam;
}

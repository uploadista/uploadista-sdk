export interface ChecksumService {
  computeChecksum(data: Uint8Array): Promise<string>;
}

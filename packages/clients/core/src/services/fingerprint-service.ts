export interface FingerprintService<UploadInput> {
  computeFingerprint(
    file: UploadInput,
    endpoint: string,
  ): Promise<string | null>;
}

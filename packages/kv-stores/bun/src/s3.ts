import { s3 } from "bun";

const s3file = s3.file("my-file.txt", {
  bucket: "my-bucket",
  accessKeyId: "your-access-key",
  secretAccessKey: "your-secret-key",
  region: "us-east-1",
});

s3file.stat();
// Write a large file
const bigFile = Buffer.alloc(10 * 1024 * 1024); // 10MB
const writer = s3file.writer({
  // Automatically retry on network errors up to 3 times
  retry: 3,

  // Queue up to 10 requests at a time
  queueSize: 10,

  // Upload in 5 MB chunks
  partSize: 5 * 1024 * 1024,
});

for (let i = 0; i < 10; i++) {
  writer.write(bigFile);
  await writer.flush();
}
await writer.end();

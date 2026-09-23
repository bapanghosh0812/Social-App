import { env } from '../config/env.js';
import { storage, sniffFile } from '../services/s3.service.js';

/**
 * Connectivity check for media storage. Uses credentials from server/.env —
 * never hardcode keys here. Run: npx tsx src/scripts/test-s3-upload.ts
 */
async function testUpload() {
  console.log(`Storage backend: ${storage.usingS3 ? `AWS S3 (${env.aws.bucket})` : 'local disk'}`);
  // 1x1 transparent PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );
  const url = await storage.store(png, 'posts', sniffFile(png)!);
  console.log('Upload succeeded:', url);
}

testUpload().catch((err) => {
  console.error('Upload test failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT ?? "https://silo.deployor.dev";
const bucket = process.env.S3_BUCKET ?? "testing-breadboard";
const publicBaseUrl =
  process.env.S3_PUBLIC_URL ?? `${endpoint.replace(/\/$/, "")}/${bucket}`;

function requireStorageEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for S3 uploads`);
  return value;
}

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: requireStorageEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requireStorageEnv("S3_SECRET_ACCESS_KEY"),
  },
});

export async function createPresignedPutUrl({
  key,
  contentType,
}: {
  key: string;
  contentType: string;
}) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 });
  return {
    uploadUrl,
    publicUrl: `${publicBaseUrl.replace(/\/$/, "")}/${key}`,
  };
}

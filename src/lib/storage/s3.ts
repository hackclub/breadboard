import "server-only";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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

let _s3: S3Client | null = null;

function getS3Client() {
  if (_s3) return _s3;
  _s3 = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireStorageEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireStorageEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
  return _s3;
}

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

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: 60,
  });
  const readUrl = await createPresignedGetUrl(key);
  return {
    uploadUrl,
    publicUrl: readUrl,
  };
}

export async function createPresignedGetUrl(key: string) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return await getSignedUrl(getS3Client(), command, { expiresIn: 5 * 60 });
}

export async function getStorageObject(key: string) {
  return await getS3Client().send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
}

export async function putStorageObject({
  key,
  contentType,
  body,
}: {
  key: string;
  contentType: string;
  body: Buffer;
}) {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      Body: body,
    }),
  );
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function storageKeyFromUrl(value: string) {
  if (value.startsWith("/demo/")) {
    const demoPath = safeDecodeURIComponent(value.slice("/demo/".length));
    return demoPath ? `project-demo-videos/${demoPath}` : null;
  }
  if (value.startsWith("/api/uploads/")) {
    return safeDecodeURIComponent(value.slice("/api/uploads/".length));
  }
  try {
    const url = new URL(value);
    const publicPrefix = new URL(publicBaseUrl.replace(/\/$/, "/"));
    if (url.origin !== publicPrefix.origin) return null;
    const prefixPath = publicPrefix.pathname.replace(/\/$/, "");
    if (!url.pathname.startsWith(`${prefixPath}/`)) return null;
    return safeDecodeURIComponent(url.pathname.slice(prefixPath.length + 1));
  } catch {
    return null;
  }
}

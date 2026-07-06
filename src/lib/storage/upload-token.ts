import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 5 * 60;

function getUploadTokenSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required to sign upload tokens");
  }
  return secret;
}

export function normalizeUploadContentType(contentType: string) {
  return contentType.split(";", 1)[0].trim().toLowerCase();
}

function signUpload(key: string, contentType: string, expires: number) {
  return createHmac("sha256", getUploadTokenSecret())
    .update(`${key}\n${contentType}\n${expires}`)
    .digest("hex");
}

export function createUploadToken(key: string, contentType: string) {
  const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  return `${expires}.${signUpload(key, contentType, expires)}`;
}

export function verifyUploadToken(
  token: string,
  key: string,
  contentType: string,
) {
  const separator = token.indexOf(".");
  if (separator === -1) return false;
  const expires = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isInteger(expires) || !signature) return false;
  if (expires < Math.floor(Date.now() / 1000)) return false;

  const provided = Buffer.from(signature, "hex");
  const expected = Buffer.from(signUpload(key, contentType, expires), "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

import { toStorageKey, type StorageRoot } from "./config";
import type { StorageFileInfo, StorageListResult } from "./types";

let client: S3Client | null = null;

function getR2Client(): S3Client {
  if (client) return client;

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 storage requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY",
    );
  }

  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    `https://${accountId}.r2.cloudflarestorage.com`;

  client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  return client;
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) {
    throw new Error("R2 storage requires R2_BUCKET");
  }
  return bucket;
}

function normalizePrefix(key: string): string {
  if (!key) return "";
  return key.endsWith("/") ? key : `${key}/`;
}

function basename(key: string): string {
  const parts = key.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? key;
}

export async function r2ReadBytes(
  root: StorageRoot,
  ...segments: string[]
): Promise<Uint8Array> {
  const Key = toStorageKey(root, ...segments);
  const res = await getR2Client().send(
    new GetObjectCommand({ Bucket: getBucket(), Key }),
  );
  if (!res.Body) {
    throw new Error(`Empty object body for key: ${Key}`);
  }
  return new Uint8Array(await res.Body.transformToByteArray());
}

export async function r2ReadUtf8(
  root: StorageRoot,
  ...segments: string[]
): Promise<string> {
  const bytes = await r2ReadBytes(root, ...segments);
  return new TextDecoder("utf-8").decode(bytes);
}

export async function r2Stat(
  root: StorageRoot,
  ...segments: string[]
): Promise<StorageFileInfo | null> {
  const Key = toStorageKey(root, ...segments);
  try {
    const listed = await getR2Client().send(
      new ListObjectsV2Command({
        Bucket: getBucket(),
        Prefix: Key,
        MaxKeys: 1,
      }),
    );
    const obj = listed.Contents?.find((o) => o.Key === Key);
    if (!obj) return null;
    return {
      name: segments[segments.length - 1] ?? basename(Key),
      size: obj.Size ?? 0,
      modifiedAt: (obj.LastModified ?? new Date()).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function r2List(
  root: StorageRoot,
  ...segments: string[]
): Promise<StorageListResult> {
  const prefix = normalizePrefix(toStorageKey(root, ...segments));
  const listed = await getR2Client().send(
    new ListObjectsV2Command({
      Bucket: getBucket(),
      Prefix: prefix,
      Delimiter: "/",
    }),
  );

  const directories =
    listed.CommonPrefixes?.map((cp) => {
      const p = cp.Prefix ?? "";
      return basename(p.endsWith("/") ? p.slice(0, -1) : p);
    }) ?? [];

  const files: StorageFileInfo[] = [];
  for (const obj of listed.Contents ?? []) {
    if (!obj.Key || obj.Key === prefix) continue;
    if (obj.Key.endsWith("/")) continue;
    const name = basename(obj.Key);
    if (!name) continue;
    files.push({
      name,
      size: obj.Size ?? 0,
      modifiedAt: (obj.LastModified ?? new Date()).toISOString(),
    });
  }

  directories.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
  files.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return { directories, files };
}

/** Object key for passing to Python on the backend (Render has files under /app/data or downloads from R2). */
export function r2ObjectKey(root: StorageRoot, ...segments: string[]): string {
  return toStorageKey(root, ...segments);
}

export async function r2DeleteFile(
  root: StorageRoot,
  ...segments: string[]
): Promise<boolean> {
  const Key = toStorageKey(root, ...segments);
  try {
    await getR2Client().send(
      new DeleteObjectCommand({ Bucket: getBucket(), Key }),
    );
    return true;
  } catch {
    return false;
  }
}

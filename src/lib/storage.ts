/**
 * Storage abstraction for image uploads.
 * Provider is selected via Settings → Image Storage.
 *
 * Supported providers:
 *   local        – write to public/uploads/ (self-hosted only)
 *   vercel_blob  – @vercel/blob (BLOB_READ_WRITE_TOKEN env var required)
 *   cloudflare_r2 / s3 – AWS S3-compatible (credentials stored in DB settings)
 */

import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { prisma } from "./db";
import { getStoreId } from "./store-context";

export interface UploadResult {
  url: string;
}

export async function uploadFile(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<UploadResult> {
  const storeId = await getStoreId();
  const settings = await prisma.businessSettings.findUnique({
    where: { storeId },
    select: {
      storageProvider: true,
      storageRegion: true,
      storageBucket: true,
      storageEndpoint: true,
      storageAccessKey: true,
      storageSecretKey: true,
      storagePublicUrl: true,
    },
  });

  const provider = settings?.storageProvider ?? "local";

  switch (provider) {
    case "vercel_blob":
      return uploadVercelBlob(buffer, filename, contentType);

    case "cloudflare_r2":
    case "s3":
      return uploadS3Compatible(buffer, filename, contentType, {
        bucket: settings?.storageBucket ?? "",
        region: settings?.storageRegion ?? (provider === "cloudflare_r2" ? "auto" : "us-east-1"),
        endpoint: settings?.storageEndpoint ?? undefined,
        accessKeyId: settings?.storageAccessKey ?? "",
        secretAccessKey: settings?.storageSecretKey ?? "",
        publicUrl: settings?.storagePublicUrl ?? undefined,
        forcePathStyle: provider === "cloudflare_r2",
      });

    default:
      return uploadLocal(buffer, filename);
  }
}

// ─── Local ────────────────────────────────────────────────────────────────────

async function uploadLocal(buffer: Buffer, filename: string): Promise<UploadResult> {
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return { url: `/uploads/${filename}` };
}

// ─── Vercel Blob ───────────────────────────────────────────────────────────────

async function uploadVercelBlob(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<UploadResult> {
  const { put } = await import("@vercel/blob");
  const blob = await put(`uploads/${filename}`, buffer, {
    access: "public",
    contentType,
  });
  return { url: blob.url };
}

// ─── S3-compatible (AWS S3 + Cloudflare R2) ───────────────────────────────────

interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string;
  forcePathStyle?: boolean;
}

async function uploadS3Compatible(
  buffer: Buffer,
  filename: string,
  contentType: string,
  config: S3Config
): Promise<UploadResult> {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  const client = new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle ?? false,
  });

  const key = `uploads/${filename}`;
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const url = config.publicUrl
    ? `${config.publicUrl.replace(/\/$/, "")}/${key}`
    : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;

  return { url };
}

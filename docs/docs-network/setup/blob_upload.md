---
id: blob_upload
sidebar_position: 5
title: Blob upload
description: Learn how to host a blob file store to contribute to the Aztec network.
---

## Overview

While most nodes only need to retrieve blobs, you can contribute to the network by hosting a blob file store. When configured with an upload URL, your node will automatically upload blobs it retrieves to your file store, making them available for other nodes to download.

:::note Upload is Optional
Configuring blob upload is optional. You can still download blobs from file stores without uploading them yourself — other network participants (such as sequencers and validators) upload blobs to shared storage, making them available for all nodes to retrieve.
:::

## Prerequisites

Before configuring blob upload, you should:

- Have access to cloud storage (Google Cloud Storage, Amazon S3, or Cloudflare R2) with **write permissions**
- Understand the [blob retrieval](./blob_storage.md) configuration

## Configuring blob upload

### Environment variable

Configure blob upload using the following environment variable in your `.env` file:

| Variable | Description | Example |
|----------|-------------|---------|
| `BLOB_FILE_STORE_UPLOAD_URL` | URL for uploading blobs | `s3://my-bucket/blobs/` |

### Supported storage backends

The blob client supports the following storage backends for upload:

- **Google Cloud Storage** - `gs://bucket-name/path/`
- **Amazon S3** - `s3://bucket-name/path/`
- **Cloudflare R2** - `s3://bucket-name/path/?endpoint=https://[ACCOUNT_ID].r2.cloudflarestorage.com`
- **Local filesystem** - `file:///absolute/path`

:::warning
HTTPS URLs are read-only and cannot be used for uploads.
:::

### Storage path format

Blobs are stored using the following path structure:

```
{base_url}/aztec-{l1ChainId}-{rollupVersion}-{rollupAddress}/blobs/{versionedBlobHash}.data
```

For example:
```
gs://my-bucket/aztec-1-1-0x1234abcd.../blobs/0x01abc123...def.data
```

## Healthcheck file

When blob upload is configured, your node uploads a `.healthcheck` file to the storage path on startup and periodically thereafter. Other nodes use this file to verify connectivity to your file store before attempting to download blobs.

:::warning Exclude from pruning
If you configure lifecycle rules or pruning policies on your storage bucket, ensure the `.healthcheck` file is excluded. Deleting this file will cause connectivity checks to fail on other nodes.
:::

## Configuration examples

### Google Cloud Storage

```bash
BLOB_FILE_STORE_UPLOAD_URL=gs://my-bucket/blobs/
```

### Amazon S3

```bash
BLOB_FILE_STORE_UPLOAD_URL=s3://my-bucket/blobs/
```

### Cloudflare R2

```bash
BLOB_FILE_STORE_UPLOAD_URL=s3://my-bucket/blobs/?endpoint=https://[ACCOUNT_ID].r2.cloudflarestorage.com
```

Replace `[ACCOUNT_ID]` with your Cloudflare account ID.

### Local filesystem (for testing)

```bash
BLOB_FILE_STORE_UPLOAD_URL=file:///data/blobs
```

## Authentication

Upload requires write permissions to your storage bucket.

### Google Cloud Storage

Set up [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials):

```bash
gcloud auth application-default login
```

Or use a service account key with write permissions:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### Amazon S3 / Cloudflare R2

Set AWS credentials as environment variables:

```bash
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```

For R2, these credentials come from your Cloudflare R2 API tokens. Ensure the token has write permissions.

## Exposing a public HTTP endpoint

While you upload blobs using SDK URLs (`gs://`, `s3://`), you should configure a public HTTP endpoint so other nodes can download blobs without needing cloud credentials. This allows anyone to add your file store as a read source using a simple HTTPS URL.

### Google Cloud Storage

GCS buckets can be accessed publicly at `https://storage.googleapis.com/BUCKET_NAME/path/to/object`.

To enable public access:
1. Go to your bucket in the [Google Cloud Console](https://console.cloud.google.com/storage/browser)
2. Select the **Permissions** tab
3. Click **Grant Access**
4. Add `allUsers` as a principal with the **Storage Object Viewer** role

See [Making data public](https://cloud.google.com/storage/docs/access-control/making-data-public) for detailed instructions.

Once configured, other nodes can use:
```bash
BLOB_FILE_STORE_URLS=https://storage.googleapis.com/my-bucket/blobs/
```

### Amazon S3

S3 buckets can be accessed publicly via static website hosting at `http://BUCKET_NAME.s3-website.REGION.amazonaws.com`.

To enable public access:
1. Go to your bucket in the [AWS S3 Console](https://console.aws.amazon.com/s3/)
2. Disable **Block Public Access** settings
3. Add a bucket policy granting public read access
4. Enable **Static website hosting** in the bucket properties

See [Hosting a static website on S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html) for detailed instructions.

:::note
S3 website endpoints only support HTTP. For HTTPS, use [CloudFront](https://docs.aws.amazon.com/AmazonS3/latest/userguide/website-hosting-cloudfront-walkthrough.html) as a CDN in front of your bucket.
:::

### Cloudflare R2

R2 buckets can expose a public HTTP endpoint via a custom domain or the managed `r2.dev` subdomain.

To enable public access:
1. Go to your bucket in the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select **Settings** > **Public Access**
3. Either enable the `r2.dev` subdomain or connect a custom domain

See [Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) for detailed instructions.

Once configured, other nodes can use:
```bash
BLOB_FILE_STORE_URLS=https://pub-[ID].r2.dev/
# or with custom domain:
BLOB_FILE_STORE_URLS=https://blobs.yourdomain.com/
```

:::tip
R2 offers free egress, making it cost-effective for public blob distribution.
:::

## Troubleshooting

### Upload fails

**Issue**: Blobs are not being uploaded to file store.

**Solutions**:
- Verify `BLOB_FILE_STORE_UPLOAD_URL` is set
- Check write permissions on the storage bucket
- Ensure credentials are configured (AWS/GCP)
- Note: HTTPS URLs are read-only and cannot be used for uploads

## Next Steps

- Learn about [blob retrieval](./blob_storage.md) configuration
- Learn about [using snapshots](./syncing_best_practices.md) for faster node synchronization
- Join the [Aztec Discord](https://discord.gg/aztec) for support

---
id: syncing_best_practices
displayed_sidebar: operatorsSidebar
title: Using and uploading snapshots
description: Learn sync modes and snapshot strategies to efficiently sync your Aztec node with the network.
---

## Overview

All nodes on the Aztec network must download and synchronize the blockchain state before they can operate. This guide covers different sync modes, including how to use snapshots for faster synchronization and how to create your own snapshots.

:::tip Automatic Configuration
When using `--network [NETWORK_NAME]`, snapshot URLs are automatically configured for you. Most users don't need to manually set snapshot sources.
:::

## Understanding sync modes

Nodes can synchronize state in two ways:

1. **L1 sync**: Queries the rollup and data availability layer for historical state directly from Layer 1
2. **Snapshot sync**: Downloads pre-built state snapshots from a storage location for faster synchronization

Since Aztec uses blobs, syncing from L1 requires an archive node that stores complete blob history from Aztec's deployment. Snapshot sync is significantly faster, doesn't require archive nodes, and reduces load on L1 infrastructure, making it the recommended approach for most deployments.

## Prerequisites

Before proceeding, you should:

- Have the Aztec node software installed
- Understand basic node operation
- For uploading snapshots: Have access to cloud storage (Google Cloud Storage, Amazon S3, or Cloudflare R2) with appropriate permissions

## Using snapshots to sync your node

### Configuring sync mode

Control how your node synchronizes using the `SYNC_MODE` environment variable in your `.env` file:

```bash
aztec start --node --sync-mode [MODE]
SYNC_MODE=[MODE]
```

Available sync modes:

- **`snapshot`**: Downloads and uses a snapshot only if no local data exists (default behavior)
- **`force-snapshot`**: Downloads and uses a snapshot even if local data exists, overwriting it
- **`l1`**: Syncs directly from Layer 1 without using snapshots

### Setting the snapshot source

By default, nodes use Aztec's official snapshot storage. To specify a custom snapshot location, add the `SNAPSHOTS_URL` environment variable to your `.env` file:

```bash
SYNC_MODE=snapshot
SNAPSHOTS_URL=[BASE_URL]
```

The node searches for the snapshot index at:
```
[BASE_URL]/aztec-[L1_CHAIN_ID]-[VERSION]-[ROLLUP_ADDRESS]/index.json
```

**Supported storage backends**:
- **Google Cloud Storage** - `gs://bucket-name/path/`
- **Amazon S3** - `s3://bucket-name/path/`
- **Cloudflare R2** - `s3://bucket-name/path/?endpoint=https://[ACCOUNT_ID].r2.cloudflarestorage.com`
- **HTTP/HTTPS** - `https://host/path`
- **Local filesystem** - `file:///absolute/path`

**Default snapshot locations by network**:

- **Mainnet**: `https://aztec-labs-snapshots.com/mainnet/`
- **Testnet**: `https://aztec-labs-snapshots.com/testnet/`
- **Staging networks**: Configured via network metadata

### Using custom snapshot sources

You can configure your node to use custom snapshot sources for various use cases.

Add the following to your `.env` file:

**Google Cloud Storage:**
```bash
SYNC_MODE=force-snapshot
SNAPSHOTS_URL=gs://my-snapshots/
```

**Cloudflare R2:**
```bash
SYNC_MODE=snapshot
SNAPSHOTS_URL=s3://my-bucket/snapshots/?endpoint=https://[ACCOUNT_ID].r2.cloudflarestorage.com
```
Replace `[ACCOUNT_ID]` with your Cloudflare account ID.

**HTTP/HTTPS mirror:**
```bash
SYNC_MODE=snapshot
SNAPSHOTS_URL=https://my-mirror.example.com/snapshots/
```

Then add the environment variables to your `docker-compose.yml`:

```yaml
environment:
  # ... other environment variables
  SYNC_MODE: ${SYNC_MODE}
  SNAPSHOTS_URL: ${SNAPSHOTS_URL}
```

## Creating and uploading snapshots

You can create snapshots of your node's state for backup purposes or to share with other nodes. This is done by calling the `nodeAdmin_startSnapshotUpload` method on the node admin API.

### How snapshot upload works

When triggered, the upload process:

1. Pauses node syncing temporarily
2. Creates a backup of the archiver and world-state databases
3. Uploads the backup to the specified storage location
4. Resumes normal operation

### Uploading a snapshot

Use the node admin API to trigger a snapshot upload. You can upload to Google Cloud Storage, Amazon S3, or Cloudflare R2 by specifying the appropriate storage URI.

**Example command**:

**Upload to Google Cloud Storage:**
```bash
docker exec -it aztec-node curl -XPOST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{
    "method": "nodeAdmin_startSnapshotUpload",
    "params": ["gs://your-bucket/snapshots/"],
    "id": 1,
    "jsonrpc": "2.0"
  }'
```

**Upload to Amazon S3:**
```bash
docker exec -it aztec-node curl -XPOST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{
    "method": "nodeAdmin_startSnapshotUpload",
    "params": ["s3://your-bucket/snapshots/"],
    "id": 1,
    "jsonrpc": "2.0"
  }'
```

**Upload to Cloudflare R2:**
```bash
docker exec -it aztec-node curl -XPOST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{
    "method": "nodeAdmin_startSnapshotUpload",
    "params": ["s3://your-bucket/snapshots/?endpoint=https://[ACCOUNT_ID].r2.cloudflarestorage.com"],
    "id": 1,
    "jsonrpc": "2.0"
  }'
```

Replace `aztec-node` with your container name and `[ACCOUNT_ID]` with your Cloudflare account ID.

**Note**: Ensure your storage credentials are configured before uploading:
- **Google Cloud Storage**: Set up [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- **Amazon S3 / Cloudflare R2**: Set environment variables `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`

### Scheduling regular snapshots

For continuous backup, schedule the upload command to run at regular intervals using cron or a similar scheduler. The frequency depends on how current you need your snapshots to be.

Once uploaded, other nodes can download these snapshots by configuring their `--snapshots-url` to point to your storage location.

## Verification

To verify your sync configuration is working:

### For snapshot downloads

1. **Check startup logs**: Look for messages indicating snapshot download progress
2. **Monitor sync time**: Snapshot sync should be significantly faster than L1 sync
3. **Verify state completeness**: Confirm your node has the expected block height after sync
4. **Check data directories**: Ensure the archiver and world-state databases are populated

### For snapshot uploads

1. **Check API response**: The upload command should return a success response
2. **Monitor logs**: Watch for upload progress messages in the node logs
3. **Verify storage**: Check your storage bucket to confirm the snapshot files exist
4. **Validate index file**: Ensure the `index.json` file is created at the expected path
5. **Test download**: Try downloading the snapshot with another node to confirm it works

## Troubleshooting

### Snapshot download fails

**Issue**: Node cannot download snapshot from the specified URL.

**Solutions**:
- Verify the `--snapshots-url` is correct and accessible
- Check network connectivity to the storage location
- Confirm the snapshot index file exists at the expected path
- Review node logs for specific error messages
- Try using Aztec's default snapshot URL to isolate custom URL issues

### Snapshot upload fails

**Issue**: The `nodeAdmin_startSnapshotUpload` command returns an error.

**Solutions**:
- Verify storage credentials are properly configured (Google Cloud, AWS, or Cloudflare R2)
- Check that the specified bucket exists and you have write permissions
- Confirm sufficient disk space is available for creating the backup
- Review node logs for detailed error messages
- For S3/R2: Ensure environment variables `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set

### Storage space issues

**Issue**: Running out of disk space during sync or snapshot creation.

**Solutions**:
- Ensure sufficient disk space (at least 2x the expected database size for snapshots)
- Clean up old snapshots or data if running recurring uploads
- Monitor disk usage and set up alerts
- Consider using a larger volume or adding storage

## Best practices

- **Use snapshot sync for production**: Snapshot sync is significantly faster and more efficient than L1 sync
- **Choose the right storage backend**:
  - Google Cloud Storage for simplicity and GCP integration
  - Amazon S3 for AWS infrastructure integration
  - Cloudflare R2 for cost-effective public distribution (free egress)
- **Schedule regular snapshots**: Create snapshots at regular intervals if running critical infrastructure
- **Test snapshot restoration**: Periodically verify that your snapshots download and restore correctly
- **Monitor storage costs**: Implement retention policies to manage cloud storage costs
- **Keep snapshots current**: Older snapshots require more time to sync to the current state
- **Use `force-snapshot` sparingly**: Only use when you need to reset to a known state, as it overwrites local data

## Next Steps

- Learn about [running bootnodes](./bootnode-operation.md) for improved peer discovery
- Set up [monitoring](../monitoring/index.md) to track your node's sync progress
- Check the [CLI reference](../reference/cli-reference.md) for additional sync-related options
- Join the [Aztec Discord](https://discord.gg/aztec) for sync optimization tips

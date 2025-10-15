---
id: syncing_best_practices
sidebar_position: 3
title: Using and uploading snapshots
description: Learn sync modes and snapshot strategies to efficiently sync your Aztec node with the network.
---

## Overview

All nodes on the Aztec network must download and synchronize the blockchain state before they can operate. This guide covers different sync modes, including how to use snapshots for faster synchronization and how to create your own snapshots.

## Understanding sync modes

Nodes can synchronize state in two ways:

1. **L1 sync**: Queries the rollup and data availability layer for historical state directly from Layer 1
2. **Snapshot sync**: Downloads pre-built state snapshots from a storage location for faster synchronization

Since Aztec uses blobs, syncing from L1 requires an archive node that stores complete blob history from Aztec's deployment. Snapshot sync is significantly faster, doesn't require archive nodes, and reduces load on L1 infrastructure, making it the recommended approach for most deployments.

## Prerequisites

Before proceeding, you should:

- Have the Aztec node software installed
- Understand basic node operation
- For uploading snapshots: Have access to Google Cloud Storage with appropriate permissions

## Using snapshots to sync your node

### Configuring sync mode

Control how your node synchronizes using the `--sync-mode` flag:

```bash
aztec start --node --sync-mode [MODE]
```

Available sync modes:

- **`snapshot`**: Downloads and uses a snapshot only if no local data exists (default behavior)
- **`force-snapshot`**: Downloads and uses a snapshot even if local data exists, overwriting it
- **`l1`**: Syncs directly from Layer 1 without using snapshots

### Setting the snapshot source

By default, nodes use Aztec's official snapshot storage. To specify a custom snapshot location, use the `--snapshots-url` flag:

```bash
aztec start --node --sync-mode snapshot --snapshots-url [BASE_URL]
```

The node searches for the snapshot index at:
```
[BASE_URL]/aztec-[L1_CHAIN_ID]-[VERSION]-[ROLLUP_ADDRESS]/index.json
```

**Note**: Currently, only Google Cloud Storage is supported for snapshots. URLs follow this format:
```
https://storage.googleapis.com/aztec-testnet/snapshots/
```

### Example: Force snapshot sync with custom URL

```bash
aztec start --node --sync-mode force-snapshot --snapshots-url https://storage.googleapis.com/my-snapshots/
```

This configuration forces the node to download a fresh snapshot on every startup from the specified location.

## Creating and uploading snapshots

You can create snapshots of your node's state for backup purposes or to share with other nodes. This is done by calling the `nodeAdmin_startSnapshotUpload` method on the node admin API.

### How snapshot upload works

When triggered, the upload process:

1. Pauses node syncing temporarily
2. Creates a backup of the archiver and world-state databases
3. Uploads the backup to the specified storage location
4. Resumes normal operation

### Uploading a snapshot

Use the admin API to trigger a snapshot upload. The upload destination must be a Google Cloud Storage URI (e.g., `gs://your-bucket/snapshots/`).

**Example command** (assumes node admin API is running on `localhost:8880`):

```bash
curl -XPOST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{
    "method": "nodeAdmin_startSnapshotUpload",
    "params": ["gs://your-bucket/snapshots/"],
    "id": 1,
    "jsonrpc": "2.0"
  }'
```

Replace `gs://your-bucket/snapshots/` with your Google Cloud Storage bucket path.

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
3. **Verify storage**: Check your Google Cloud Storage bucket to confirm the snapshot files exist
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
- Verify Google Cloud Storage credentials are properly configured
- Check that the specified bucket exists and you have write permissions
- Confirm sufficient disk space is available for creating the backup
- Review node logs for detailed error messages

### Storage space issues

**Issue**: Running out of disk space during sync or snapshot creation.

**Solutions**:
- Ensure sufficient disk space (at least 2x the expected database size for snapshots)
- Clean up old snapshots or data if running recurring uploads
- Monitor disk usage and set up alerts
- Consider using a larger volume or adding storage

## Best practices with snapshots

- **Use snapshot sync for production**: It's faster and more efficient than L1 sync
- **Schedule regular snapshots**: If running critical infrastructure, create snapshots at regular intervals
- **Test snapshot restoration**: Periodically verify that your snapshots can be successfully downloaded and used
- **Monitor storage costs**: Google Cloud Storage usage accumulates; implement retention policies if needed
- **Keep snapshots updated**: Older snapshots take longer to sync to the current state
- **Use force-snapshot sparingly**: Only use `force-snapshot` when you need to reset to a known state

## Next Steps

- Learn about [running bootnodes](./bootnode_operation.md) for improved peer discovery
- Set up [monitoring](../operation/monitoring.md) to track your node's sync progress
- Check the [CLI reference](../reference/cli_reference.md) for additional sync-related options
- Join the [Aztec Discord](https://discord.gg/aztec) for sync optimization tips

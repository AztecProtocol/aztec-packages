---
id: bootnode_operation
sidebar_position: 3
title: Using and running a bootnode
description: Learn how to connect to and operate bootnodes for peer discovery in the Aztec network.
---

## Overview

Bootnodes facilitate peer discovery in the Aztec network by maintaining a list of active peers that new nodes can connect to. This guide covers how to connect your node to a bootnode and how to run your own bootnode.

## What is a bootnode?

Nodes in the Aztec network must connect to peers to gossip transactions and propagate them across the network. Bootnodes help new nodes discover and connect to these peers, enabling them to join the peer-to-peer layer.

## Prerequisites

Before proceeding, you should:

- Have the Aztec node software installed
- Understand basic command-line operations
- For running a bootnode: Have the necessary network infrastructure and port access

## Connecting to a bootnode

To connect your node to a bootnode for peer discovery:

1. Obtain the bootnode's ENR (Ethereum Node Record)
2. Pass the ENR to your node at startup using the `--p2p.bootstrapNodes` flag

The flag accepts a comma-separated list of bootstrap node ENRs:

```bash
aztec start --node --p2p.bootstrapNodes [ENR]
```

For multiple bootnodes:

```bash
aztec start --node --p2p.bootstrapNodes [ENR1],[ENR2],[ENR3]
```

## Running a bootnode

To run your own bootnode, use the `--p2p-bootstrap` flag:

```bash
aztec start --p2p-bootstrap
```

### Configuring the bootnode port

By default, the bootnode uses the `P2P_PORT` value. To customize the port:

```bash
aztec start --p2p-bootstrap --p2pBootstrap.p2pBroadcastPort [PORT]
```

### Persisting bootnode identity

To maintain a consistent bootnode identity across restarts, use the `--p2pBootstrap.peerIdPrivateKeyPath` flag to specify a private key location:

```bash
aztec start --p2p-bootstrap --p2pBootstrap.peerIdPrivateKeyPath [path]
```

**How it works:**
- If a private key exists at `[path]`, the bootnode will use it for its identity
- If no private key exists, a new one will be generated and saved to `[path]`
- This ensures your bootnode maintains the same ENR across restarts

### Obtaining your bootnode's ENR

After starting your bootnode, obtain its ENR from the startup logs. You can share this ENR with node operators who want to connect to your bootnode.

### Adding your bootnode to the default set

:::info

The process for adding bootnodes to Aztec's default bootnode list is currently being finalized. For now, share your bootnode ENR directly with node operators who
want to connect.

:::

## Verification

To verify your bootnode setup:

### For nodes connecting to a bootnode

1. **Check logs**: Look for messages indicating successful peer discovery
2. **Verify peer count**: Confirm your node has connected to peers from the bootnode
3. **Monitor network activity**: Ensure transactions are being gossiped correctly

### For bootnode operators

1. **Confirm bootnode is running**: Check that the process started successfully
2. **Verify port accessibility**: Ensure the configured port is open and accessible
3. **Monitor peer connections**: Check logs for incoming peer connection requests
4. **Validate ENR generation**: Confirm your bootnode's ENR is displayed in the logs

## Troubleshooting

### Cannot connect to bootnode

**Issue**: Your node fails to connect to the specified bootnode.

**Solutions**:
- Verify the ENR is correct and properly formatted
- Check network connectivity to the bootnode's address
- Ensure the bootnode is running and accessible
- Confirm firewall rules allow P2P connections

### Bootnode not discovering peers

**Issue**: Your bootnode isn't discovering or storing peers.

**Solutions**:
- Verify the bootnode process is running with the correct flags
- Check that the P2P port is properly configured and accessible
- Review logs for error messages or connection issues
- Ensure sufficient system resources are available

### Private key path errors

**Issue**: Errors occur when specifying `--p2pBootstrap.peerIdPrivateKeyPath`.

**Solutions**:
- Verify the path exists and is writable
- Check file permissions for the directory and file
- Ensure the path doesn't contain invalid characters
- Confirm the private key file format is correct (if reusing an existing key)

## Next Steps

- Monitor your bootnode or node connections regularly
- Consider running multiple bootnodes for redundancy
- Join the Aztec community to share your bootnode ENR with other operators

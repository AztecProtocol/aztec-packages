---
sidebar_position: 4
title: FAQs & Common Issues
description: Troubleshooting guide for common Aztec node operator issues including sync errors, RPC limits, and update procedures.
keywords: [aztec, sequencer, node, validator, setup]
tags:
  - sequencer
  - node
  - tutorial
  - infrastructure
---

## Overview

This guide addresses common issues node operators encounter when running Aztec nodes. Each entry includes the issue symptoms, possible causes, and step-by-step solutions.

If your issue isn't listed here, visit the [Aztec Discord](https://discord.gg/aztec) in the `#operator-faq` channel for community support.

## Node Sync Issues

### SYNC_BLOCK Failed Error

**Symptom**: You see this error in your node logs:

```
ERROR: world-state:database Call SYNC_BLOCK failed: Error: Can't synch block: block state does not match world state
```

**Cause**: Your local database state is corrupted or out of sync with the network.

**Solution**:

1. Stop your node:
   - Docker Compose: `docker compose down`
   - CLI: Press `Ctrl+C` to stop the process

2. Remove the archiver data directory:
   ```bash
   rm -rf ~/.aztec/v2.0.2/data/archiver
   ```

3. Update to the latest version:
   ```bash
   aztec-up -v latest
   ```

4. Restart your node with your normal startup command

:::warning Data Loss and Resync
This process removes local state and requires full resynchronization. Consider using snapshot sync mode (`--sync-mode snapshot`) to speed up recovery. See the [syncing best practices guide](../setup/syncing_best_practices.md) for more information.
:::

### Error Getting Slot Number

**Symptom**: Your logs show "Error getting slot number" related to beacon or execution endpoints.

**Cause**:

- **Beacon-related errors**: Failed to connect to your L1 consensus (beacon) RPC endpoint
- **Execution-related errors**: Failed to connect to your L1 execution RPC endpoint or reporting routine issue

**Solutions**:

1. **Verify L1 endpoint configuration**:
   - Check your `L1_CONSENSUS_HOST_URLS` setting points to your beacon node
   - Check your `ETHEREUM_HOSTS` setting points to your execution client
   - Ensure URLs are formatted correctly (e.g., `http://localhost:5052` for beacon)

2. **Test endpoint connectivity**:
   ```bash
   # Test beacon endpoint
   curl [YOUR_BEACON_ENDPOINT]/eth/v1/beacon/headers

   # Test execution endpoint
   curl -X POST -H "Content-Type: application/json" \
     --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
     [YOUR_EXECUTION_ENDPOINT]
   ```

3. **Verify L1 clients are synced**:
   - Check that your beacon node is fully synced
   - Check that your execution client is fully synced
   - Use `docker compose logs` or check L1 client logs for sync status

4. **Check for rate limiting** (if using third-party RPC):
   - See the "RPC and Rate Limiting" section below
   - Consider using your own L1 node for better reliability

## RPC and Rate Limiting

### RPC Rate Limit or Quota Exceeded

**Symptom**: Your logs show errors like:

```
Error: quota limit exceeded
Error: rate limit exceeded
Error: too many requests
```

**Cause**: Your RPC provider is throttling requests due to rate limits or quota restrictions.

**Solutions**:

1. **Register for an API key with your RPC provider**:
   - Most providers (Infura, Alchemy, QuickNode) offer higher limits with authenticated requests
   - Update your configuration to include the API key in your RPC URL
   - Example: `https://mainnet.infura.io/v3/YOUR_API_KEY`

2. **Use your own L1 node** (recommended for sequencers):
   - Running your own Ethereum node eliminates rate limits entirely
   - Provides better performance, reliability, and privacy
   - See [Eth Docker's guide](https://ethdocker.com/Usage/QuickStart) for setup instructions
   - Ensure you're running both execution and consensus clients

3. **Configure multiple RPC endpoints for failover**:
   - Aztec nodes support comma-separated RPC URLs
   - Example: `ETHEREUM_HOSTS=https://rpc1.example.com,https://rpc2.example.com`
   - The node will automatically fail over if one endpoint is unavailable

:::tip Run Your Own L1 Infrastructure
Sequencer operators should always run their own L1 infrastructure to ensure reliability, avoid rate limits, and maintain optimal performance. Third-party RPC providers are suitable for testing but not recommended for production sequencer operations.
:::

### Blob Retrieval Errors

**Symptom**: Your logs show errors like:

```
Error: No blob bodies found
Error: Unable to get blob sidecar, Gateway Time-out (504)
```

**Cause**: Your beacon node endpoint is slow, overloaded, rate-limited, or not synced properly.

**Solutions**:

1. **Verify beacon endpoint configuration**:
   ```bash
   # Check L1_CONSENSUS_HOST_URLS in your configuration
   # Should point to your beacon node's API endpoint
   ```

2. **Test beacon endpoint health**:
   ```bash
   # Check if beacon node is responding
   curl [YOUR_BEACON_ENDPOINT]/eth/v1/node/health

   # Check sync status
   curl [YOUR_BEACON_ENDPOINT]/eth/v1/node/syncing
   ```

3. **Ensure beacon node is fully synced**:
   - Check your beacon client logs
   - Verify the sync status shows as synced
   - Blob data is only available for recent blocks (typically 18 days)

4. **Run your own beacon node** (recommended):
   - Using a third-party beacon endpoint may have rate limits
   - Running your own provides better reliability and eliminates timeouts
   - See the [prerequisites guide](../prerequisites.md) for L1 infrastructure setup

## Funding and Resources

### Insufficient L1 Funds

**Symptom**: Your sequencer cannot publish blocks, and logs show:

```
Error: Insufficient L1 funds
Error: insufficient funds for gas * price + value
```

**Cause**: Your publisher address doesn't have enough Sepolia ETH to pay for L1 gas fees.

**Solutions**:

1. **Get Sepolia ETH from a faucet**:
   - [Sepolia Faucet](https://sepoliafaucet.com/)
   - [Alchemy Sepolia Faucet](https://www.alchemy.com/faucets/ethereum-sepolia)
   - [Infura Sepolia Faucet](https://www.infura.io/faucet/sepolia)

2. **Maintain sufficient balance**:
   - Keep at least **0.1 ETH** in your publisher account at all times
   - Monitor your balance regularly to avoid running out
   - Falling below the minimum balance may result in slashing

3. **Set up balance monitoring**:
   ```bash
   # Check your publisher balance
   cast balance [YOUR_PUBLISHER_ADDRESS] --rpc-url [YOUR_RPC_URL]
   ```

4. **Configure alerts**:
   - Set up monitoring to alert you when balance drops below 0.15 ETH
   - This gives you time to top up before hitting the critical threshold

:::warning Slashing Risk
Sequencers with insufficient funds in their publisher account risk being slashed. Always maintain at least 0.1 ETH to ensure uninterrupted operation and avoid penalties.
:::

## Updates and Maintenance

### Updating to Latest Version

**Issue**: You need to update your node to the latest Aztec version.

**Solution**:

#### For CLI Method:

```bash
# Update the Aztec binary
aztec-up -v latest

# Verify the new version
aztec --version

# Restart your node with your normal startup command
```

#### For Docker Compose Method:

```bash
# Pull the latest image
docker compose pull

# Stop the current container
docker compose down

# Start with the new image
docker compose up -d

# Verify it's running
docker compose logs -f aztec-sequencer
```

#### Version-Specific Updates:

To update to a specific version instead of latest:

```bash
# CLI method
aztec-up -v 2.0.2

# Docker Compose: Update your docker-compose.yml
# Change the image tag from:
image: "aztecprotocol/aztec:latest"
# To:
image: "aztecprotocol/aztec:2.0.2"
```

:::tip Stay Informed About Updates
Join the [Aztec Discord](https://discord.gg/aztec) and follow the announcements channel to stay informed about new releases and required updates.
:::

## Network and Connectivity

### Port Forwarding Not Working

**Symptom**: Your node cannot discover peers or shows "0 peers connected" in logs.

**Cause**: Firewall rules or router configuration are blocking P2P connections.

**Solutions**:

1. **Verify your external IP address**:
   ```bash
   curl ipv4.icanhazip.com
   ```

   Confirm this matches your `P2P_IP` configuration.

2. **Test port connectivity**:
   ```bash
   # From another machine, test if your P2P port is accessible
   nc -zv [YOUR_EXTERNAL_IP] 40400
   ```

3. **Configure router port forwarding**:
   - Log into your router's admin interface
   - Forward port 40400 (TCP and UDP) to your node's local IP address
   - Save and restart router if needed

4. **Check local firewall rules**:
   ```bash
   # Linux: Allow P2P port through firewall
   sudo ufw allow 40400/tcp
   sudo ufw allow 40400/udp

   # Verify rules
   sudo ufw status
   ```

5. **Verify Docker network settings** (Docker Compose method):
   - Ensure ports are properly mapped in docker-compose.yml
   - Check that `P2P_PORT` environment variable matches the exposed ports

## Other Common Issues

### CodeError: Stream Reset

**Symptom**: You occasionally see this error in logs:

```
CodeError: stream reset
```

**Cause**: Temporary P2P connection disruption. This is normal network behavior and occurs when peer connections are interrupted.

**Impact**: This is safe to ignore. Your node automatically reconnects to peers and maintains network connectivity.

**Action Required**: None. This is expected behavior in P2P networks.

### Keystore Not Loading

**Symptom**: Your sequencer fails to start with errors about invalid keys or missing keystore.

**Cause**: Keystore file is improperly formatted, missing, or has incorrect permissions.

**Solutions**:

1. **Verify keystore.json format**:
   ```json
   {
     "schemaVersion": 1,
     "validators": [
       {
         "attester": ["0xYOUR_PRIVATE_KEY_HERE"],
         "publisher": ["0xYOUR_PUBLISHER_KEY_HERE"],
         "coinbase": "0xYOUR_COINBASE_ADDRESS",
         "feeRecipient": "0xYOUR_AZTEC_ADDRESS"
       }
     ]
   }
   ```

2. **Validate private key format**:
   - Keys should start with `0x`
   - Keys should be 64 hexadecimal characters (plus the `0x` prefix)
   - No spaces or extra characters

3. **Check file permissions**:
   ```bash
   # Ensure keystore is readable
   chmod 600 ~/.aztec/keys/keystore.json

   # Verify ownership
   ls -la ~/.aztec/keys/
   ```

4. **Verify keystore directory path**:
   - Docker Compose: Ensure `KEY_STORE_DIRECTORY` environment variable is set
   - CLI: Check that `--key-store` flag points to the correct directory

For more information on keystore configuration, see the [advanced keystore guide](./keystore/index.md).

### Docker Container Won't Start

**Symptom**: Docker container crashes immediately after starting or won't start at all.

**Cause**: Various issues including configuration errors, insufficient resources, or port conflicts.

**Solutions**:

1. **Check container logs**:
   ```bash
   docker compose logs aztec-sequencer
   ```

   Look for specific error messages that indicate the problem.

2. **Verify Docker resources**:
   - Ensure sufficient disk space: `df -h`
   - Check Docker has adequate memory allocated (16GB+ recommended)
   - Verify CPU resources are available

3. **Check environment file format**:
   ```bash
   # Verify .env file exists and is properly formatted
   cat .env

   # No spaces around = signs
   # No quotes around values (unless necessary)
   ```

4. **Verify port availability**:
   ```bash
   # Check if ports are already in use
   lsof -i :8080
   lsof -i :40400
   ```

5. **Update Docker and Docker Compose**:
   ```bash
   # Check versions
   docker --version
   docker compose version

   # Update if needed
   sudo apt-get update && sudo apt-get upgrade docker-ce docker-compose-plugin
   ```

6. **Try a clean restart**:
   ```bash
   docker compose down
   docker compose pull
   docker compose up -d
   ```

## Getting Additional Help

If you've tried the solutions above and are still experiencing issues:

1. **Gather diagnostic information**:
   - Recent log output from your node
   - Your configuration (remove private keys!)
   - Aztec version you're running
   - Operating system and hardware specs

2. **Check existing issues**:
   - Browse the [Aztec GitHub issues](https://github.com/AztecProtocol/aztec-packages/issues)
   - Search for similar problems and solutions

3. **Ask for help**:
   - Join the [Aztec Discord](https://discord.gg/aztec)
   - Post in the `#operator-faq` or `#operator-support` channel
   - Include your diagnostic information
   - Be specific about what you've already tried

## Next Steps

- Review [monitoring setup](./monitoring.md) to catch issues early with metrics and alerts
- Check the [CLI reference](../reference/cli_reference.md) for all configuration options
- Join the [Aztec Discord](https://discord.gg/aztec) for real-time operator support

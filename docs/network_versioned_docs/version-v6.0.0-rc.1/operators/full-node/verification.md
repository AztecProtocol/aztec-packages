---
id: verification
title: Verifying your full node
description: Checks to confirm your full node is healthy and reachable on the network.
displayed_sidebar: operatorsSidebar
references: ["yarn-project/stdlib/src/interfaces/aztec-node.ts", "yarn-project/aztec-node/src/aztec-node/server.ts"]
---

## Verification

Once your node is running, verify it's working correctly:

### Check Node Sync Status

Check the current sync status:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
-d '{"jsonrpc":"2.0","method":"aztec_getChainTips","params":[],"id":67}' \
http://localhost:8080 | jq -r ".result.proven.block.number"
```

Compare the output with block explorers (see [Networks page](/networks) for explorer links).

### Check Node Status

```bash
curl http://localhost:8080/status
```

### Verify Port Connectivity

```bash
# Check TCP connectivity on port 40400
nc -vz [YOUR_EXTERNAL_IP] 40400
# Should return: "Connection to [YOUR_EXTERNAL_IP] 40400 port [tcp/*] succeeded!"

# Check UDP connectivity on port 40400
nc -vu [YOUR_EXTERNAL_IP] 40400
# Should return: "Connection to [YOUR_EXTERNAL_IP] 40400 port [udp/*] succeeded!"
```

### View Logs

```bash
docker compose logs -f aztec-node
```

If all checks pass, your node should be up, running, and connected to the network.

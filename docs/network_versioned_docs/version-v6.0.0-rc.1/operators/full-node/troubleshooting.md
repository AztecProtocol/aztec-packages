---
id: troubleshooting
title: Full node troubleshooting
description: Common issues operators hit when running a full node, and how to fix them.
displayed_sidebar: operatorsSidebar
references: ["yarn-project/p2p/src/config.ts", "yarn-project/ethereum/src/config.ts"]
---

## Troubleshooting

### Port forwarding not working

**Issue**: Your node cannot connect to peers.

**Solutions**:

- Verify your external IP address matches the `P2P_IP` setting
- Check firewall rules on your router and local machine
- Test connectivity using: `nc -zv [your-ip] 40400`

### Node not syncing

**Issue**: Your node is not synchronizing with the network.

**Solutions**:

- Check L1 endpoint connectivity
- Verify both execution and consensus clients are fully synced
- Review logs for specific error messages
- Ensure L1 endpoints support high throughput

### Docker issues

**Issue**: Container won't start or crashes.

**Solutions**:

- Ensure Docker and Docker Compose are up to date
- Check disk space availability
- Verify the `.env` file is properly formatted
- Review container logs: `docker compose logs aztec-node`

---
id: troubleshooting
title: Prover troubleshooting
description: Common issues prover operators hit and how to fix them.
displayed_sidebar: operatorsSidebar
---

## Troubleshooting

### Components not communicating

**Issue**: Prover agent cannot connect to broker.

**Solutions**:
- Verify the broker IP address in `PROVER_BROKER_HOST` is correct
- Ensure port 8080 on the broker machine is accessible from agent machines
- Check firewall rules between machines allow traffic on port 8080
- Test connectivity from agent machine: `curl http://[BROKER_IP]:8080`
- Verify the broker container is running: `docker compose ps`
- Check if the broker port is exposed in docker-compose.yml
- Review broker logs for connection attempts: `docker compose logs prover-broker`

### Insufficient resources

**Issue**: Prover agent crashes or performs poorly.

**Solutions**:
- Verify your hardware meets the minimum requirements (32 cores per agent, 128 GB RAM per agent)
- Check system resource usage: `docker stats`
- Reduce `PROVER_AGENT_COUNT` if running multiple agents per machine
- Ensure no other resource-intensive processes are running
- Monitor CPU and memory usage to verify resources match your configured agent count

### Agent not picking up jobs

**Issue**: Agent logs show no job activity.

**Solutions**:
- Verify the broker is receiving jobs from the prover node
- Check broker logs for errors
- Confirm `PROVER_ID` matches your publisher address
- Ensure agent can reach the broker endpoint
- Test broker connectivity: `curl http://[BROKER_IP]:8080`

### Docker issues

**Issue**: Containers won't start or crash repeatedly.

**Solutions**:
- Ensure Docker and Docker Compose are up to date
- Check disk space availability on all machines
- Verify `.env` files are properly formatted
- Review logs for specific error messages

### Common Issues

See the [Operator FAQ](../operator-faq.md) for additional common issues and resolutions.

## Next Steps

- Monitor your prover's performance and proof submission rate
- Consider adding more prover agents for increased capacity (either by increasing `PROVER_AGENT_COUNT` or adding more machines)
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support
- Review [governance participation](../sequencer-management/governance-participation.md) for participating in governance

---
id: verification
title: Verifying your prover
description: Confirm the prover node, broker, and agents are running, connected, and proving epochs.
displayed_sidebar: operatorsSidebar
---

## Verification

A prover is working when four things line up: every container is up, the broker is
receiving jobs from the prover node, the agents are picking those jobs up, and jobs are
completing. Check them in that order.

### Containers are up

On the machine running the prover node and broker:

```bash
docker compose ps
```

Both `prover-node` and `prover-broker` should show `Up`. On each agent machine:

```bash
docker compose ps
```

Each `prover-agent` should show `Up`. A container that is restarting or has exited points to a
configuration or resource problem; see [Prover troubleshooting](./troubleshooting.md).

### The broker is receiving jobs from the prover node

The prover node discovers epochs to prove and submits them to the broker. Watch the broker
log:

```bash
docker compose logs -f prover-broker
```

On startup the broker logs `Proving Broker started`. Once the prover node begins submitting
work, the broker logs a line per job:

```
New proving job id=... epochNumber=...
```

If you never see `New proving job` lines, the prover node is not submitting work. Confirm the
node is synced and connected to the broker before looking at the agents.

### Agents are picking up jobs

On an agent machine:

```bash
docker compose logs -f prover-agent
```

A connected, working agent logs each job it takes and finishes:

```
Starting job id=... type=... inputsUri=...
Job id=... type=... completed outputUri=...
```

If the broker shows `New proving job` lines but the agents log nothing, the agents cannot
reach the broker. Confirm `PROVER_BROKER_HOST` on the agent points at the broker machine and
that port 8080 is reachable:

```bash
curl http://[BROKER_IP]:8080
```

See [Components not communicating](./troubleshooting.md#components-not-communicating).

### Jobs are completing

Back on the broker log, each finished job produces:

```
Proving job complete id=... type=... totalAttempts=...
```

Steady `New proving job` then `Proving job complete` pairs mean the full pipeline is working:
prover node to broker to agent and back. Repeated `failed` lines in the agent log, or jobs that
the broker logs as `Retrying` and then `Marking proving job as failed`, indicate agents that are
crashing or under-resourced; see [Insufficient resources](./troubleshooting.md#insufficient-resources).

### Optional: check queue depth from metrics

If you export metrics (see [Monitoring](../concepts/monitoring.md)), the broker publishes the
current queue as `aztec.proving_queue.size` and the jobs in progress as
`aztec.proving_queue.active_jobs_count`. A queue that only grows while the active-jobs count
stays at zero is the same "agents not picking up jobs" condition as the step above.

### Optional: query the node admin API

The prover node exposes an admin API on port 8880 inside the container, which is not published
to the host. Use `docker exec` to read its configuration:

```bash
docker exec -it prover-node curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: [ADMIN_API_KEY]' \
  -d '{"jsonrpc":"2.0","method":"nodeAdmin_getConfig","params":[],"id":1}'
```

The admin API requires an API key by default. The node generates one at first startup and prints it once to the logs; pass it with the `x-api-key` header (or `Authorization: Bearer [ADMIN_API_KEY]`). See [admin API key authentication](../reference/changelog/v4.md#admin-api-key-authentication).

## Next steps

- Keep an eye on the prover through [Monitoring](../concepts/monitoring.md).
- If any check above fails, work through [Prover troubleshooting](./troubleshooting.md).

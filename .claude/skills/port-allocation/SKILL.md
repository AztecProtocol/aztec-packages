---
name: port-allocation
description: Guidelines for choosing TCP/UDP ports in tests. Covers ephemeral range avoidance, Docker isolation, and the project's port allocation strategy.
---

# Port Allocation in Tests

## When to Use

Refer to this skill when:
- Adding a new service or test that needs to listen on a TCP or UDP port
- Debugging port conflicts in CI or local test runs
- Setting up Docker Compose files for test infrastructure
- Modifying `get-port` usage or adding new port allocation

## Quick Reference

1. **TypeScript tests**: Use `getPort({ port: portNumbers(10000, 32767) })` from the `get-port` package.
2. **Multiple ports**: Use the helper at `p2p/src/test-helpers/get-ports.ts` (once updated to use the safe range).
3. **Shell scripts**: Use `ci3/find_ports` (allocates from 9000-10000).
4. **Never** call bare `getPort()` or `server.listen(0)` -- both return ephemeral-range ports.
5. **Never** use sequential offsets from a base port in the ephemeral range (e.g., `40400 + i`).

```typescript
import getPort, { portNumbers } from 'get-port';

// Good: constrained to safe range
const port = await getPort({ port: portNumbers(10000, 32767) });

// Bad: returns a port from the ephemeral range (32768-60999)
const port = await getPort();
```

## Why: The Ephemeral Port Problem

Linux assigns **ephemeral ports** (32768-60999 by default, per `/proc/sys/net/ipv4/ip_local_port_range`) to outgoing TCP and UDP connections. When a test binds a listening port in this range, it risks colliding with ports the OS has assigned (or is about to assign) for outgoing connections from other processes on the same host.

The `get-port` npm package (v7) works by calling `server.listen(0)`, which makes the OS assign a port from the ephemeral range. This creates a **TOCTOU race**: between `get-port` releasing the port and the test binding to it, the OS could assign it to an outgoing connection from another process.

Outside the ephemeral range, this race is narrower -- only other processes explicitly binding to that specific port are a concern. The library maintains a process-local lock set to avoid returning the same port to concurrent callers within a single Node.js process, but this does **not** coordinate across separate processes (e.g., parallel Jest workers spawned by `--maxWorkers`).

Note: `get-port` only checks **TCP** port availability. A port returned by `get-port` may still be in use on UDP. For services that need UDP ports (like P2P), bind the UDP socket promptly after allocation.

**Caveat**: If every port in the `portNumbers()` range is taken, `get-port` silently falls back to port 0 (ephemeral range). With a 22k-port range this is unlikely in practice. If you see test ports above 32767 in logs, this fallback may be the cause.

## Port Ranges

| Range | Description | Safe for Tests? |
|-------|-------------|-----------------|
| 0-1023 | Well-known / privileged | No (requires root) |
| 1024-32767 | Registered / user ports | Yes |
| 32768-60999 | Linux ephemeral range | **No** -- avoid binding here |
| 61000-65535 | Above ephemeral range | Yes (small range) |

macOS uses a different default ephemeral range (49152-65535). The safe range of 10000-32767 avoids both platforms' ephemeral ranges.

**Our safe range for dynamic test ports: 10000-32767.** This avoids well-known services (below ~10000), the `ci3/find_ports` range (9000-10000), and both Linux and macOS ephemeral ranges.

## Anti-Patterns

### Bare `getPort()` calls

```typescript
// Bad: returns an ephemeral port
const port = await getPort();
```

Fix: always pass `{ port: portNumbers(10000, 32767) }`.

### Raw `server.listen(0)`

Some files (e.g., `foundation/src/testing/port_allocator.ts`, `blob-client/src/client/http.test.ts`) use raw `server.listen(0)` to allocate ports. This has the same problem as bare `getPort()` -- the OS assigns an ephemeral port. Use `get-port` with `portNumbers()` instead.

### Sequential offsets from a base port in the ephemeral range

```typescript
// Bad: 40400 is in the ephemeral range, offsets stay there
p2pPort: (config.p2pPort ?? 40400) + i + 1,
```

Fix: allocate each port dynamically with `getPort({ port: portNumbers(10000, 32767) })`.

## Note: Docker Network Isolation

Docker containers on bridge networks have their own network namespace, so port collisions with the host don't apply for container-to-container traffic (via service names). Port number choice doesn't matter for internal container communication.

However, Docker does **not** help when:
- Tests run directly on the host (most Jest unit/integration tests).
- Port mappings (`ports: "HOST:CONTAINER"`) expose a host-side port in the ephemeral range (e.g., the `docker-compose-bootstrap.yml` mapping of 40400).
- `network_mode: host` is used (none of our compose files currently do this).

## Current Port Allocations

| Port(s) | Service | Context | Safe? |
|----------|---------|---------|-------|
| 3000 | Grafana | Docker Compose (host-mapped) | Yes |
| 4317-4318 | OpenTelemetry | Docker Compose (host-mapped) and `METRICS_PORT` | Yes |
| 4500, 4600 | P2P bootstrap node UDP | `BOOT_NODE_UDP_PORT` in e2e tests | Yes |
| 5432 | PostgreSQL | Docker Compose (container-to-container only, not host-mapped) | Yes |
| 8080 | Aztec Node RPC / TXE | Default (`AZTEC_PORT`, `TXE_PORT`) | Yes |
| 8081 | Aztec Node standalone | Default (`AZTEC_NODE_PORT`) | Yes |
| 8545 | Anvil (Ethereum) | Default (`ANVIL_PORT`) | Yes |
| 9000/tcp | P2P / Web3Signer | Docker Compose (host-mapped) | Yes, but overlaps with `ci3/find_ports` range |
| 9001/udp | P2P UDP | Docker Compose (host-mapped) | Yes |
| 9000-10000 | CI dynamic allocation | `ci3/find_ports` (currently has no callers in the codebase) | Yes |
| 40400 | P2P default | `DEFAULT_P2P_PORT`, also host-mapped in `docker-compose-bootstrap.yml` | **In ephemeral range.** Production explicit bind is fine. Test code incrementing from here is not. |
| Random | Dynamic test ports | Bare `getPort()` / `server.listen(0)` | **No** -- returns ephemeral ports. Must use `portNumbers()`. |

## Auditing for Unsafe Port Allocation

To find bare `getPort()` calls that need updating:

```bash
grep -r 'getPort()' --include='*.ts' yarn-project/ | grep -v portNumbers | grep -v node_modules
```

To find raw `server.listen(0)` usage:

```bash
grep -r 'listen(0)' --include='*.ts' yarn-project/ | grep -v node_modules
```

To find sequential offset patterns:

```bash
grep -rn 'Port.*+.*i' --include='*.ts' yarn-project/ | grep -v node_modules
```

---
name: port-allocation
description: Guidelines for choosing TCP/UDP ports in tests and local development. Covers ephemeral range avoidance, Docker isolation, and the project's port allocation strategy.
---

# Port Allocation in Tests

## When to Use

Refer to this skill when:
- Adding a new service or test that needs to listen on a TCP or UDP port
- Debugging port conflicts in CI or local test runs
- Setting up Docker Compose files for test infrastructure
- Modifying `get-port` usage or adding new port allocation

## The Ephemeral Port Problem

Linux assigns **ephemeral ports** (32768-60999 by default, per `/proc/sys/net/ipv4/ip_local_port_range`) to outgoing TCP and UDP connections. When a test binds a listening port in this range, it risks colliding with ports the OS has assigned (or is about to assign) for outgoing connections from other processes on the same host.

The `get-port` npm package (v7) works by calling `server.listen(0)`, which makes the OS assign a port from the ephemeral range. This creates a **TOCTOU race**: between `get-port` releasing the port and the test binding to it, the OS could assign it to an outgoing connection from another process. Outside the ephemeral range, this race is limited to other `get-port` callers (which the library mitigates with an internal lock set). Inside the ephemeral range, any process on the host making outgoing connections can claim the port.

## Port Ranges

| Range | Description | Safe for Tests? |
|-------|-------------|-----------------|
| 0-1023 | Well-known / privileged | No (requires root) |
| 1024-32767 | Registered / user ports | Yes |
| 32768-60999 | Linux ephemeral range | **No** - avoid binding here |
| 61000-65535 | Above ephemeral range | Yes (small range) |

**Our safe range for dynamic test ports: 10000-32767.** This avoids well-known services (below ~10000), the `ci3/find_ports` range (9000-10000), and the ephemeral range (32768+).

## Rules for Choosing Ports

### Rule 1: Always constrain `get-port` to the safe range

Never call `getPort()` without a range. Always use `portNumbers()` to stay outside the ephemeral range:

```typescript
import getPort, { portNumbers } from 'get-port';

// Good: constrained to safe range
const port = await getPort({ port: portNumbers(10000, 32767) });

// Bad: returns a port from the ephemeral range
const port = await getPort();
```

**Caveat**: If every port in the `portNumbers()` range is taken, `get-port` silently falls back to port 0 (ephemeral range). In practice this won't happen with a 22k-port range, but be aware of this behavior.

The helper in `p2p/src/test-helpers/get-ports.ts` wraps `get-port` for multi-port allocation and should also use this range.

### Rule 2: Use `ci3/find_ports` in shell scripts

The `ci3/find_ports` script allocates from 9000-10000, which is outside the ephemeral range. Use it for bash-based test infrastructure. TypeScript tests should use `get-port` with `portNumbers()` instead.

### Rule 3: Don't use sequential offsets from a base port in the ephemeral range

`DEFAULT_P2P_PORT` is 40400, which is in the ephemeral range. Binding to a fixed, known port is fine for production (the OS won't steal it while you're bound to it). But patterns like `40400 + i + 1` in multi-node tests allocate ports that are both in the ephemeral range and subject to TOCTOU races if not pre-bound. Prefer dynamic allocation via `get-port` with a safe range for multi-node test setups.

### Rule 4: Docker network isolation helps -- but not always

Docker containers on bridge networks have their own network namespace, so port collisions with the host are impossible for container-to-container traffic. However:

- **Host-side tests** (most unit tests, Jest tests) share the host's port space and get no Docker isolation.
- **`network_mode: host`** shares the host's port space.
- **Port mappings** (`ports: "HOST:CONTAINER"`) bind the host-side port. If the host-side port is in the ephemeral range, it could conflict with the host's outgoing connections. Our current mappings (8545, 8080, etc.) are all below the ephemeral range and are safe.
- **Internal** container-to-container communication (via service names on a bridge network) is fully isolated. Port number choice doesn't matter here.

**Summary**: Docker isolation protects container-to-container traffic. It does NOT protect host-mapped ports in the ephemeral range or tests running directly on the host.

## Current Port Allocations

| Port(s) | Service | Context | Safe? |
|----------|---------|---------|-------|
| 3000 | Grafana | Docker Compose | Yes |
| 4317-4318 | OpenTelemetry | Docker Compose | Yes |
| 5432 | PostgreSQL | Docker Compose | Yes |
| 8080 | Aztec Node RPC | Default (`AZTEC_PORT`) | Yes |
| 8545 | Anvil (Ethereum) | Default (`ANVIL_PORT`) | Yes |
| 9000-10000 | CI dynamic allocation | `ci3/find_ports` | Yes |
| 40400 | P2P default | `DEFAULT_P2P_PORT` | Production OK (explicit bind). Test code incrementing from here is in the ephemeral range. |
| Random | Test ports via `get-port` | Various test files | **No** -- bare `getPort()` returns ephemeral ports. Must use `portNumbers()`. |

## Files That Need `portNumbers()` Updates

These files call `getPort()` without a range:

- `p2p/src/test-helpers/get-ports.ts` -- the shared helper; fixing this fixes all consumers
- `end-to-end/src/e2e_p2p/p2p_network.ts`
- `end-to-end/src/fixtures/setup_p2p_test.ts`
- `p2p/src/testbench/port_change.test.ts`
- `p2p/src/test-helpers/reqresp-nodes.ts`

The HA test in `end-to-end/src/composed/ha/e2e_ha_full.test.ts` uses the `(config.p2pPort ?? 40400) + i + 1` pattern and should switch to dynamic allocation.

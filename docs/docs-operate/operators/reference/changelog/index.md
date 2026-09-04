---
id: changelog
displayed_sidebar: operatorsSidebar
title: Changelog
description: Comprehensive changelog documenting configuration changes, new features, and breaking changes across Aztec node versions.
---

## Overview

This changelog documents all configuration changes, new features, and breaking changes across Aztec node versions. Each version has a dedicated page with detailed migration instructions.

## Version history

### [v6.0.0](./v6.md)

Adds a per-proposer choice of when L1-to-L2 messages are consumed.

**Key changes:**
- New setting: `SEQ_INBOX_L1_CONFIRMATIONS` (`0` consumes a bridged message in the next block, `1` waits one L1 block first)
- The archiver database is rebuilt on first start, so the node resyncs from L1

**Migration difficulty**: Low

[View full changelog →](./v6.md)

---

### [v5.2.0](./v5.2.md)

Node-operator hardening release: peerless nodes stop acting, slashing votes against your own validators are surfaced, and the RPC server gains timeout and CORS configuration.

**Key changes:**
- A node whose p2p service fails to start now exits instead of running peerless
- A peerless node warns periodically, skips proposing, and rejects incoming transactions
- Logs and metrics when the network votes to slash your own validators
- L1 event watching moved from server-side filters to bounded `eth_getLogs` polling
- New settings: `SEQ_MIN_PEERS_TO_PROPOSE`, `P2P_HEALTH_MIN_PEERS`, `GOVERNANCE_PROPOSER_FORCE_PAYLOAD_VOTE`, `RPC_HTTP_KEEP_ALIVE_TIMEOUT_MS`, `RPC_HTTP_HEADERS_TIMEOUT_MS`, `RPC_CORS_ALLOWED_HEADERS`, `RPC_CORS_ALLOWED_ORIGINS`, `RPC_CORS_ALLOW_ANY_ORIGIN` (all defaults preserve previous behaviour)

**Migration difficulty**: Low

[View full changelog →](./v5.2.md)

---

### [v4.3.x](./v4.3.md)

Bundled binaries renamed under an `aztec-` prefix on `PATH`. v4.3.1 is a bug-fix release.

**Key changes:**
- `aztec-up` no longer places bare-named binaries (`forge`, `cast`, `nargo`, `bb`, `pxe`, `txe`, `validator-client`, `blob-client`, ...) on `PATH`; use the `aztec-` prefixed names instead
- v4.3.1: fixes a block-stream error loop after finalization, prover proof-submission ordering, and released contract artifact version stamping

**Migration difficulty**: Low

[View full changelog →](./v4.3.md)

---

### [v4.2.0](./v4.2.md)

New features and configuration options for node operators.

**Key changes:**
- Blob retrieval improvements with unified retry loop

**Migration difficulty**: Low

[View full changelog →](./v4.2.md)

---

### [v4.x (Upgrade from Ignition)](./v4.md)

Major upgrade from Ignition (v2.x) to Alpha (v4.x) with significant architectural changes.

**Key changes:**
- Checkpoint-based block architecture (multiple L2 blocks per slot)
- Blob-only data publication (EIP-4844), calldata fallback removed
- Double signing slashing infrastructure
- HA signing with PostgreSQL for redundant sequencer nodes
- Admin API key authentication
- Sequencer environment variable renames
- Withdrawal delay increase (7 to 30 days)

**Migration difficulty**: High

[View full changelog →](./v4.md)

---

### [v2.0.2 (from v1.2.1)](./v2.0.2.md)

Major release with significant configuration simplification, keystore integration, and feature updates.

**Key changes:**
- Simplified L1 contract address configuration (registry-only)
- Integrated keystore system for key management
- Removed component-specific settings in favor of global configuration
- Enhanced P2P transaction collection capabilities
- New invalidation controls for sequencers

**Migration difficulty**: Moderate to High

[View full changelog →](./v2.0.2.md)

---

## Migration guides

When upgrading between versions:

1. Review the version-specific changelog for breaking changes
2. Follow the migration checklist for your node type
3. Test in a non-production environment first
4. Check the troubleshooting section for common upgrade issues
5. Join [Aztec Discord](https://discord.gg/aztec) for upgrade support

## Related resources

- [CLI Reference](../cli-reference.md) - Current command-line options
- [Node API Reference](../node-api-reference.md) - API documentation
- [Ethereum RPC Reference](../ethereum-rpc-reference.md) - L1 RPC usage

---
id: changelog
displayed_sidebar: operatorsSidebar
title: Changelog
description: Comprehensive changelog documenting configuration changes, new features, and breaking changes across Aztec node versions.
---

## Overview

This changelog documents all configuration changes, new features, and breaking changes across Aztec node versions. Each version has a dedicated page with detailed migration instructions.

## Version history

### [v5.0.0](./v5.md)

Validator signing hardening for node operators.

**Key changes:**
- Configurable timeout for validator signing operations (`VALIDATOR_SIGNING_OPERATION_TIMEOUT_MS`)
- Signing fails instead of broadcasting when the slashing-protection record is lost
- Postgres connection errors no longer crash high-availability validators

**Migration difficulty**: Low

[View full changelog →](./v5.md)

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

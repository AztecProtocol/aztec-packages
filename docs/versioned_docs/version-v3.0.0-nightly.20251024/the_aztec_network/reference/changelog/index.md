---
id: changelog
sidebar_position: 0
title: Changelog
description: Comprehensive changelog documenting configuration changes, new features, and breaking changes across Aztec node versions.
---

## Overview

This changelog documents all configuration changes, new features, and breaking changes across Aztec node versions. Each version has a dedicated page with detailed migration instructions.

## Version history

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

- [CLI Reference](../cli_reference.md) - Current command-line options
- [Node API Reference](../node_api_reference.md) - API documentation
- [Ethereum RPC Reference](../ethereum_rpc_reference.md) - L1 RPC usage

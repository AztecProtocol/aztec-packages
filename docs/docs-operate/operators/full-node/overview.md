---
id: overview
title: Full node overview
description: What a full node is and why you might run one.
displayed_sidebar: operatorsSidebar
---

## Overview

This guide covers the steps required to run a full node on Aztec using Docker Compose.

A full node allows you to connect and interact with the network, providing an interface to send and receive transactions and state updates without relying on third parties.

You should run your own full node if you want to interact with the network in the most privacy-preserving way. It's also a great way to support the Aztec network and get involved with the community.

### Minimum Hardware Requirements

- 8 core / 16 vCPU (Skylake or newer microarchitecture)
- 8 GB RAM
- 1 TB NVMe SSD
- 25 Mbps network connection

These requirements are subject to change as the network throughput increases.

**Before proceeding:** Ensure you've reviewed and completed the [prerequisites](../prerequisites.md).

This setup includes only essential settings. The `--network #release_network` flag applies network-specific defaults—see the [CLI reference](../reference/cli-reference.md) for all available configuration options.

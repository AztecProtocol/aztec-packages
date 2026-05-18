---
displayed_sidebar: operatorsSidebar
title: Cli Reference
description: A reference of the --help output when running aztec start.
references: ["yarn-project/aztec/src/cli/aztec_start_options.ts", "yarn-project/aztec/src/cli/cli.ts"]
keywords:
  [
    aztec,
    prover,
    node,
    blockchain,
    L2,
    scaling,
    ethereum,
    zero-knowledge,
    ZK,
    setup,
  ]
tags:
  - prover
  - node
  - tutorial
  - infrastructure
---

**Configuration notes:**

- The environment variable name corresponding to each flag is shown as $ENV_VAR on the right hand side.
- If two subsystems can contain the same configuration option, only one needs to be provided. For example, `--archiver.blobSinkUrl` and `--sequencer.blobSinkUrl` point to the same value.


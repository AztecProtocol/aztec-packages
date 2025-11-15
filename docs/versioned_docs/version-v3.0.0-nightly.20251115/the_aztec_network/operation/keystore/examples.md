---
draft: true
title: Complete examples
description: Real-world keystore configuration examples for common deployment scenarios.
---

## Overview

This page provides complete, ready-to-use keystore configurations for common deployment scenarios.

## Development and testing

**Simple local setup** - Single sequencer with inline keys:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xef17bcb86452f3f6a73678c01bee757e9d46d1cd0050f043c10cfc953b17bad2",
        "bls": "0x20f2f5989b66462b39229900948c7846403768fec5b76d1c2937d64e04aac4b9"
      },
      "feeRecipient": "0x0987654321098765432109876543210987654321098765432109876543210987"
    }
  ]
}
```

**Development with mnemonic** - Use test mnemonic for local development:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "mnemonic": "test test test test test test test test test test test junk",
        "addressIndex": 0
      },
      "publisher": {
        "mnemonic": "test test test test test test test test test test test junk",
        "addressIndex": 1
      },
      "feeRecipient": "0x0987654321098765432109876543210987654321098765432109876543210987"
    }
  ]
}
```

## Production configurations

**Small sequencer** - Remote signer with dedicated publisher:

```json
{
  "schemaVersion": 1,
  "remoteSigner": "https://signer.example.com:8080",
  "validators": [
    {
      "attester": {
        "eth": "0x1234567890123456789012345678901234567890",
        "bls": "0x2345678901234567890123456789012345678901"
      },
      "publisher": "0x3456789012345678901234567890123456789012",
      "coinbase": "0x4567890123456789012345678901234567890123",
      "feeRecipient": "0x0987654321098765432109876543210987654321098765432109876543210987"
    }
  ]
}
```

**Medium sequencer** - Multiple publishers for resilience:

```json
{
  "schemaVersion": 1,
  "remoteSigner": "https://signer.example.com:8080",
  "validators": [
    {
      "attester": {
        "eth": "0x1234567890123456789012345678901234567890",
        "bls": "0x2345678901234567890123456789012345678901"
      },
      "publisher": [
        "0x3456789012345678901234567890123456789012",
        "0x4567890123456789012345678901234567890123",
        "0x5678901234567890123456789012345678901234"
      ],
      "coinbase": "0x6789012345678901234567890123456789012345",
      "feeRecipient": "0x0987654321098765432109876543210987654321098765432109876543210987"
    }
  ]
}
```

**Large sequencer** - Multiple sequencers with shared infrastructure:

```json
{
  "schemaVersion": 1,
  "remoteSigner": "https://signer.example.com:8080",
  "validators": [
    {
      "attester": [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
        "0x3333333333333333333333333333333333333333"
      ],
      "publisher": [
        "0x4444444444444444444444444444444444444444",
        "0x5555555555555555555555555555555555555555",
        "0x6666666666666666666666666666666666666666"
      ],
      "coinbase": "0x7777777777777777777777777777777777777777",
      "feeRecipient": "0x0987654321098765432109876543210987654321098765432109876543210987"
    }
  ]
}
```

## Prover configurations

**Simple prover** - Single key for identity and publishing:

```json
{
  "schemaVersion": 1,
  "prover": "0x1234567890123456789012345678901234567890123456789012345678901234"
}
```

**Production prover** - Dedicated publishers:

```json
{
  "schemaVersion": 1,
  "remoteSigner": "https://signer.example.com:8080",
  "prover": {
    "id": "0x1234567890123456789012345678901234567890",
    "publisher": [
      "0x2345678901234567890123456789012345678901",
      "0x3456789012345678901234567890123456789012"
    ]
  }
}
```

**High-throughput prover** - Many publishers for parallel submission:

```json
{
  "schemaVersion": 1,
  "remoteSigner": "https://signer.example.com:8080",
  "prover": {
    "id": "0x1234567890123456789012345678901234567890",
    "publisher": [
      "0x2345678901234567890123456789012345678901",
      "0x3456789012345678901234567890123456789012",
      "0x4567890123456789012345678901234567890123",
      "0x5678901234567890123456789012345678901234",
      "0x6789012345678901234567890123456789012345"
    ]
  }
}
```

## Infrastructure provider setups

**Managed sequencers** - Separate keystores per client:

Directory structure:
```
/etc/aztec/keystores/
├── client-a.json
├── client-b.json
└── client-c.json
```

**client-a.json:**
```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xCLIENT_A_ATTESTER_ETH_KEY",
        "bls": "0xCLIENT_A_ATTESTER_BLS_KEY"
      },
      "publisher": ["0xPUBLISHER_1", "0xPUBLISHER_2"],
      "coinbase": "0xCLIENT_A_COINBASE",
      "feeRecipient": "0xCLIENT_A_FEE_RECIPIENT"
    }
  ]
}
```

**client-b.json:**
```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xCLIENT_B_ATTESTER_ETH_KEY",
        "bls": "0xCLIENT_B_ATTESTER_BLS_KEY"
      },
      "publisher": ["0xPUBLISHER_1", "0xPUBLISHER_2"],
      "coinbase": "0xCLIENT_B_COINBASE",
      "feeRecipient": "0xCLIENT_B_FEE_RECIPIENT"
    }
  ]
}
```

Set `KEY_STORE_DIRECTORY=/etc/aztec/keystores/` to load all configurations.

**Shared publisher pool:**

```json
{
  "schemaVersion": 1,
  "remoteSigner": "https://signer.example.com:8080",
  "validators": [
    {
      "attester": {
        "eth": "0xSEQUENCER_1_ETH",
        "bls": "0xSEQUENCER_1_BLS"
      },
      "publisher": {
        "mnemonic": "provider mnemonic phrase here...",
        "addressCount": 10
      },
      "feeRecipient": "0xSEQUENCER_1_FEE_RECIPIENT"
    },
    {
      "attester": {
        "eth": "0xSEQUENCER_2_ETH",
        "bls": "0xSEQUENCER_2_BLS"
      },
      "publisher": {
        "mnemonic": "provider mnemonic phrase here...",
        "addressCount": 10
      },
      "feeRecipient": "0xSEQUENCER_2_FEE_RECIPIENT"
    }
  ]
}
```

This derives 10 publisher addresses from a mnemonic, shared by all sequencers.

## Mixed storage methods

**Security-tiered setup** - Critical keys in remote signer, publishers local:

```json
{
  "schemaVersion": 1,
  "remoteSigner": "https://signer.example.com:8080",
  "validators": [
    {
      "attester": {
        "eth": "0x1234567890123456789012345678901234567890",
        "bls": "0x2345678901234567890123456789012345678901"
      },
      "publisher": [
        "0x3456789012345678901234567890123456789012345678901234567890123456",
        "0x4567890123456789012345678901234567890123456789012345678901234567"
      ],
      "coinbase": "0x5678901234567890123456789012345678901234",
      "feeRecipient": "0x0987654321098765432109876543210987654321098765432109876543210987"
    }
  ]
}
```

Attester (critical) uses remote signer; publishers (operational) use inline keys.

**Multi-region deployment** - Different remote signers per region:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "address": "0x1111111111111111111111111111111111111111",
        "remoteSignerUrl": "https://us-signer.example.com:8080"
      },
      "publisher": [
        {
          "address": "0x2222222222222222222222222222222222222222",
          "remoteSignerUrl": "https://us-signer.example.com:8080"
        }
      ],
      "feeRecipient": "0x0987654321098765432109876543210987654321098765432109876543210987"
    },
    {
      "attester": {
        "address": "0x3333333333333333333333333333333333333333",
        "remoteSignerUrl": "https://eu-signer.example.com:8080"
      },
      "publisher": [
        {
          "address": "0x4444444444444444444444444444444444444444",
          "remoteSignerUrl": "https://eu-signer.example.com:8080"
        }
      ],
      "feeRecipient": "0x1234567890123456789012345678901234567890123456789012345678901234"
    }
  ]
}
```

## Next steps

- See [Troubleshooting](./troubleshooting.md) for common issues
- Return to [Advanced Configuration Patterns](./advanced_patterns.md) for more details
- Review [Key Storage Methods](./storage_methods.md) for storage options

---
id: advanced_keystore_guide
sidebar_position: 2
title: Advanced keystore usage
description: Learn how to configure keystores with remote signers, mnemonics, JSON V3 keystores, and multiple publishers for enhanced security and flexibility.
---

## Overview

This guide covers advanced keystore configurations for Aztec validators and provers, including secure key storage methods, multi-account setups, and infrastructure provider scenarios.

## Prerequisites

Before proceeding, you should:

- Be familiar with running a sequencer or prover node
- Understand the basic keystore structure from the sequencer setup guide
- Have access to appropriate key management infrastructure (if using remote signers)

## Keystore components

The keystore manages several types of keys and addresses depending on your role:

**Validators:**
- **Attester** (required): Your validator's identity. Signs block proposals and attestations.
- **Publisher** (optional): Submits transactions to L1. Defaults to attester if not set. Must be funded with ETH.
- **Coinbase** (optional): Receives L1 rewards. Defaults to attester address if not set.
- **Fee Recipient** (required): Aztec address that receives unburnt L2 transaction fees.

**Provers:**
- **Prover ID**: Ethereum address identifying the prover and receiving rewards.
- **Publisher**: Submits proof transactions to L1. Must be funded with ETH.

**Slashers:**
- **Slasher**: Creates slash payloads on L1 when detecting validator misbehavior.

## Key storage methods

The keystore supports four methods for storing and accessing private keys. These methods can be mixed within a single configuration.

### Private keys (inline)

The simplest method is to include private keys directly in the keystore:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": "0x1234567890123456789012345678901234567890123456789012345678901234",
      "feeRecipient": "0x1234567890123456789012345678901234567890123456789012345678901234"
    }
  ]
}
```

:::warning
Inline private keys are convenient for testing but should be avoided in production. Use remote signers or encrypted keystores for production deployments.
:::

### Remote signers (Web3Signer)

Remote signers keep private keys in a separate, secure signing service. This is the recommended approach for production environments.

The keystore supports [Web3Signer](https://docs.web3signer.consensys.io/) endpoints configured at three levels:

**Global level** (applies to all accounts):

```json
{
  "schemaVersion": 1,
  "remoteSigner": "https://signer.example.com:8080",
  "validators": [
    {
      "attester": "0x1234567890123456789012345678901234567890",
      "feeRecipient": "0x1234567890123456789012345678901234567890123456789012345678901234"
    }
  ]
}
```

**Validator block level** (applies to all accounts in a validator configuration):

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": "0x1234567890123456789012345678901234567890",
      "feeRecipient": "0x1234567890123456789012345678901234567890123456789012345678901234",
      "remoteSigner": "https://signer.example.com:8080"
    }
  ]
}
```

**Account level** (applies to a specific key):

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "address": "0x1234567890123456789012345678901234567890",
        "remoteSignerUrl": "https://signer.example.com:8080"
      },
      "feeRecipient": "0x1234567890123456789012345678901234567890123456789012345678901234"
    }
  ]
}
```

#### Client certificate authentication

For remote signers requiring client certificates:

```json
{
  "schemaVersion": 1,
  "remoteSigner": {
    "remoteSignerUrl": "https://signer.example.com:8080",
    "certPath": "/path/to/client-cert.p12",
    "certPass": "certificate-password"
  },
  "validators": [...]
}
```

### JSON V3 encrypted keystores

JSON V3 keystores provide standard Ethereum-compatible encrypted key storage.

**Single file:**

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "path": "/path/to/keystore.json",
        "password": "keystore-password"
      },
      "feeRecipient": "0x1234567890123456789012345678901234567890123456789012345678901234"
    }
  ]
}
```

**Directory of keystores:**

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": "0x1234567890123456789012345678901234567890",
      "publisher": {
        "path": "/path/to/keystores/",
        "password": "shared-password"
      },
      "feeRecipient": "0x1234567890123456789012345678901234567890123456789012345678901234"
    }
  ]
}
```

All `.json` files in the directory will be loaded using the provided password.

### Mnemonics (BIP44 derivation)

Mnemonics derive multiple keys from a single seed phrase using [BIP44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki) paths.

**Single key** (default path `m/44'/60'/0'/0/0`):

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": "0x1234567890123456789012345678901234567890",
      "publisher": {
        "mnemonic": "test test test test test test test test test test test junk"
      },
      "feeRecipient": "0x1234567890123456789012345678901234567890123456789012345678901234"
    }
  ]
}
```

**Multiple sequential keys:**

```json
{
  "publisher": {
    "mnemonic": "test test test test test test test test test test test junk",
    "addressCount": 4
  }
}
```

Generates 4 keys at paths `m/44'/60'/0'/0/0` through `m/44'/60'/0'/0/3`.

**Custom derivation paths:**

```json
{
  "publisher": {
    "mnemonic": "test test test test test test test test test test test junk",
    "accountIndex": 5,
    "addressIndex": 3,
    "addressCount": 2
  }
}
```

Derives keys at `m/44'/60'/5'/0/3` and `m/44'/60'/5'/0/4`.

**Path derivation table:**

| addressIndex | addressCount | accountIndex | accountCount | Resulting Paths |
|-------------|-------------|-------------|-------------|-----------------|
| - | - | - | - | `m/44'/60'/0'/0/0` |
| 3 | - | - | - | `m/44'/60'/0'/0/3` |
| - | - | 5 | - | `m/44'/60'/5'/0/0` |
| 3 | - | 5 | - | `m/44'/60'/5'/0/3` |
| 3 | 2 | 5 | - | `m/44'/60'/5'/0/3`, `m/44'/60'/5'/0/4` |
| 3 | 2 | 5 | 2 | `m/44'/60'/5'/0/3`, `m/44'/60'/5'/0/4`, `m/44'/60'/6'/0/3`, `m/44'/60'/6'/0/4` |

## Advanced configuration patterns

### Multiple publishers

Multiple publisher accounts provide:
- **Load distribution**: Spread L1 transaction costs across accounts
- **Parallelization**: Submit multiple transactions simultaneously
- **Resilience**: Continue operating if one publisher runs out of gas

**Array of publishers:**

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": "0x1234567890123456789012345678901234567890",
      "publisher": [
        "0xPUBLISHER_1_PRIVATE_KEY",
        "0xPUBLISHER_2_PRIVATE_KEY",
        "0xPUBLISHER_3_PRIVATE_KEY"
      ],
      "feeRecipient": "0x1234567890123456789012345678901234567890123456789012345678901234"
    }
  ]
}
```

**Mixed storage methods:**

```json
{
  "schemaVersion": 1,
  "remoteSigner": "https://signer1.example.com:8080",
  "validators": [
    {
      "attester": "0x1234567890123456789012345678901234567890",
      "publisher": [
        "0xLOCAL_PRIVATE_KEY",
        "0xREMOTE_SIGNER_ADDRESS_1",
        {
          "address": "0xREMOTE_SIGNER_ADDRESS_2",
          "remoteSignerUrl": "https://signer2.example.com:8080"
        },
        {
          "mnemonic": "test test test test test test test test test test test junk",
          "addressCount": 2
        }
      ],
      "feeRecipient": "0x1234567890123456789012345678901234567890123456789012345678901234"
    }
  ]
}
```

This creates 5 publishers:
1. Local private key
2. Address in default remote signer (signer1.example.com)
3. Address in alternative remote signer (signer2.example.com)
4. Two mnemonic-derived addresses

:::warning
All publisher accounts must be funded with ETH. Monitor balances to avoid missed proposals or proofs.
:::

### Multiple validators

Run multiple validators in a single node using two approaches:

**Option 1: Shared configuration**

Multiple attesters sharing the same publisher, coinbase, and fee recipient:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": [
        "0xVALIDATOR_1_PRIVATE_KEY",
        "0xVALIDATOR_2_PRIVATE_KEY"
      ],
      "publisher": ["0xSHARED_PUBLISHER"],
      "coinbase": "0xSHARED_COINBASE",
      "feeRecipient": "0xSHARED_FEE_RECIPIENT"
    }
  ]
}
```

**Option 2: Separate configurations**

Each validator with its own publisher, coinbase, and fee recipient:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": "0xVALIDATOR_1_PRIVATE_KEY",
      "publisher": ["0xPUBLISHER_1"],
      "coinbase": "0xCOINBASE_1",
      "feeRecipient": "0xFEE_RECIPIENT_1"
    },
    {
      "attester": "0xVALIDATOR_2_PRIVATE_KEY",
      "publisher": ["0xPUBLISHER_2"],
      "coinbase": "0xCOINBASE_2",
      "feeRecipient": "0xFEE_RECIPIENT_2"
    }
  ]
}
```

See the [Advanced Sequencer Setup](./advanced_sequencer_setup.md) guide for more details on multi-validator configurations.

### Infrastructure provider scenarios

**Scenario 1: Multiple validators with isolation**

For validators requiring complete separation, use separate keystore files:

**keystore-validator-a.json:**
```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": "0xVALIDATOR_A_KEY",
      "feeRecipient": "0xFEE_RECIPIENT_A"
    }
  ]
}
```

**keystore-validator-b.json:**
```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": "0xVALIDATOR_B_KEY",
      "feeRecipient": "0xFEE_RECIPIENT_B"
    }
  ]
}
```

Point `KEY_STORE_DIRECTORY` to the directory containing both files.

**Scenario 2: Shared publisher infrastructure**

Multiple validators sharing a publisher pool for simplified gas management:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": "0xVALIDATOR_1_KEY",
      "publisher": ["0xPUBLISHER_1", "0xPUBLISHER_2"],
      "feeRecipient": "0xFEE_RECIPIENT_1"
    },
    {
      "attester": "0xVALIDATOR_2_KEY",
      "publisher": ["0xPUBLISHER_1", "0xPUBLISHER_2"],
      "feeRecipient": "0xFEE_RECIPIENT_2"
    }
  ]
}
```

Both validators share publishers while maintaining separate identities and fee recipients.

### Prover configurations

**Simple prover** (uses same key for identity and publishing):

```json
{
  "schemaVersion": 1,
  "prover": "0xPROVER_PRIVATE_KEY"
}
```

**Prover with dedicated publishers:**

```json
{
  "schemaVersion": 1,
  "prover": {
    "id": "0xPROVER_IDENTITY_ADDRESS",
    "publisher": [
      "0xPUBLISHER_1_PRIVATE_KEY",
      "0xPUBLISHER_2_PRIVATE_KEY"
    ]
  }
}
```

The `id` receives prover rewards while `publisher` accounts submit proofs.

## Complete configuration examples

### Production validator with remote signer

```json
{
  "schemaVersion": 1,
  "remoteSigner": {
    "remoteSignerUrl": "https://signer.example.com:8080",
    "certPath": "/etc/certs/client.p12",
    "certPass": "cert-password"
  },
  "validators": [
    {
      "attester": "0xVALIDATOR_ADDRESS",
      "publisher": {
        "mnemonic": "test test test test test test test test test test test junk",
        "addressCount": 3
      },
      "coinbase": "0xCOINBASE_ADDRESS",
      "feeRecipient": "0xFEE_RECIPIENT_AZTEC_ADDRESS"
    }
  ]
}
```

**Features:**
- Attester stored in remote signer with client certificate authentication
- Three mnemonic-derived publishers for load distribution
- Explicit coinbase and fee recipient addresses

### Multi-validator infrastructure provider

```json
{
  "schemaVersion": 1,
  "remoteSigner": "https://signer.example.com:8080",
  "validators": [
    {
      "attester": "0xVALIDATOR_1_ADDRESS",
      "publisher": [
        "0xPUBLISHER_1_PRIVATE_KEY",
        {
          "path": "/path/to/keystore.json",
          "password": "keystore-password"
        }
      ],
      "feeRecipient": "0xFEE_RECIPIENT_1"
    },
    {
      "attester": "0xVALIDATOR_2_ADDRESS",
      "publisher": "0xPUBLISHER_2_PRIVATE_KEY",
      "feeRecipient": "0xFEE_RECIPIENT_2",
      "remoteSigner": "https://signer2.example.com:9090"
    }
  ]
}
```

**Features:**
- Global remote signer for most accounts
- Validator 1: Mixed publishers (local key + JSON V3 keystore)
- Validator 2: Override remote signer configuration
- Separate fee recipients for each validator

### Complete system with validator, prover, and slasher

```json
{
  "schemaVersion": 1,
  "remoteSigner": {
    "remoteSignerUrl": "https://signer.example.com:8080",
    "certPath": "/etc/certs/client.p12",
    "certPass": "cert-password"
  },
  "slasher": "0xSLASHER_ADDRESS",
  "validators": [
    {
      "attester": "0xVALIDATOR_ADDRESS",
      "publisher": {
        "mnemonic": "test test test test test test test test test test test junk",
        "addressCount": 3
      },
      "coinbase": "0xCOINBASE_ADDRESS",
      "feeRecipient": "0xFEE_RECIPIENT_AZTEC_ADDRESS"
    }
  ],
  "prover": {
    "id": "0xPROVER_ADDRESS",
    "publisher": [
      "0xPROVER_PUBLISHER_1",
      "0xPROVER_PUBLISHER_2"
    ]
  }
}
```

**Features:**
- All sensitive keys (attester, slasher, prover ID) in remote signer
- Multiple mnemonic-derived publishers for validator
- Dedicated publisher accounts for prover
- Client certificate authentication for remote signer

## Verification

To verify your keystore configuration:

1. **Validate JSON syntax**: Use a JSON validator or `jq` to check formatting
2. **Check node startup logs**: Confirm all expected validator/prover identities are loaded
3. **Verify remote signer connectivity**: Review connection logs if using remote signers
4. **Confirm account funding**: Ensure all publisher accounts have sufficient ETH
5. **Test operations**: Verify the node can sign and submit transactions successfully

Example log check:

```bash
docker compose logs aztec-sequencer | grep -i "validator\|loaded"
```

## Troubleshooting

### Remote signer issues

**Connection failures:**
- Verify remote signer URL and accessibility
- Check network connectivity and firewall rules
- Validate client certificate path and password
- Review remote signer service logs

**Authentication errors:**
- Confirm certificate file format (.p12)
- Verify certificate password is correct
- Check certificate has not expired
- Ensure certificate is authorized by the remote signer

### Keystore format issues

**JSON V3 decryption errors:**
- Verify password is correct
- Ensure file is valid JSON V3 format
- Check file permissions
- Confirm path is absolute (not relative)

**Mnemonic derivation mismatches:**
- Verify mnemonic phrase (word count and order)
- Check derivation parameters (accountIndex, addressIndex)
- Use [iancoleman.io/bip39](https://iancoleman.io/bip39/) to verify expected addresses
- Ensure BIP44 derivation (not BIP32)

### Configuration errors

**Duplicate attester:**
- Each attester address must appear only once across all keystores
- For high availability, use same attester with different publishers on separate nodes
- Review all keystore files in `KEY_STORE_DIRECTORY`

**Publisher funding issues:**
- Monitor publisher balances regularly
- Set up automated balance alerts
- Maintain sufficient ETH buffer (recommend 0.1 ETH minimum)
- Use multiple publishers to distribute load

**Invalid keystore paths:**
- Use absolute paths, not relative paths
- Verify directory exists and is readable
- Check file permissions on keystore files
- Ensure Docker volume mounts are configured correctly

## Security best practices

1. **Never commit private keys**: Use `.gitignore` to exclude keystore files from version control
2. **Use remote signers in production**: Keep sensitive keys in dedicated signing infrastructure
3. **Encrypt keystores**: Use JSON V3 encryption with strong passwords for local keystores
4. **Secure file permissions**: Restrict keystore file access (e.g., `chmod 600 keystore.json`)
5. **Backup securely**: Maintain encrypted backups of mnemonics and keystore files
6. **Monitor access**: Log and audit access to keystore files and remote signers
7. **Rotate publishers**: Periodically rotate publisher keys to limit exposure

## Next Steps

- Review [How to Run a Sequencer Node](./sequencer_management.md) for operational guidance
- Learn about [Advanced Sequencer Setup](./advanced_sequencer_setup.md) for high availability
- Join the [Aztec Discord](https://discord.gg/aztec) for community support

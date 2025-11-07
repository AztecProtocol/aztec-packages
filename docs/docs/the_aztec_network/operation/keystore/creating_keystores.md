---
id: creating_keystores
sidebar_position: 0
title: Creating Sequencer Keystores
description: Learn how to create sequencer keystores for sequencers and provers using the Aztec CLI.
---

## Overview

Keystores are configuration files that store the cryptographic keys and addresses your sequencer node needs to operate on the Aztec network. This guide shows you how to create basic keystores using the Aztec CLI's `validator-keys` commands.

For advanced configurations like multiple publishers, encrypted keystores, or remote signers, see the guides linked at the end of this document.

## What Are Sequencer Keystores?

A sequencer keystore is a JSON file (typically named `keystore.json`) that contains:

- **Attester keys**: Your sequencer's identity used to sign block proposals and attestations (includes both Ethereum and BLS keys)
- **Publisher keys**: Keys used to submit blocks to L1 (requires ETH for gas)
- **Coinbase address**: Ethereum address that receives L1 block rewards
- **Fee recipient**: Aztec address that receives L2 transaction fees

## Prerequisites

Before creating keystores, ensure you have:

- The Aztec CLI installed (version 2.1.2 or later)
- Basic understanding of Ethereum addresses and private keys

Verify your CLI installation:

```bash
aztec --version
```

:::note Required Parameters
When creating a new keystore, the CLI requires the `--fee-recipient` flag for optional L2 tips (this is not the coinbase where L1 rewards accumulate).

If you don't want to specify a fee recipient now, use the zero address:
```bash
--fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000
```

The CLI automatically generates a mnemonic (and BLS keys) if you don't provide one via `--mnemonic`.
:::

## Creating Your First Keystore

### Basic Sequencer Keystore

Create a sequencer keystore with automatically generated keys:

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000
```

This command:
- Automatically generates a mnemonic for key derivation
- Generates Ethereum keys for your sequencer (attester and publisher)
- Generates BLS keys required for staking
- Creates a keystore at `~/.aztec/keystore/key1.json`
- Outputs your sequencer's attester addresses and BLS public keys

:::tip Provide Your Own Mnemonic
For deterministic key generation or to regenerate keys later, provide your own mnemonic:
```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --mnemonic "your twelve word mnemonic phrase here"
```
Save your mnemonic securely - you'll need it to regenerate keys or add more validators later.
:::

**Example output:**

```text
Wrote sequencer keystore to /Users/your-name/.aztec/keystore/key1.json

acc1:
  attester:
    eth: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
    bls: 0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890
```

:::tip Save Your Keys
The keystore file contains private keys. Back it up securely and never commit it to version control.
:::

## Understanding the Keystore Output

After creation, you'll have a `keystore.json` file with this structure:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0x1234567890123456789012345678901234567890123456789012345678901234",
        "bls": "0x2345678901234567890123456789012345678901234567890123456789012345"
      },
      "coinbase": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "feeRecipient": "0x0000000000000000000000000000000000000000000000000000000000000000"
    }
  ]
}
```

**Key fields:**

- **`attester`**: Object containing both Ethereum (eth) and BLS keys for your sequencer identity
  - **`eth`**: Ethereum private key for signing blocks and attestations
  - **`bls`**: BLS private key required for staking (automatically generated)
- **`coinbase`**: Ethereum address receiving L1 rewards (defaults to attester eth address)
- **`feeRecipient`**: Aztec address receiving L2 fees

:::note Publishers
By default, no publisher accounts are generated (`--publisher-count` defaults to 0). The attester key is used for both sequencing and publishing. To add dedicated publisher accounts, use `--publisher-count N` when creating the keystore.
:::

## Specifying Output Location

### Custom Directory and Filename

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --mnemonic "your twelve word mnemonic phrase here for key derivation" \
  --data-dir ~/my-sequencer/keys \
  --file sequencer1.json
```

This creates the keystore at `~/my-sequencer/keys/sequencer1.json`.

### Default Behavior

If you don't specify `--data-dir` or `--file`:
- **Default directory**: `~/.aztec/keystore/`
- **Default filename**: `key1.json` (or `key2.json`, `key3.json`, etc. if the file exists)

## Verifying Your Keystore

Verify the keystore is valid JSON:

```bash
cat ~/.aztec/keystore/key1.json | jq .
```

If this command outputs formatted JSON, your keystore syntax is valid.

## Common Issues

### "fee-recipient is required"

**Error message:**
```text
error: required option '--fee-recipient <address>' not specified
```

**Solution:** The CLI requires the `--fee-recipient` flag. If you don't need to specify one now, use the zero address:

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --mnemonic "your twelve word mnemonic phrase here for key derivation"
```

You can edit the keystore afterward to add the actual fee recipient address.

### Verifying BLS Keys

Check that your keystore contains BLS keys:

```bash
jq '.validators[0].attester.bls' ~/.aztec/keystore/key1.json
```

This should output your BLS private key (a hex string starting with `0x`). BLS keys are automatically generated for all keystores created with the `validator-keys new` command.

### Permission Denied

**Error message:**
```text
Error: permission denied
```

**Solution:** Ensure you have write permissions for the target directory:

```bash
# Create directory if it doesn't exist
mkdir -p ~/aztec-sequencer/keys

# Set proper permissions
chmod 755 ~/aztec-sequencer/keys
```

## Next Steps

Now that you've created a basic keystore, explore advanced options and configurations:

### Advanced Keystore Options

**Multiple sequencers and publishers:**
- [Advanced Configuration Patterns](./advanced_patterns.md) - Multiple sequencers per node, multiple publishers for redundancy

**Secure key storage:**
- [Key Storage Methods](./storage_methods.md) - Remote signers, encrypted keystores, mnemonics

**Complete examples:**
- [Advanced Configuration Patterns](./advanced_patterns.md) - High availability sequencers, production deployments with remote signers, delegated stake providers, infrastructure provider setups

**Troubleshooting and security:**
- [Troubleshooting and Best Practices](./troubleshooting.md) - Common issues and security recommendations

### Setting Up Your Node

Once you have your keystore:

**For sequencers:**
1. Fund your publisher addresses with at least 0.1 ETH
2. Configure your sequencer node - see [Running a Sequencer](../../setup/sequencer_management.md)
3. Register your sequencer with the network via zkPassport
4. Monitor your node for successful attestations

## CLI Reference

### Basic Commands

```bash
# Create new keystore
aztec validator-keys new [options]

# Add to existing keystore
aztec validator-keys add <existing-keystore-path> [options]

# Generate BLS keypair only
aztec generate-bls-keypair [options]
```

### Common Options

| Option | Description | Default |
|--------|-------------|---------|
| `--fee-recipient` | Aztec address for L2 fees (required flag) | None |
| `--mnemonic` | Mnemonic for ETH/BLS key derivation | Auto-generated |
| `--ikm` | Initial keying material for BLS (alternative to mnemonic) | None |
| `--data-dir` | Directory for keystores | `~/.aztec/keystore` |
| `--file` | Keystore filename | `key1.json` |
| `--count` | Number of sequencers | `1` |
| `--publisher-count` | Publishers per sequencer | `0` |
| `--bls-path` | EIP-2334 derivation path for BLS keys | `m/12381/3600/0/0/0` |

For the complete list of options, run:

```bash
aztec validator-keys new --help
aztec validator-keys add --help
```

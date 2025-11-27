---
id: creating_keystores
sidebar_position: 0
title: Creating Sequencer Keystores
description: Learn how to create sequencer keystores for running validators on the Aztec network using the Aztec CLI.
---

## Overview

Keystores are configuration files that store the cryptographic keys and addresses your sequencer node needs to operate on the Aztec network. This guide shows you how to create keystores using the Aztec CLI's `validator-keys` commands.

A keystore contains:
- **Attester keys**: Your sequencer's identity (Ethereum and BLS keys for signing proposals and attestations)
- **Publisher keys**: Keys used to submit blocks to L1 (requires ETH for gas)
- **Fee recipient**: Aztec address for L2 transaction fees (currently not used)
- **Coinbase address**: Ethereum address receiving L1 block rewards (optional, defaults to attester address)

## Prerequisites

Before creating keystores, ensure you have:

- Basic understanding of Ethereum addresses and private keys
- Access to an Ethereum L1 RPC endpoint
- Foundry toolkit installed (for creating publisher addresses)

## Installing the Aztec CLI

First, install the Aztec CLI using the official installer:

```bash
bash -i <(curl -s https://install.aztec.network)
```

Then install the correct version for the current network:

```bash
aztec-up 2.1.5
```

Verify your CLI installation:

```bash
aztec --version
```

## Recommended Setup: Multiple Validators with Shared Publisher

This approach creates multiple sequencer identities (validators) that share a single publisher address for submitting transactions to L1. This is the recommended configuration for production deployments.

### Step 1: Generate Your Keystores

Set your L1 RPC endpoint:

```bash
export ETH_RPC=https://ethereum-rpc.publicnode.com
```

Generate 5 validators with staker output:

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --staker-output \
  --gse-address 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f \
  --l1-rpc-urls $ETH_RPC \
  --count 5
```

**What this command does:**
- Generates a mnemonic for key derivation (save this securely!)
- Creates 5 sequencer identities (validators) with Ethereum and BLS keys
- Generates public keystore data for the staking dashboard
- Saves files to `~/.aztec/keystore/`

**Example output:**

```
No mnemonic provided, generating new one...
Using new mnemonic:

absent city nephew garment million badge front text memory grape two lizard

Wrote validator keystore to /Users/your-name/.aztec/keystore/key1.json
Wrote staker output for 5 validator(s) to /Users/your-name/.aztec/keystore/key1_staker_output.json

acc1:
  attester:
    eth: 0x8E76a8B8D66E0A56E241F2768fD2ad4eba07E565
    bls: 0x29eaf46e4699e33a1abe7300258567c624a7304a2134e31aa2609437f281d81d
acc2:
  attester:
    eth: 0x2037b472537a4246B1A7325f327028EF450ba0Ef
    bls: 0x8d7eb7d9436ac6cb9b8f1c211673ea228c7f438882e6438b2caefca753df28e8
acc3:
  attester:
    eth: 0x0c14593f7465DeDbb86d68982374BB05F4C60386
    bls: 0xad1cccf512d2f180238af795831344445f7ac47e2d623f3dac854e93e5b1e76d
acc4:
  attester:
    eth: 0x4D213928988f0123f6b3B4A377F856812F08E831
    bls: 0xa90f5889dddd4cd6bc5a28db5e0db60d3cbf5147eb6e82b313024b2d0634110e
acc5:
  attester:
    eth: 0x29f147Da38d5F66bB84e791969b365c796829c92
    bls: 0x0d683001c2ce866e322f0c7509f087a909508787d125336931aa9168d2a1f95b

Staker outputs:
[... JSON array with public keys for all 5 validators ...]
```

:::warning Save Your Mnemonic
The mnemonic is the **only thing you must save** to regenerate your keys. Store it securely offline.
:::

**Files created:**
- `~/.aztec/keystore/key1.json` - Private keystore with all 5 validators
- `~/.aztec/keystore/key1_staker_output.json` - Public keystore for staking dashboard

### Step 2: Create a Dedicated Publisher Address

:::tip Important
The publisher mnemonic is **separate** from your validator mnemonic. You'll manage two different mnemonics:
1. **Validator mnemonic** - Generated in Step 1 for attester keys
2. **Publisher mnemonic** - Generated in this step for L1 transaction signing
:::

Generate a separate address for publishing transactions to L1 using Foundry:

```bash
cast wallet new-mnemonic --words 24
```

**Example output:**

```
Successfully generated a new mnemonic.
Phrase:
word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15 word16 word17 word18 word19 word20 word21 word22 word23 word24

Accounts:
- Account 0:
Address:     0xE434A95e816991E66bF7052955FD699aEf8a286b
Private key: 0x7988a4a7...79f058a0
```

**Save:**
- The 24-word mnemonic (for recovery)
- The private key (you'll add this to your keystore)

### Step 3: Add Publisher to Keystore

:::note Manual Step Required
Currently, you need to manually edit the keystore to add the publisher private key to each validator.
:::

Open `~/.aztec/keystore/key1.json` and add the `publisher` field to each validator object:

**Before:**
```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0x5340b7e44a3a9202ee1a66dfb3db9dd548a1df6ae394dec7d5d44081d5bc0e91",
        "bls": "0x08eb53286cdbf219b113c1a34fa0ec894427cc073b06aaa3f904b0c2371b95b5"
      },
      "feeRecipient": "0x0000000000000000000000000000000000000000000000000000000000000000"
    }
  ]
}
```

**After adding publisher:**
```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0x5340b7e44a3a9202ee1a66dfb3db9dd548a1df6ae394dec7d5d44081d5bc0e91",
        "bls": "0x08eb53286cdbf219b113c1a34fa0ec894427cc073b06aaa3f904b0c2371b95b5"
      },
      "feeRecipient": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "publisher": ["0xa9fef27bdc5835a92796247db6d0341481b4c4783ebdf77fdff32ae7cfe63352"]
    },
    {
      "attester": {
        "eth": "0x3d0c51086b79f69d8543daba593e2b836ce35b8b7ecc6f4d2f4e1fa929a64d7d",
        "bls": "0x11cde56615f6663e9b23b0f2e3bda995158edebe64d82a5106d39a9540c21fe8"
      },
      "feeRecipient": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "publisher": ["0xa9fef27bdc5835a92796247db6d0341481b4c4783ebdf77fdff32ae7cfe63352"]
    }
    // ... repeat for all 5 validators
  ]
}
```

**Important:**
- Use the **same publisher private key** for all validators
- The publisher must be an array: `["0x..."]`
- Add the publisher field to **every validator** in the array

### Step 4: Fund the Publisher Address

Your publisher address needs ETH to pay for L1 gas when submitting proposals.

**Funding requirement:** At least **0.3 ETH** for 5 validators (0.1 ETH per validator recommended)

Check the publisher balance:

```bash
cast balance 0xE434A95e816991E66bF7052955FD699aEf8a286b --rpc-url https://ethereum-rpc.publicnode.com
```

:::warning Monitor Publisher Balance
Set up monitoring to alert when the publisher balance falls below 0.5 ETH to prevent failed block publications.
:::

### Step 5: Register Your Validators

Use the public keystore (`key1_staker_output.json`) to register your validators on the staking dashboard. See [Registering a Sequencer](../../setup/sequencer_management.md#next-steps-registering-your-sequencer) for details.

## Alternative: Single Validator Setup

For testing or simpler setups, you can create a single validator that uses its attester key as the publisher.

### Basic Single Validator

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --staker-output \
  --gse-address 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f \
  --l1-rpc-urls $ETH_RPC
```

This creates:
- One validator with attester keys
- No separate publisher (attester key used for publishing)
- Private keystore at `~/.aztec/keystore/keyN.json`
- Public keystore at `~/.aztec/keystore/keyN_staker_output.json`

:::info When to Use Single Validator
Use single validator setup for:
- Testing and development
- Simple deployments with one sequencer identity
- When you don't need to isolate attester and publisher keys
:::

## Understanding Keystore Structure

### Private Keystore Format

The private keystore (`key1.json`) contains sensitive private keys:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0x...",  // Ethereum private key - sequencer identifier
        "bls": "0x..."   // BLS private key - signs proposals and attestations
      },
      "publisher": ["0x..."],  // Publisher private key(s) for L1 submissions
      "feeRecipient": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "coinbase": "0x..."  // Optional: custom address for L1 rewards
    }
  ]
}
```

**Field descriptions:**

- **attester.eth**: Derives the address that serves as your sequencer's unique identifier
- **attester.bls**: Signs proposals and attestations, used for staking operations
- **publisher**: Array of private keys for submitting signed messages to L1 (pays gas)
- **feeRecipient**: L2 fee recipient (not currently used, set to all zeros)
- **coinbase**: L1 block reward recipient (optional, defaults to attester address)

### Public Keystore Format

The public keystore (`key1_staker_output.json`) contains only public information safe to share:

```json
[
  {
    "attester": "0xYOUR_ATTESTER_ADDRESS",
    "publicKeyG1": {
      "x": "0x...",
      "y": "0x..."
    },
    "publicKeyG2": {
      "x0": "0x...",
      "x1": "0x...",
      "y0": "0x...",
      "y1": "0x..."
    },
    "proofOfPossession": {
      "x": "0x...",
      "y": "0x..."
    }
  }
]
```

This file is used for registration on the staking dashboard and contains no private keys.

## Specifying Output Location

### Custom Directory and Filename

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --staker-output \
  --gse-address 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f \
  --l1-rpc-urls $ETH_RPC \
  --mnemonic "your twelve word mnemonic phrase here for key derivation" \
  --data-dir ~/my-sequencer/keys \
  --file sequencer1.json
```

This creates keystores at:
- `~/my-sequencer/keys/sequencer1.json` (private keystore)
- `~/my-sequencer/keys/sequencer1_staker_output.json` (public keystore)

### Default Behavior

If you don't specify `--data-dir` or `--file`:
- **Default directory**: `~/.aztec/keystore/`
- **Default filename**: `key1.json`, `key2.json`, etc. (auto-increments)

## Providing Your Own Mnemonic

For deterministic key generation or to add validators to an existing mnemonic:

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --staker-output \
  --gse-address 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f \
  --l1-rpc-urls $ETH_RPC \
  --mnemonic "your existing twelve word mnemonic phrase here" \
  --count 5
```

This regenerates the same validators if you've used this mnemonic before, or creates new ones at the next derivation indices.

## Verifying Your Keystore

Verify the keystore is valid JSON:

```bash
cat ~/.aztec/keystore/key1.json | jq .
```

Check validator count:

```bash
jq '.validators | length' ~/.aztec/keystore/key1.json
```

Verify BLS keys are present:

```bash
jq '.validators[0].attester.bls' ~/.aztec/keystore/key1.json
```

Extract attester addresses:

```bash
# Get attester ETH private key (to derive address)
jq -r '.validators[0].attester.eth' ~/.aztec/keystore/key1.json
```

## Common Issues

### Missing fee-recipient Flag

**Error message:**
```
error: required option '--fee-recipient <address>' not specified
```

**Solution:** The CLI requires the `--fee-recipient` flag. Use the zero address:

```bash
--fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000
```

### RPC Connection Issues

**Error message:**
```
Error: HTTP request failed
```

**Solutions:**
- Verify `$ETH_RPC` is set correctly: `echo $ETH_RPC`
- Test RPC connectivity: `cast block-number --rpc-url $ETH_RPC`
- Try a different RPC provider if the current one is rate-limited

### Permission Denied

**Error message:**
```
Error: permission denied
```

**Solution:** Ensure you have write permissions for the target directory:

```bash
mkdir -p ~/.aztec/keystore
chmod 755 ~/.aztec/keystore
```

### Invalid Keystore JSON

**Error:** Node fails to load keystore

**Solutions:**
- Validate JSON syntax: `jq . ~/.aztec/keystore/key1.json`
- Ensure all required fields are present
- Check that publisher is an array: `["0x..."]` not `"0x..."`
- Verify private keys are 64-character hex strings (with or without `0x` prefix)

### Legacy BLS Key Derivation (2.1.4 Users)

**Issue:** Need to regenerate keys that were created with CLI version 2.1.4 or earlier

Version 2.1.5 changed the BLS key derivation path, which means keys generated from the same mnemonic produce different results. This affects users who:
- Generated keys with version 2.1.4 using `--count` parameter
- Used `--account-index` explicitly in version 2.1.4
- Need to regenerate keys from mnemonic that are already registered in the GSE contract

**The derivation path change:**
- **2.1.4**: `m/12381/3600/0/0/0`, `m/12381/3600/1/0/0`, `m/12381/3600/2/0/0`
- **2.1.5+**: `m/12381/3600/0/0/0`, `m/12381/3600/0/0/1`, `m/12381/3600/0/0/2`

**Solution: Use the --legacy flag**

If you generated keys with version 2.1.4 and need to regenerate them from your mnemonic, use the `--legacy` flag:

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --staker-output \
  --gse-address 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f \
  --l1-rpc-urls $ETH_RPC \
  --mnemonic "your twelve word mnemonic phrase here" \
  --count 5 \
  --legacy
```

The `--legacy` flag uses the 2.1.4 derivation path to reproduce your original keys.

:::warning When NOT to Use --legacy
Do NOT use the `--legacy` flag if:
- You're generating keys for the first time
- You generated keys with version 2.1.5 or later
- You didn't use `--count` or `--account-index` in version 2.1.4

Using `--legacy` unnecessarily will create keys with the old derivation path that won't match your newer registrations.
:::

:::info Why This Matters
BLS keys are registered in the GSE (Governance Staking Escrow) contract and cannot be easily updated. If you regenerate keys with a different derivation path, they won't match what's registered on chain, and your sequencer won't be able to attest properly.
:::

## Security Best Practices

### Protecting Private Keys

1. **Never commit keystores to version control**
   - Add `keystore.json` to `.gitignore`
   - Store keystores outside your project directory

2. **Backup your mnemonic securely**
   - Write it down offline
   - Store in a secure location (not on the server)
   - Consider using a hardware wallet or password manager

3. **Limit keystore access**
   ```bash
   chmod 600 ~/.aztec/keystore/key1.json
   ```

4. **Separate publisher from attester**
   - Use dedicated publisher keys
   - Keep attester keys offline when possible
   - Use remote signers for production

### Production Deployments

For production, consider:
- **Hardware Security Modules (HSMs)** for key storage
- **Remote signers** to keep keys off the node
- **Encrypted keystores** with password protection
- **Key management systems** (HashiCorp Vault, AWS Secrets Manager)

See [Key Storage Methods](./storage_methods.md) for advanced security patterns.

## CLI Reference

### validator-keys new

Create a new keystore with validators:

```bash
aztec validator-keys new [options]
```

**Common Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--fee-recipient <address>` | L2 fee recipient (required) | None |
| `--mnemonic <phrase>` | 12 or 24 word mnemonic | Auto-generated |
| `--count <number>` | Number of validators to create | `1` |
| `--publisher-count <number>` | Publishers per validator | `0` |
| `--staker-output` | Generate public keystore for staking | `false` |
| `--gse-address <address>` | GSE contract address (required with --staker-output) | None |
| `--l1-rpc-urls <urls>` | L1 RPC endpoints (required with --staker-output) | None |
| `--legacy` | Use 2.1.4 BLS derivation path (only for regenerating old keys) | `false` |
| `--data-dir <path>` | Output directory | `~/.aztec/keystore` |
| `--file <name>` | Keystore filename | `key1.json` |

For the complete list:

```bash
aztec validator-keys new --help
```

### validator-keys add

Add validators to an existing keystore:

```bash
aztec validator-keys add <keystore-path> [options]
```

### validator-keys staker

Generate staker output from an existing keystore:

```bash
aztec validator-keys staker \
  --from <keystore-path> \
  --gse-address <address> \
  --l1-rpc-urls <url> \
  --output <output-file>
```

## Next Steps

Now that you've created your keystores:

### For Sequencer Operators

1. **Fund publisher addresses** - At least 0.1 ETH per validator
2. **Set up your node** - See [Sequencer Management](../../setup/sequencer_management.md)
3. **Register validators** - Use the public keystore with the staking dashboard
4. **Monitor operations** - Track attestations and publisher balance

### Advanced Configurations

- **[Advanced Keystore Patterns](./advanced_patterns.md)** - Multiple validators, high availability, remote signers
- **[Key Storage Methods](./storage_methods.md)** - Encrypted keystores, HSMs, key management systems
- **[Troubleshooting](./troubleshooting.md)** - Common issues and solutions

### Getting Help

- Review the [Operator FAQ](../operator_faq.md) for common questions
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support
- Check the [CLI reference](../../reference/cli_reference.md) for all available commands

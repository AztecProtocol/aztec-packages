---
id: creating_keystores
displayed_sidebar: operatorsSidebar
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
bash -i <(curl -s https://install.aztec.network/2.1.9/)
```

Verify your CLI installation:

```bash
aztec --version
```

## Recommended Setup: Multiple Validators with Shared Publisher

This approach creates multiple sequencer identities (validators) that share a single publisher address for submitting transactions to L1. This is the recommended configuration for production deployments.

### Step 1: Create Publisher Address and Set RPC Endpoint

First, set your Ethereum mainnet L1 RPC endpoint:

```bash
export ETH_RPC=https://ethereum-rpc.publicnode.com
```

Or use your preferred Ethereum RPC provider (Infura, Alchemy, etc.).

Then generate a separate address for publishing transactions to L1 using the Foundry toolkit:

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

:::warning Critical: Save Your Publisher Mnemonic
The 24-word mnemonic is the **only way** to recover your publisher private key. Store it securely offline (not on the server running the node).
:::

**Save from the output:**
- ✅ The 24-word mnemonic (for recovery)
- ✅ The private key (you'll use this in the next step)
- ✅ The address (you'll fund this with ETH)

### Step 2: Generate Your Keystores with Publisher

Generate 5 validators with the publisher private key from Step 1:

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --staker-output \
  --gse-address 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f \
  --l1-rpc-urls $ETH_RPC \
  --count 5 \
  --publishers 0x7988a4a779f058a0
```

Replace `0x7988a4a779f058a0` with your actual publisher private key from Step 1.

**What this command does:**
- Generates a new mnemonic for your validator keys (save this securely!)
- Creates 5 sequencer identities (validators) with Ethereum and BLS keys
- Configures all validators to use the same publisher address for L1 submissions
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
  publisher:
    - 0x7988a4a779f058a0
acc2:
  attester:
    eth: 0x2037b472537a4246B1A7325f327028EF450ba0Ef
    bls: 0x8d7eb7d9436ac6cb9b8f1c211673ea228c7f438882e6438b2caefca753df28e8
  publisher:
    - 0x7988a4a779f058a0
acc3:
  attester:
    eth: 0x0c14593f7465DeDbb86d68982374BB05F4C60386
    bls: 0xad1cccf512d2f180238af795831344445f7ac47e2d623f3dac854e93e5b1e76d
  publisher:
    - 0x7988a4a779f058a0
acc4:
  attester:
    eth: 0x4D213928988f0123f6b3B4A377F856812F08E831
    bls: 0xa90f5889dddd4cd6bc5a28db5e0db60d3cbf5147eb6e82b313024b2d0634110e
  publisher:
    - 0x7988a4a779f058a0
acc5:
  attester:
    eth: 0x29f147Da38d5F66bB84e791969b365c796829c92
    bls: 0x0d683001c2ce866e322f0c7509f087a909508787d125336931aa9168d2a1f95b
  publisher:
    - 0x7988a4a779f058a0

Note: The publisher value shown is the private key (truncated in this example). All validators share the same publisher private key.

Staker outputs:
[
  {
    "attester": "0x8E76a8B8D66E0A56E241F2768fD2ad4eba07E565",
    "publicKeyG1": { "x": "0x...", "y": "0x..." },
    "publicKeyG2": { "x0": "0x...", "x1": "0x...", "y0": "0x...", "y1": "0x..." },
    "proofOfPossession": { "x": "0x...", "y": "0x..." }
  },
  ... (4 more validators)
]
```

:::warning Critical: Save Both Mnemonics
You now have **two separate mnemonics** to secure:

1. **Validator mnemonic** (shown above, 12 words) - Regenerates your attester keys
2. **Publisher mnemonic** (from Step 1, 24 words) - Regenerates your publisher key

Both must be stored securely offline. Losing either mnemonic means losing access to those keys.
:::

**Files created:**
- `~/.aztec/keystore/key1.json` - Private keystore with all 5 validators and publisher configured
- `~/.aztec/keystore/key1_staker_output.json` - Public keystore for staking dashboard

### Step 3: Fund the Publisher Address

Your publisher address needs ETH to pay for L1 gas when submitting proposals.

**Funding requirement:** At least **0.3 ETH** for 5 validators (rule of thumb: 0.1 ETH per validator)

Transfer ETH to the publisher address from Step 1. You can check the balance with:

```bash
cast balance 0xE434A95e816991E66bF7052955FD699aEf8a286b --rpc-url $ETH_RPC
```

Replace the address with your actual publisher address.

:::warning Monitor Publisher Balance
Set up monitoring to alert when the publisher balance falls below 0.5 ETH to prevent failed block publications.
:::

### Step 4: Upload Keystore to Your Node

Now you're ready to spin up your sequencer node!

**Upload the private keystore to your server:**

The `key1.json` file contains your private keys and must be uploaded to your sequencer node.

**For standard server deployments:**
```bash
# Upload to your server's keystore directory
scp ~/.aztec/keystore/key1.json user@your-server:/path/to/aztec-sequencer/keys/keystore.json
```

**For dAppNode deployments:**
- Upload `key1.json` to the dAppNode keystore folder
- Rename it to `keystore.json`

:::tip Keep the Public Keystore Local
Keep `key1_staker_output.json` on your local machine - you'll need it for registration on the staking dashboard. **Do not upload this to your server.**
:::

### Step 5: Start Your Node

Start your sequencer node following the [Sequencer Setup guide](../setup/sequencer-setup.md).

When your node starts successfully, you'll see output similar to:

```
Started validator with addresses: 0x8E76a8B8D66E0A56E241F2768fD2ad4eba07E565, 0x2037b472537a4246B1A7325f327028EF450ba0Ef, 0x0c14593f7465DeDbb86d68982374BB05F4C60386, 0x4D213928988f0123f6b3B4A377F856812F08E831, 0x29f147Da38d5F66bB84e791969b365c796829c92
```

These are your validator attester addresses - they match the addresses shown when you generated your keys.

### Step 6: Register Your Validators

Use the public keystore (`key1_staker_output.json`) to register your validators on the staking dashboard. See [Registering a Sequencer](../setup/registering-sequencer.md) for details.

---

### Quick Setup Summary

By following the recommended setup, you've accomplished:

✅ **Generated a dedicated publisher address** with its own 24-word mnemonic
✅ **Created 5 validator identities** with a separate 12-word mnemonic
✅ **Configured all validators** to use the shared publisher for L1 transactions
✅ **Funded the publisher** with at least 0.3 ETH for gas costs
✅ **Uploaded the private keystore** (`key1.json`) to your sequencer node
✅ **Started your node** and verified validator addresses in the output
✅ **Ready to register** using the public keystore (`key1_staker_output.json`)

**Two mnemonics to keep secure:**
1. **Publisher mnemonic** (24 words) - Recovers publisher private key
2. **Validator mnemonic** (12 words) - Recovers all 5 validator attester keys

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

## Advanced Options

### Providing Your Own Mnemonic

For deterministic key generation or to recreate keys from an existing mnemonic:

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --staker-output \
  --gse-address 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f \
  --l1-rpc-urls $ETH_RPC \
  --mnemonic "your existing twelve word mnemonic phrase here" \
  --count 5 \
  --publishers 0x7988a4a779f058a0
```

This regenerates the same validators if you've used this mnemonic before, or creates new ones at the next derivation indices.

### Custom Output Location

Specify custom directory and filename:

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --staker-output \
  --gse-address 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f \
  --l1-rpc-urls $ETH_RPC \
  --count 5 \
  --publishers 0x7988a4a779f058a0 \
  --data-dir ~/my-sequencer/keys \
  --file sequencer1.json
```

This creates keystores at:
- `~/my-sequencer/keys/sequencer1.json` (private keystore)
- `~/my-sequencer/keys/sequencer1_staker_output.json` (public keystore)

**Default behavior** (if you don't specify `--data-dir` or `--file`):
- **Directory**: `~/.aztec/keystore/`
- **Filename**: `key1.json`, `key2.json`, etc. (auto-increments)

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

## Troubleshooting

If you encounter issues during keystore creation or management, see the **[Troubleshooting and Best Practices Guide](./troubleshooting.md)** for:

- Keystore creation issues (RPC, permissions, invalid JSON, legacy BLS keys)
- Runtime and operational issues (node startup, remote signers, nonce conflicts)
- Comprehensive security best practices
- Complete CLI reference

## Next Steps

Now that you've created your keystores:

### For Sequencer Operators

1. **Fund publisher addresses** - At least 0.1 ETH per validator
2. **Set up your node** - See [Sequencer Management](../setup/sequencer-setup.md)
3. **Register validators** - Use the public keystore with the staking dashboard
4. **Monitor operations** - Track attestations and publisher balance

### Advanced Configurations

- **[Advanced Keystore Patterns](./advanced-patterns.md)** - Multiple validators, high availability, remote signers
- **[Key Storage Methods](./storage-methods.md)** - Encrypted keystores, HSMs, key management systems
- **[Troubleshooting and Best Practices](./troubleshooting.md)** - Common issues, security best practices, and CLI reference

### Getting Help

- Review the [Operator FAQ](../operator-faq.md) for common questions
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support
- Check the [CLI reference](../reference/cli-reference.md) for all available commands

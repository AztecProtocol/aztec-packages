---
title: Key storage methods
description: Learn about different methods for storing and accessing private keys in Aztec keystores, including inline keys, remote signers, JSON V3 keystores, and mnemonics.
---

## Overview

The keystore supports four methods for storing and accessing private keys. These methods can be mixed within a single configuration.

## Private keys (inline)

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

:::warning Not for Production Use
Inline private keys are convenient for testing but should be avoided in production. Use remote signers or encrypted keystores for production deployments.
:::

## Remote signers (Web3Signer)

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

**Validator (sequencer) block level** (applies to all accounts in a sequencer configuration):

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

### Client certificate authentication

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

## JSON V3 encrypted keystores

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

## Mnemonics (BIP44 derivation)

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

:::warning Not for Production Use
Mnemonics are convenient for testing but should be avoided in production. Use remote signers or encrypted keystores for production deployments.
:::

## Next steps

- Learn about [Advanced Configuration Patterns](./advanced_patterns.md)
- See [Troubleshooting](./troubleshooting.md) if you encounter issues

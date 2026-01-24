---
title: Using FaceID to Sign Transactions
tags: [local_network, wallet, cli]
keywords: [wallet, cli wallet, faceid]
sidebar_position: 3
description: In this tutorial, we will use Apple Mac's Secure Enclave to store the private key, and use it in Aztec's CLI Wallet. This enables fully private, native, and ...
---

In this tutorial, we will use Apple Mac's Secure Enclave to store the private key, and use it in Aztec's [CLI Wallet](../cli/aztec_wallet_cli_reference.md). This enables fully private, native, and seedless account abstraction!

:::warning

Aztec is in active development and this has only been tested on MacOS. Please reach out if this tutorial does not work for you, and let us know your operating system.

:::

:::note
This tutorial is for the local network and will need adjustments if you want to use it on testnet.
:::

## Prerequisites

For this tutorial, we will need to have the [Local Network](../../getting_started_on_local_network.md) installed.

We also need to install Secretive, a nice open-source package that allows us to store keys on the Secure Enclave. You can head to the [secretive releases page](https://github.com/maxgoedjen/secretive/releases) and get the last release's `zip`, unzip and move to Applications, or use [Homebrew](https://brew.sh/):

```bash
brew install secretive
```

Open it from the Applications folder and copy the provided Socket Path (the one it tells you to add to your .ssh config). Export it as a terminal environment variable. For example:

```bash
export SSH_AUTH_SOCK="/Users/your_user/Library/Containers/com.maxgoedjen.Secretive.SecretAgent/Data/socket.ssh"
```

Let's also install `socat` which helps us manage the socket connections. If using Homebrew:

```bash
brew install socat
```

### Creating a key

We will create our private key, which will be stored in the Secure Enclave. Open Secretive, click the "+" sign and create a key with authentication. You can give it any name you like. Secretive will then store it in the Secure Enclave.

Make sure Secretive's "Secret Agent" is running.

:::info

The Secure Enclave is a protected chip on most recent iPhones and Macs and it's meant to be airgapped. It is not safe to use in production.

Fortunately, Aztec implements [Account Abstraction](../foundational-topics/accounts/index.md#what-is-account-abstraction) at the protocol level. You could write logic to allow someone else to recover your account, or use a different key or keys for recovery.

:::

### Creating an account

Now we can use the key to create an account. Every account on Aztec is a contract, so you can write your own contract with its own account logic.

The Aztec team already wrote some account contract boilerplates we can use. One of them is an account that uses the `secp256r1` elliptic curve (the one the Secure Enclave uses).

Let's create an account in our wallet:

```bash
aztec-wallet create-account -a my-faceid-wallet -t ecdsasecp256r1ssh
```

This command creates an account using the `ecdsasecp256r1ssh` type and aliases it to `my-faceid-wallet`.

You should see a prompt like `? What public key to use?` with the public key you created in Secretive. Select this. If you see the message `Account stored in database with aliases last & my-faceid-wallet` then you have successfully created the account!

You can find other accounts by running `aztec-wallet create-account -h`.

### Using the wallet

Your FaceID-backed wallet is now ready to use. You can interact with it via the alias `accounts:my-faceid-wallet` just like any other wallet in the CLI.

Verify your account was stored correctly:

```bash
aztec-wallet get-alias accounts:my-faceid-wallet
```

From here, you can deploy contracts, send transactions, and interact with the network - each transaction will prompt you to authenticate with TouchID or your password.

Check out the [CLI Wallet Reference](../cli/aztec_wallet_cli_reference.md) for the full set of available commands, or follow the [Getting Started on Local Network](../../getting_started_on_local_network.md) guide to deploy contracts and interact with the network using your new wallet.

### What next

In this tutorial, we created an account with the Aztec's [CLI Wallet](../cli/aztec_wallet_cli_reference.md), using the Apple Mac's Secure Enclave to store the private key.

You can use a multitude of authentication methods, for example with RSA you could use a passport as a recovery, or even as a signer in a multisig. All of this is based on the [account contract](https://github.com/AztecProtocol/aztec-packages/tree/v4.0.0-nightly.20260124/noir-projects/noir-contracts/contracts/account).

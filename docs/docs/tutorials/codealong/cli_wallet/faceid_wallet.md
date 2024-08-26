---
title: FaceID Wallet (Mac Only)
---

In this tutorial, we will use Apple Mac's Secure Enclave to store the private key, and use it in Aztec's [CLI Wallet](../../../reference/developer_references/sandbox_reference/cli_wallet_reference.md). This enables fully private, native, and seedless account abstraction!

:::warning

As you may have guessed, this was currently tested in an Apple Mac. There's no guarantees it works on any Mac or any other operating system.

In any case, it helps showing how powerful Aztec is when combined with secp256r1 curves and account abstraction.

:::

## Setting up

You've guessed correctly. The first step is just to install and run the sandbox. This should install aztec-wallet together with the other aztec packages.

```bash
bash -i <(curl -s install.aztec.network)
aztec start --sandbox
```

We also need to install Secretive, a nice open-source package that allows us to store keys on the Secure Enclave. You can head to the [secretive releases page](https://github.com/maxgoedjen/secretive/releases) and get the last release's `zip`, unzip and move to Applications, or just use Homebrew:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install secretive
```

Open it from the Applications folder and copy the provided Socket Path (the one it tells you to add to your .ssh config). Export it as a terminal environment variable. For example:

```bash
export SSH_AUTH_SOCK="/Users/your_user/Library/Containers/com.maxgoedjen.Secretive.SecretAgent/Data/socket.ssh"
```

Let's also install `socat` which helps us manage the socket connections. Again, using homebrew makes it a breeze:

```bash
brew install socat
```

### Creating a key

We will create our private key, which will be stored in the Secure Enclave. Open Secretive, click the "+" sign and create a key with authentication. Secretive will then store it in the Secure Enclave. Make sure Secretive's "Secret Agent" is running!

:::info

The Secure Enclave is a protected chip on most recent iPhones and Macs and it's meant to be airgapped. This means that in a real production scenario it would be as unsafe as it is convenient: drop your phone into the ocean and ooops there goes your wallet.

Fortunately, Aztec implements [Account Abstraction](../../../aztec/concepts/accounts#what-is-account-abstraction) at the protocol level. You could write logic to allow someone else to recover your account, or use a different key or keys for recovery.

:::

### Wallet time

Finally, we're ready to use our key in our seedless wallet. Every wallet on Aztec is a contract, and you can basically use any contract you want (there's even [a tutorial on it](../contract_tutorials/write_accounts_contract)).

But of course, the Aztec team already wrote some account contract boilerplates we can use. One of them is an account that uses the `secp256r1` elliptic curve (the one the Secure Enclave uses).

So let's do it:

```bash
aztec-wallet create-account -a omg -t ecdsasecp256r1ssh
```

This command creates an account using the `ecdsasecp256r1ssh` type and aliases it to `omg`. You can find other accounts by running `aztec-wallet create-account -h`.

Your machine will ask you for which key you'd like to use. Since we have created one above, let's just select it. The contract will then be deployed and aliased to `omg`

### OMG

This is cool. Now how do I use this? Well... You can just use it as you use any other wallet. That's the beauty of Native Account abstraction. Let's just create a simple token contract example and mint ourselves some tokens with this.

I'm lazy so I'll just use `npx aztec-app` like a boss:

```bash
npx aztec-app new -s -t contract -n token_contract token
```

This creates a new project, skips running the sandbox (`-s`), and clones the contract-only box (`-t`) called token_contract (`-n`). You should now have a `token_contract` folder. Let's just move inside and get cozy:

```bash
cd token_contract
aztec-nargo compile
```

Great, our contract is ready to deploy with our TouchID wallet:

```bash
aztec-wallet deploy --from accounts:omg token_contract@Token --args accounts:omg DevToken DTK 18 -a devtoken 
```

Wondering what each of these options do? You can call `aztec-wallet -h` and see by yourself or check [the reference](../../../reference/developer_references/sandbox_reference/cli_wallet_reference.md), but I'll break it down for you (because I like you anon 💜):

- --from is just the sender: our account `omg`. We use the alias because it's easier than writing the key stored in our Secure Enclave. The wallet resolves the alias and knows where to grab it.
- token_contract@Token is just a shorthand to look in the `target` folder for our contract `token_contract-Token`
- --args are the arguments for our token contract: owner, name, ticker and decimals.
- -a tells the wallet to store its address with the "devtoken" alias, this way we can just use it later like `contracts:devtoken`, how cool is that

You should get a prompt to sign this transaction. You can now mint, transfer, and do anything you want with it:

```bash
aztec-wallet create-account -a new_recipient # creating a schnorr account
aztec-wallet send mint_public -ca last --args accounts:omg 10 -f accounts:omg # minting some tokens in public
aztec-wallet simulate balance_of_public -ca contracts:devtoken --args accounts:omg -f omg # checking that omg has 10 tokens
aztec-wallet send transfer_public -ca contracts:devtoken --args accounts:omg accounts:new_recipient 10 0 -f accounts:omg # transferring some tokens in public
aztec-wallet simulate balance_of_public -ca contracts:devtoken --args accounts:new_recipient -f omg # checking that new_recipient has 10 tokens
```

### What next

In this tutorial, we created an account with the Aztec's [CLI Wallet](../../../reference/developer_references/sandbox_reference/cli_wallet_reference.md), using the Apple Mac's Secure Enclave to store the private key.

Turns out you can use a multitude of authentication methods, for example with RSA you could use a passport as a recovery, or even as a signer in a multisig. All of this is based on the account contract.

Next step is then to [code your own account contract!](../contract_tutorials/write_accounts_contract.md)

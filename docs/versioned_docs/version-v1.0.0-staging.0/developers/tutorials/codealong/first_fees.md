---
title: All About Fees
sidebar_position: 4
tags: [fees, accounts, transactions, cli, contracts]
---

import { General, Fees } from '@site/src/components/Snippets/general_snippets';
import { Glossary } from '@site/src/components/Snippets/glossary_snippets';

The Aztec network is a privacy preserving layer 2 secured by Ethereum, and for the consensus mechanism to work, Aztec makes use of an asset to pay for transactions called, "Fee juice".

With account and fee abstraction on Aztec, there are several options for users and dApps to pay fees for themselves or their users.

By the end of this tutorial you will...

- Connect to the Aztec sandbox and/or testnet
- Use different payment methods to deploy accounts and make transactions via:
  - various `aztec-wallet` CLI commands
  - the `aztec.js` library
- Understand the pros/cons of different payment methods

**Note:**
<Fees.FeeAsset_NonTransferrable />

## Background

For this tutorial the following definitions will come in handy...

**PXE**: <Glossary.PXE />

**Aztec Node**: <Glossary.AztecNode />

**Sandbox**: <Glossary.AztecSandbox />

**`aztec-wallet`**: <Glossary.Tools.aztec_wallet />

## Connect to the network

Use of the `aztec-wallet` cli wallet is shown alongside use via the `aztec.js` library, and the choice of network can be the Sandbox or the Aztec testnet which rolls up to Sepolia.

### Tools

<General.InstallationInstructions />

With docker running, test the cli wallet with: `aztec-wallet --help`

#### Sandbox (skip if using testnet)

By default the sandbox runs everything including a PXE locally. For most paths in this tutorial, and more realistically when using testnet, we don't want this PXE.

Start the sandbox (L1, L2, but not the PXE) via: `NO_PXE=true aztec start --sandbox`

:::note Sandbox + aztec.js?
If you are specifically wanting to test aztec.js with the sandbox, then you will need to use the default command which includes the PXE:

- `aztec start --sandbox`
  :::

### Specifying the network URL for your PXE

#### CLI Wallet

Testing locally on the sandbox vs using the testnet, you may need to specify which node you would like to connect with.
When using the PXE in `aztec-wallet`, the Aztec network node to connect to can be specified in each relevant command:

```bash
aztec-wallet --node-url <string> ...
```

If the node url is not provided, the command defaults to the the local sandbox: `http://host.docker.internal:8080`. These should also be forwarded to `localhost` (you can check with `docker ps` when running the sandbox).

:::info Tip
If specifying the node url for every command, it is convenient to make an alias for it with your node url:

```
NODE_URL=http://x.x.x.x
alias aztec-wallet-node=aztec-wallet -n $NODE_URL
```

Now you can use the alias for future commands: `aztec-wallet-node ...`

:::

#### Aztec.js

<General.node_ver />

If you are using the sandbox for this step, it should be running with it's pxe. Otherwise if connecting to testnet, start a local PXE that your app connects to. The parameters for the `aztec start` command are:

- the local port to serve on: `--port 8081`
- tell aztec to start the pxe: `--pxe`
  - use this node url for transactions: `--pxe.nodeUrl=$NODE_URL`
  - don't perform local proving: `--pxe.proverEnabled false`

```
NODE_URL=http://x.x.x.x
aztec start --port 8081 --pxe --pxe.nodeUrl=$NODE_URL --pxe.proverEnabled false
```

Now init a project with your preferred node package manager (yarn, pnpm, ...) then you can create a PXE client to connect to your local pxe:

```javascript
// remember to pnpm install any new libs as they appear in these snippets,
// @ the specific version (ie, no preceding `^`) of your `aztec` tools.
import { createPXEClient, waitForPXE, PXE } from "@aztec/aztec.js";
async function main() {
  const pxe = await createPXEClient("http://localhost:8081");
  await waitForPXE(pxe);
  // use pxe...
  console.log(await pxe.getNodeInfo());
}
```

## Create Account Contract in a PXE

<Glossary.Account />

For convenience, Aztec Labs has implemented an account contract that authenticates transactions using Schnorr signatures. The contract class for a Schnorr account is pre-registered on Aztec networks (eg sandbox, testnet) to bootstrap first use. Ordinarily for a contract to be deployed, its class would have to be registered with the network first.

When a PXE creates a Schnorr account, there are three key things that occur:

- generation of keys privately
- registeration of a Schnorr account locally (effectively an instance of the Schnorr account class)
  - at this stage the address of the account is known, even though it is not yet deployed
- initialization and deployment of the account contract to the network

**Create the keys and account in the PXE**

Lets first create the account but only register the instance in the PXE. Its address will be calculated, and in a later step we can deploy it to the network.

```bash
aztec-wallet create-account --register-only -a main
```

The `-a main` sets this new account's alias to, "main". Use `aztec-wallet get-alias` (with no params) to see all aliases.

The equivalent using aztec.js - create a random account locally (we will deploy it in the next step):

```javascript
import { Fr } from "@aztec/aztec.js";
import { getSchnorrAccount } from "@aztec/accounts/schnorr";
import { deriveSigningKey } from "@aztec/stdlib/keys";
//... building upon the previous section
let secretKey = Fr.random();
let salt = Fr.random();
let schnorrAccount = await getSchnorrAccount(
  pxe,
  secretKey,
  deriveSigningKey(secretKey),
  salt
);
```

Your PXE now has keys for an account that can be deployed on Aztec network(s).

## Payment option overview

To get a quick overview of the payment options currently supported...

- **Sponsored Fee Paying Contract (Sponsored FPC)**: A small amount of funds from a limited faucet-like contract. Useful for bootstraping first transactions, e.g. deloying an account

- **Fee juice from an account**, which is:

  - Claimed from the fee asset bridged from L1 just before use.
  - Paid by the account that holds fee juice that is sending a transaction (default)
  - Special case with account deployment - paid for by a different account holding fee juice (not possible with other transaction types)

- **General Fee Paying Contracts**: These enable accounts to pay in one asset (publicly or privately) for the FPC to then (publicly) pay for the transaction. Great for privacy when an account is paying privately, and interacting with a private contract function.

We will go into these in the following sections.

## Paying for an account deployment transaction

To make transactions on the network, your account contract will need to specify a payment method of the enshrined asset, "Fee Juice".

### Sponsored FPC

To bootstrap first use, a sponsored fee paying contract (the canonical sponsored FPC) can be used to deploy your first account.

<Fees.FPC />

In the case of the canonical sponsored FPC, the only criteria is an upper bound on how much it sponsors an account's transactions. This will be enough to at least deploy an account.

The PXE can be queried for the canonical sponsored FPC address, and then specified as the payment method.
For testnet this is `0x1260a43ecf03e985727affbbe3e483e60b836ea821b6305bea1c53398b986047`, which can be verified with the command: `aztec get-canonical-sponsored-fpc-address`

Via the CLI:

The alias set earlier can be confirmed using: `aztec-wallet get-alias accounts:main`, this is specified here in `--from main`.

```bash
SPONSORED_FPC_ADDRESS=<0x...aztec_address...>
aztec-wallet register-contract $SPONSORED_FPC_ADDRESS SponsoredFPC --salt 0 --from main  # Need to specify account that wishes to register the contract
aztec-wallet deploy-account --from main --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS
```

The equivalent using aztec.js - get sponsored fpc address (helper functions [here](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/aztec/src/sandbox/sponsored_fpc.ts)) and use payment method:

```javascript
import { getSponsoredFPCInstance } from "../src/utils/sponsored_fpc.js"; // helper functions linked above
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee/testing";
//... building upon the previous section
const sponseredFPC = await getSponsoredFPCInstance(); // get address of pre-deployed Sponsored FPC contract
await pxe.registerContract({
  instance: sponseredFPC,
  artifact: SponsoredFPCContract.artifact,
}); // register the Sponsord FPC contract class with the pxe
const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(
  sponseredFPC.address
); // create payment method
let tx = await schnorrAccount
  .deploy({ fee: { paymentMethod: sponsoredPaymentMethod } })
  .wait();
let wallet = await schnorrAccount.getWallet();
let address = wallet.getAddress();
```

:::note Payment: Sponsored Fee Paying Contract
Options for payment via the sponsored fpc that can be used in multiple commands:

CLI: `--payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS`

.js: `{ fee: { paymentMethod: new SponsoredFeePaymentMethod(sponseredFPCAddress) }}`

:::

Once proofs have been generated locally, you will need to wait for the transaction to be included in a block.
**Congratulations! You have successfully created an account on Aztec!**

This contract now exists in the sandbox network, or on testnet if you specified a node url.

### Fee Juice

Apart from the FPC payment methods, the default method for paying for transactions is via fee juice direct from the sender of the transaction.
When specifying fee juice, and only in the case of deploying an account, a different funded account may be specified to pay for the deployment transaction of an unfunded account.
Another way for an accounts deployment to be funded is via claiming bridged fee juice (in a later section).

#### Sandbox pre-funded test accounts

The sandbox starts with 3 test accounts, providing another way to bootstrap initial testing with accounts. To add these to the PXE...

For the CLI:

```bash
aztec-wallet import-test-accounts
```

Confirm with: `aztec-wallet get-alias`, to see all aliases

The equivalent using aztec.js - get the test accounts

```javascript
import { getInitialTestAccountsWallets } from "@aztec/accounts/testing";
//...
const testWallets = await getInitialTestAccountsWallets(pxe);
```

Note: The test account addresses can also be seen in the sandbox logs when it starts up.

**Create and deploy a new account, paid for by another account**

For the sandbox only, you can use the test accounts provided at aliases: `test0`, `test1`, `test2`

```bash
aztec-wallet create-account -a alice --payment method=fee_juice,feePayer=test0
```

:::warning
Specifying the `feePayer` is only an option for commands that deploy an account.
:::

The equivalent using aztec.js - Create a fee juice payment method with a test account as sender, then deploy an account:

```javascript
import { FeeJuicePaymentMethod } from "@aztec/aztec.js";
//... building upon the previous section, duplicate account creation using `getSchnorrAccount`
// and an incremented salt value: `salt.add(Fr.fromString("1"))`
// Below we'll deploy the new account (eg schnorrAccount2) with fee juice from test wallet

const useFeeJuice = new FeeJuicePaymentMethod(testWallets[0].getAddress());
await schnorrAccount2
  .deploy({ fee: { deployWallet: testWallets[0], paymentMethod: useFeeJuice } })
  .wait();
```

:::note Payment: Fee Juice
Options for explicitly stating fee_juice from the sender which is the default payment method:

CLI: `--payment method=fee_juice` (default)

.js: `{ fee: { paymentMethod: new FeeJuicePaymentMethod(<fee payer address>) }`

:::

### Bridging Fee Juice

First register a new account `accBFJ` that we will bridge fee-juice to on deployment.

```bash
aztec-wallet create-account -a accBFJ --register-only
```

(Note: it is worth securing the account info so you can restore it again if needed)

If using the Sandbox, free-minting is allowed from it's anvil L1 to be bridged and claimed on its Aztec node:

```bash
aztec-wallet bridge-fee-juice 1000000000000000000 accBFJ --mint --no-wait
```

If using Aztec testnet, you'll first need an L1 account with sepolia, and additional params for the bridge-fee-juice command:

```bash
aztec-wallet bridge-fee-juice 1000000000000000000 accBFJ --mint --no-wait \
  --l1-rpc-urls <See https://chainlist.org/chain/11155111> \ # eg https://rpc.sepolia.ethpandaops.io
  --l1-chain-id 11155111 \
  --l1-private-key <L1 private key of account holding sepolia>
```

You'll have to wait for two blocks to pass for bridged fee juice to be ready on Aztec. For the sandbox you can do this by putting through two arbitrary transactions. Eg:

```bash
aztec-wallet deploy Counter --init initialize --args 0 accounts:test0 --from test0 -a counter
aztec-wallet send increment -ca counter --args accounts:test0 accounts:test0 --from test0
```

Now the funded account can deploy itself with the bridged fees, claiming the bridged fee juice and deploying the contract in one transaction:

```bash
aztec-wallet deploy-account --from accBFJ --payment method=fee_juice,claim
```

The equivalent using aztec.js - bridge fee juice, (pass two txs), create and use payment method:

(See also the [aztec-wallet](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/cli-wallet/src/cmds/bridge_fee_juice.ts#L32) implementation to initialise a fee juice portal manager)

```javascript
import {
  FeeJuicePaymentMethod,
  PrivateFeePaymentMethod,
  PublicFeePaymentMethod,
} from "@aztec/aztec.js";
import { createEthereumChain, createL1Clients } from "@aztec/ethereum";
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum";
//... building upon the previous section, duplicate account creation using `getSchnorrAccount`
// and an incremented salt value: `salt.add(Fr.fromString("2"))`
// Below we'll deploy the new account (eg schnorrAccount3) via a claim to bridged fee juice

const { l1ChainId } = await pxe.getNodeInfo(); // foundry chainid 31337 for sandbox use
const l1RpcUrls = ["http://localhost:8545]"]; // for sandbox use, or see https://chainlist.org/chain/11155111> eg ['https://rpc.sepolia.ethpandaops.io']
const chain = createEthereumChain(l1RpcUrls, l1ChainId);

// eg l1 private key, or for sandbox...
const mnemonicOrPrivateKey =
  "test test test test test test test test test test test junk";

const { publicClient, walletClient } = createL1Clients(
  chain.rpcUrls,
  mnemonicOrPrivateKey,
  chain.chainInfo
);

const feeJuicePortalManager = await L1FeeJuicePortalManager.new(
  pxe,
  publicClient,
  walletClient,
  log
);

const newWallet = await schnorrAccount3.getWallet();
const feeJuiceReceipient = schnorrAccount3.getAddress();

const claim = await feeJuicePortalManager.bridgeTokensPublic(
  feeJuiceReceipient,
  1000000000000000000n,
  true
);
// ...(wait for two blocks to pass or perform two txs in sandbox, eg deploy two other accounts)
const claimAndPay = new FeeJuicePaymentMethodWithClaim(newWallet, claim);
await schnorrAccount.deploy({ fee: { paymentMethod: claimAndPay } }).wait();
```

For testnet: chose your prefered sepolia rpc provider, chainid is sepolia 11155111, and private key of the account with sepolia eth to mint and bridge fee juice to Aztec.

:::note Payment: Fee Juice with claim from bridge
Options for claim+pay with bridged funds that can be used in multiple commands:

CLI: `--from <sender address> --payment method=fee_juice,claim`

.js: `{ fee: { paymentMethod: new FeeJuicePaymentMethodWithClaim(newWallet, claim) }}`

:::

:::tip Use a block explorer
<General.ViewTransactions />

:::

### Fee Paying Contract payment (public/private) - Advanced

Setting up your own FPC and authorising the asset is an involved process outside the scope of this tutorial, so below we will only look at the syntax for understanding.

In this example, a fee paying contract exists that takes a token called bananaCoin in exchange for paying the fee asset of transactions. Note: An example implementation exists in [aztec-starter](https://github.com/AztecProtocol/aztec-starter/blob/main/scripts/fees.ts#L94).

First register the FPC address in your PXE. In reality this might be an application funding users' transactions via their token.

```bash
aztec-wallet register-contract $FPC_ADDRESS FPCContract --from main
aztec-wallet <command> --payment method=fpc-public,fpc=$FPC_ADDRESS,asset=$ASSET_ADDRESS
```

The second line can be any command that takes a `--payment` parameter. See `aztec-wallet --help` and the help of corresponding commands to check.

Notice the specified address of both the FPC contract, and the asset address.

The equivalent using aztec.js:

```javascript
import { FPCContract } from "@aztec/noir-contracts.js/FPC";
//...
const fpc = await FPCContract.deploy(
  wallets[0],
  bananaCoin.address,
  wallets[0].getAddress()
)
  .send()
  .deployed();
// ... (setup token authorisation, and fpc balance here)
const publicFee = new PublicFeePaymentMethod(fpc.address, newWallet);
```

:::note Payment: Fee Paying Contract (public/private)
Options for payment via FPC that can be used in multiple commands:

CLI: `--payment method=fpc-public,fpc=$FPC_ADDRESS,asset=$ASSET_ADDRESS` (`fpc-private` for private)

.js: `{ fee: { paymentMethod: new PublicFeePaymentMethod(fpc.address, newWallet) }` (`PrivateFeePaymentMethod` for private)

:::

:::info Private fee payment
Note: using a private FPC method is the only way for transactions to be paid for privately.

Public and private refer to how the FPC will claim its tokens from the sender to then (publicly) spend fee juice. The visibility of the function being called is unchanged.
:::

## Summary of fee payment options

The two key ways of paying for transactions: fee juice from an account or via an FPC. Both of which are contracts on the aztec network.

### Fee juice from an account (default)

- from the sender of a transaction (default)
  - when making transactions from an account funded with fee juice
  - users will require the fee asset on L1 then bridge/claim on deployment
- specifying a different fee-payer account (new account creation/deployment only)
  - using a funded account to deploy another account, or rapid testing on the sandbox
  - need to already have a funded account
- claiming fee juice from already-bridged L1 asset and immediately using
  - great for bootstrapping an account on Aztec
  - need to already have aztec fee asset on an L1 account

### Fee juice from a Fee Paying Contract

- via public/private payment
  - can pay in other assets, and not hold fee juice
  - can privately spend alternative assets, to make private transactions
- sponsored payment
  - enables new users to bootstrap their first account

### Example payment options

```bash
# default fee juice from sender of transaction
aztec-wallet <command> --payment method=fee_juice

# fee juice from another account (create/deploy txs only)
aztec-wallet <create/deploy command> --payment method=fee_juice,feePayer=$FEE_PAYER_ADDRESS

# claim bridged fee juice and pay
aztec-wallet <command> --payment method=fee_juice,claim

# sponsored fpc
aztec-wallet <command> --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS

# asset for fee juice via fpc public
aztec-wallet <command> --payment method=fpc-public,fpc=$FPC_ADDRESS,asset=$ASSET_ADDRESS

# asset for fee juice via fpc private
aztec-wallet <command> --payment method=fpc-private,fpc=$FPC_ADDRESS,asset=$ASSET_ADDRESS

```

```javascript
// default fee juice from sender of transaction
command({ fee: { paymentMethod: new FeeJuicePaymentMethod(<sender address>) }})

// fee juice from different sender (create/deploy txs only)
command({ fee: { paymentMethod: new FeeJuicePaymentMethod(<fee payer address>) }})

// claim bridged fee juice and pay
command({ fee: { paymentMethod: new FeeJuicePaymentMethodWithClaim(newWallet, claim) }})

// sponsored fpc
command({ fee: { paymentMethod: new SponsoredFeePaymentMethod(sponseredFPCAddress) }})

// asset for fee juice via fpc public
command({ fee: { paymentMethod: new PublicFeePaymentMethod(fpc.address, newWallet) }})

// asset for fee juice via fpc private
command({ fee: { paymentMethod: new PrivateFeePaymentMethod(fpc.address, newWallet) }})
```

:::warning
Lists above are provided as a convenient reference and are not automatically maintained.
Please refer to the snippets in the sections above, and report any discrepancies.

:::

### Tabulated payment methods and options

`aztec-wallet` method and option parameters.

- The rows correspond to the method, eg `--payment method=fee_juice`
- The columns are the options, eg `--payment method=fpc-sponsored,fpc=<address>`

| method\options  | `feePayer`                 | `asset`                    | `fpc`            | `claim`    |
| --------------- | -------------------------- | -------------------------- | ---------------- | ---------- |
| `fee_juice`     | create/deploy account only | NA                         | NA               | if bridged |
| `fpc-public`    | NA                         | FPC accepted asset address | contract address | NA         |
| `fpc-private`   | NA                         | FPC accepted asset address | contract address | NA         |
| `fpc-sponsored` | NA                         | NA                         | NA               | NA         |

## Useful resources and further reading

- [`aztec` CLI tool](../../reference/environment_reference/cli_reference)
- [`aztec-wallet` CLI tool](../../reference/environment_reference/cli_wallet_reference)
- [`aztec.js` source](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/aztec.js)
- [Glossary](../../../glossary)
- Search bar and AI above
- Tags below :)

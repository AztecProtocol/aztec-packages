---
title: Aztec CLI
---

## Introduction

The Aztec CLI is a tool designed to enable a user to interact with the Aztec Network. Here we will provide a walk-through demonstrating how to use the CLI to deploy and test contracts on the [Aztec Sandbox](../sandbox/main.md).

## Requirements

The Aztec CLI is an npm package so you will need to have installed Node.js >= 18. This tutorial will use the Aztec Sandbox so you should first set up the sandbox using the link above.

To install the Aztec CLI simply:

`yarn global add @aztec/cli`

Then verify that it is installed with:

`aztec-cli -h`

## I have the Sandbox running, now what?

Lets first establish that we are able to communicate with the Sandbox. Most command will require the url to the Sandbox, which is probably `http://localhost:8080`. You can either provide this as an option with each command or you can run:

`export AZTEC_RPC_HOST='http://localhost:8080'`

Having done that, let's run the command:

`% aztec-cli block-number
0`

You should see the current block number (0) printed to the screen!

## Contracts

We have shipped a number of example contracts in the `@aztec/noir-contracts` npm package. This is included with the cli by default so you are able to use these contracts to test with. To get a list of the names of the contracts simply run:

```
% aztec-cli example-contracts
ChildContractAbi
EasyPrivateTokenContractAbi
EcdsaAccountContractAbi
EscrowContractAbi
LendingContractAbi
NonNativeTokenContractAbi
ParentContractAbi
PendingCommitmentsContractAbi
PokeableTokenContractAbi
PrivateTokenAirdropContractAbi
PrivateTokenContractAbi
PublicTokenContractAbi
SchnorrAccountContractAbi
SchnorrSingleKeyAccountContractAbi
TestContractAbi
UniswapContractAbi
```

In the following sections there will be commands that require contracts as options. You can either specify the full directory path to the contract abi, or you can use the name of one of these examples as the option value. This will become clear later on.

## Creating Accounts

The first thing we want to do is create a couple of accounts and for that we need some private keys. Running the following command will generate a new private key:

```
% aztec-cli generate-private-key

Private Key: 6622c828e9cd5adc86f10878765fe921d2b8cb2c79bdbc391157e43811ce88e3
Public Key: 0x1a5e13e446440e6f22e75e8d736f84b3833cf9358bdf699c0921eb6df78557e51c66bd81b1d84d81ebb595657041933c3b30195eeea294ad8ae56e3567b44242
```

Let's run that again and copy both outputs to a text file for use later.

```
% aztec-cli generate-private-key

Private Key: 234379f13ce14fec68a1a087aac2f9af2a9850f8c006dd79ccda554c86d15e80
Public Key: 0x306043953f2d304214459d039bdc44fbd0f848897c77ac58714692a6af5b759a042b29a5f40d5de9077636d5779bd7d350879cbbc63d5bba9220b41966aa2e21
```

We will now create accounts with these private keys, run the following (replacing the private key if you wish):

```
% aztec-cli create-account -k 6622c828e9cd5adc86f10878765fe921d2b8cb2c79bdbc391157e43811ce88e3

Created account(s).

Address: 0x175310d40cd3412477db1c2a2188efd586b63d6830115fbb46c592a6303dbf6c
Public Key: 0x153d49cf09acf1b2d79bc72f2842c7fc53a7daae331c1a2dc412ea8bb766faca19df1d9e188cf4fe63b77924ee6805cf94d222bf7cb442c924bcd3680054052f
```

You can see that the account has been created and the address derived.

Now, for the next account we will export the private key first and then omit the `-k` option:

```
% export PRIVATE_KEY=234379f13ce14fec68a1a087aac2f9af2a9850f8c006dd79ccda554c86d15e80
% aztec-cli create-account

Created account(s).

Address: 0x175310d40cd3412477db1c2a2188efd586b63d6830115fbb46c592a6303dbf6c
Public Key: 0x153d49cf09acf1b2d79bc72f2842c7fc53a7daae331c1a2dc412ea8bb766faca19df1d9e188cf4fe63b77924ee6805cf94d222bf7cb442c924bcd3680054052f


Address: 0x2337f1d5cfa6c03796db5539b0b2d5a57e9aed42665df2e0907f66820cb6eebe
Public Key: 0x1d80bd83a36d600af5153f4a0339cd6199992e1bb145edba2f1a05ad245cbf6d2761a77f036752b00e8842d5d48524bd2593ade1a6b76d3896148924e2795b43
```

For all commands that require a user's private key, the utility will look for the exported environment variable in absence of an optional argument.

Now lets double check that the accounts have definitely been registered with the sandbox with the `get-accounts` command:

```
% aztec-cli get-accounts
Accounts found:

Address: 0x175310d40cd3412477db1c2a2188efd586b63d6830115fbb46c592a6303dbf6c
Public Key: 0x153d49cf09acf1b2d79bc72f2842c7fc53a7daae331c1a2dc412ea8bb766faca19df1d9e188cf4fe63b77924ee6805cf94d222bf7cb442c924bcd3680054052f
Partial Contract Address: 0x72bf7c9537875b0af267b4a8c497927e251f5988af6e30527feb16299042ed

Address: 0x2337f1d5cfa6c03796db5539b0b2d5a57e9aed42665df2e0907f66820cb6eebe
Public Key: 0x1d80bd83a36d600af5153f4a0339cd6199992e1bb145edba2f1a05ad245cbf6d2761a77f036752b00e8842d5d48524bd2593ade1a6b76d3896148924e2795b43
Partial Contract Address: 0x72bf7c9537875b0af267b4a8c497927e251f5988af6e30527feb16299042ed
```

Our 2 accounts are listed so we can be confident that the account creation succeeded. There is an additional command `get-account-public-key` to retrieve and account's public credentials given it's address:

```
% aztec-cli get-account-public-key 0x2337f1d5cfa6c03796db5539b0b2d5a57e9aed42665df2e0907f66820cb6eebe
Public Key:
 0x1d80bd83a36d600af5153f4a0339cd6199992e1bb145edba2f1a05ad245cbf6d2761a77f036752b00e8842d5d48524bd2593ade1a6b76d3896148924e2795b43
Partial Address: 0x72bf7c9537875b0af267b4a8c497927e251f5988af6e30527feb16299042ed
```

## Deploying a Token Contract

We will now deploy the private token contract using the `deploy` command:

```
% aztec-cli deploy -c PrivateTokenContractAbi -a 1000000 0x2337f1d5cfa6c03796db5539b0b2d5a57e9aed42665df2e0907f66820cb6eebe -k 0x0a02fc15dc2d13e0640dd12be05c623c21e0c53a453c0d45ca3b328eeaffae0a09ab14c5762bb3a3aee52336f7495e39f0da322f9383db76fbab7f88bb64c4be
Using Public Key: 0x0a02fc15dc2d13e0640dd12be05c623c21e0c53a453c0d45ca3b328eeaffae0a09ab14c5762bb3a3aee52336f7495e39f0da322f9383db76fbab7f88bb64c4be

Aztec Contract deployed at 0x1ae8eea0dc265fb7f160dae62cc8912686d8a9ed78e821fbdd8bcedc54c06d0f
```

This command has a number of arguments which we will break down here:

- c - This is the abi of the contract that we have deployed. You can either provide a path to a file or use the name of one of the example contracts provided with the cli.
- a - These are the arguments to the constructor of the contract. In this case we have minted 1000000 initial tokens to the aztec address 0x2337f1d5cfa6c03796db5539b0b2d5a57e9aed42665df2e0907f66820cb6eebe.
- k - This is the public key used in the contract deployment. The public key is used in the derivation of the contract address.

The output of the command tells us that the contract was successfully deployed to address 0x1ae8eea0dc265fb7f160dae62cc8912686d8a9ed78e821fbdd8bcedc54c06d0f

We can use the `check-deploy` command to verify that a contract has been successfully deployed to an address:

```
% aztec-cli check-deploy -ca 0x1ae8eea0dc265fb7f160dae62cc8912686d8a9ed78e821fbdd8bcedc54c06d0f

true
```

## Calling a View Method

When we deployed the token contract, an initial supply of tokens was minted to the address provided in the constructor. We can now query the `getBalance()` method on the contract to retrieve tha balance of that address:

```
% aztec-cli call getBalance -a 0x2337f1d5cfa6c03796db5539b0b2d5a57e9aed42665df2e0907f66820cb6eebe -c PrivateTokenContractAbi -ca 0x1ae8eea0dc265fb7f160dae62cc8912686d8a9ed78e821fbdd8bcedc54c06d0f

View TX result:  [
  "{\"type\":\"bigint\",\"data\":\"1000000\"}"
]
```

The `call` command calls a read-only method on a contract, one that will not generate a transaction to be sent to the network. The other arguments are:

- a 0x2337f1d5cfa6c03796db5539b0b2d5a57e9aed42665df2e0907f66820cb6eebe - The address for which we want to retrieve the balance.
- c PrivateTokenContractAbi - The abi of the contract we are calling.
- ca - 0x1ae8eea0dc265fb7f160dae62cc8912686d8a9ed78e821fbdd8bcedc54c06d0f The address of the deployed contract

As you can see from the result, this address has a balance of 1000000. This is what we expect.

## Sending a Transaction

We can now send a transaction to the network. We will transfer funds from the owner of the initial supply to our other account.

For this we will use the `send` command:

```
% aztec-cli send transfer -a 543 0x2337f1d5cfa6c03796db5539b0b2d5a57e9aed42665df2e0907f66820cb6eebe 0x175310d40cd3412477db1c2a2188efd586b63d6830115fbb46c592a6303dbf6c -c PrivateTokenContractAbi -ca 0x1ae8eea0dc265fb7f160dae62cc8912686d8a9ed78e821fbdd8bcedc54c06d0f

TX has been mined
TX Hash: 15c5a8e58d5f895c7e3017a706efbad693635e01f67345fa60a64a340d83c78c
Block Num: 5
Block Hash: 163697608599543b2bee9652f543938683e4cdd0f94ac506e5764d8b908d43d4
TX Status: mined
```

We called the `transfer` function of the contract and provided these further arguments:

- a - The list of arguments to the function call, in this case they were the quantity of tokens to be transferred, the sender's address followed by the recipient's address.
- c - The abi of the contract that we wanted to call
- ca - The deployed address of the contract we wanted to call.

The command output tells us the details of the transaction such as it's hash and status.

We can use this hash to query the receipt of the transaction at a later time:

```
% aztec-cli get-tx-receipt 15c5a8e58d5f895c7e3017a706efbad693635e01f67345fa60a64a340d83c78c

TX Receipt:
{
  "txHash": "15c5a8e58d5f895c7e3017a706efbad693635e01f67345fa60a64a340d83c78c",
  "status": "mined",
  "error": "",
  "blockHash": "163697608599543b2bee9652f543938683e4cdd0f94ac506e5764d8b908d43d4",
  "blockNumber": 5,
  "origin": "0x2337f1d5cfa6c03796db5539b0b2d5a57e9aed42665df2e0907f66820cb6eebe"
}
```

Let's now call `getBalance()` on each of our accounts and we should see updated values:

```
% aztec-cli call getBalance -a 0x2337f1d5cfa6c03796db5539b0b2d5a57e9aed42665df2e0907f66820cb6eebe -c PrivateTokenContractAbi -ca 0x1ae8eea0dc265fb7f160dae62cc8912686d8a9ed78e821fbdd8bcedc54c06d0f

View TX result:  [
  "{\"type\":\"bigint\",\"data\":\"999457\"}"
]

% aztec-cli call getBalance -a 0x175310d40cd3412477db1c2a2188efd586b63d6830115fbb46c592a6303dbf6c -c PrivateTokenContractAbi -ca 0x1ae8eea0dc265fb7f160dae62cc8912686d8a9ed78e821fbdd8bcedc54c06d0f

View TX result:  [
  "{\"type\":\"bigint\",\"data\":\"543\"}"
]
```

## Logs

Finally, we can use the cli's `get-logs` command to retrieve unencrypted logs emitted by the contract:

```
% aztec-cli get-logs 5 1
Logs found:

Coins transferred
```

Here we asked for the logs from block 5 (the block in which our call to `transfer` was mined) and to include a total of 1 block's worth of logs. The text `Coins Transferred` is emitted during the execution of the `transfer` function on the contract.

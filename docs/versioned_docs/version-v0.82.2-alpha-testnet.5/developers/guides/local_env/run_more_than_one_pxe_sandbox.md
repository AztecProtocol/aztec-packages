---
title: Running Multiple PXEs in the Sandbox
sidebar_position: 3
tags: [PXE]
---

When you run the sandbox, the Aztec node and PXE have their own http server. This makes it possible to run two PXEs on your local machine, which can be useful for testing that notes are accurately stored and remaining private in their respective PXEs.

We are working on a better solution for this so expect an update soon, but currently you can follow this guide.

## Run the sandbox in one terminal

Rather than use the usual command, run:

```bash
NO_PXE=true aztec start --sandbox
```

This removes any other arguments, allowing you to ensure an isolated environment for the sandbox so it doesn't interfere with another PXE. By default, the sandbox will run on port `8080`.

## Run PXE mode in another terminal

In another terminal, run:

```bash
aztec start --port 8081 --pxe --pxe.nodeUrl=http://localhost:8080/
```

This command uses the default ports, so they might need to be changed depending on your configuration. It will run the PXE on port `8081`.

You should see something like this:

```bash
[14:01:53.181] INFO: pxe:data:lmdb Starting data store with maxReaders 16
[14:01:53.677] INFO: pxe:service Started PXE connected to chain 31337 version 1
[14:01:53.681] INFO: cli Aztec Server listening on port 8081 {"l1ChainId":31337,"l2ChainVersion":1,"l2ProtocolContractsTreeRoot":"0x093cc9324e5a7b44883f515ac490e7294ef8cb1e6d2d8c503255b1b3a9409262","l2CircuitsVkTreeRoot":"0x007c3b32ae1b8b3ed235f158e554d92710b5f126a8b2ed38a0874f6294299b95"}
```

You can learn more about custom commands in the [sandbox reference](../../reference/environment_reference/sandbox-reference.md).

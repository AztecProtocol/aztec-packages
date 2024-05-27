---
title: Dapp Tutorial
---

Aztec is the most powerful blockchain since Ethereum was born.

While several projects provide privacy at the protocol level, Aztec leverages extremely complex cryptography for client-side privacy, while keeping the network fully transparent.

But not everything that is complex must be difficult. In this tutorial, you will build a simple project and learn about private and public functions and their composability, state management, and other core principles of Aztec. 

## Objective

We will build a private voting app.

On Aztec, a contract like this will be fully verifiable, public and decentralized. And yet, your users will be able to cast their vote privately and update the count in public.

For simplicity's sake, the current count will be public, there won't be delegate voting, there will be an admin, and etc. But at the end of the tutorial, it will be clear to you that these requirements are easily met with Aztec.

## Getting started

We will be using the same codespace hack as in the [quickstart guide](../../getting_started.md) so we can have a sandbox running in a few minutes. We can continue while it does its thing in the background:


Using codespaces allows us to skip all the tooling regarding development network management. You can learn more about what's "in the box" [here](../../reference/sandbox-reference.md).

### Setting up a project

The codespace comes with aztec-nargo

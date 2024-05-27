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

You can immediately start a new project by using a handy `npx` command:

<span id="new_project">

```bash
npx aztec-app init
```

</span>

Your file structure should look something like this:

```tree
| |--src
| |  |--main.nr
| |--Nargo.toml
```

As you can imagine, this is little more than a stub, but still we can see the `main.nr` file which holds our contract, and Nargo.toml which will hold our dependencies.

![Why can't you just compile it](@site/img/tutorials/private_voting/just_compile.jpg)

Yes yes I'll shut up a little bit. Let's compile this little guy. Write:

<span id="compile">

```bash
aztec-nargo compile
```

</span>

You'll see a new folder `target` showing up. Feel free to have a look: it contains both the ABI (a "skeleton" of the contract), the partial witness that represents the public inputs, and the bytecode, along with other useful information.

## Deploy and run 😈

Deploying is quite easy now. Once upon a time, we could do it via CLI, but we have submitted to the Typescript cult for the time being. This is where Aztec.JS comes in: a simple library to interact with your contract. 

![Aztec team submitting to Typescript](@site/img/tutorials/private_voting/submit_to_typescript.jpeg)

Let's write a quick JS script to do this for us. But wait... How does Javascript know which functions to call on the contract? We made yet another tool `aztec-builder` for that, of course! Just run it:

```bash
aztec-builder codegen -o artifacts target
```


Pick your favourite Node.js package manager and install `@aztec/aztec.js`:

<span id="yarn_add">

```bash
yarn add @aztec/aztec.js # or npm i @aztec/aztec.js
```

</span>

This will bootrap a JS app for you. We need to create our `index.js` file and tell `node` how to run it by adding it to a "start" property in `package.json`.

:::tip

You can do this in one line with:

<span id="create_index_js">

```bash
touch index.js && npm pkg set scripts.start="node index.js"
```

</span>

__Oh the wonders of bash ❤️__

:::

Now we write the deployment logic. Don't sweat it, it will only take a minute.


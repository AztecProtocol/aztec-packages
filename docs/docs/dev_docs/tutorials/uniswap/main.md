---
title: Build an Aztec Connect-style Uniswap
---

:::important
Before attemping this tutorial, you will need to have completed the [Token Bridge tutorial](../token_portal/main.md)
:::

Our goal here is for someone with funds on L2 to be able to swap using L1 Uniswap and then get the swapped assets back to L2.

Now that we are familiar with token portals, using some technical jargon, what should happen is the user should withdraw their “input” assets to L1 (i.e. burn them on L2 and create a L2 to L1 message to withdraw), and create a L2 to L1 message to swap on L1. Then on L1, the user should get their input tokens, consume the swap message, execute the swap and then deposit the “output” tokens to the output token portal so it can be deposited into Aztec.

They should be able to do this both privately and publicly.

We assume that token portals and token bridges for the input and output tokens must exist.

Ideally the execution of swap on L1 should be designed such that any 3rd parter can execute the swap on behalf of the user.

We will create:

- Uniswap Portal - on L1 that talks to the input token portal to withdraw the assets, executes the swap and deposits the swapped tokens back to L2
- Uniswap L2 contract - which creates the needed messages to perform the swap on L1.

A pretty diagram -

https://lh3.googleusercontent.com/Kc4rIBHyTdCrRYoEkZ38VkL1TaV7squxvDOCqYm_akbfXAbLqTK5MA1fJQaD6hGHXB3uB8elpc9LgA3RqZLie13sT0Xr9RLM6DKgviSXb6f-ViEoNqrnzuDM-NpjRyt36yta5LKSBCgEgjuNc4CpXtU

Here we just show the private flow. Note that because our token portals were designed for maximal composability, we can create a uniswap portal which handles funds and seamlessly build it on top of our token portal with no changes! Once again the “blue” human signifies someone other than a user that can make calls on their behalf.

A lot is happening here so it is best that we explain as we code.

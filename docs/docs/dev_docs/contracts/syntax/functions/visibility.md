---
title: Visibility
---

In Aztec there are multiple different types of visibility that can be applied to functions. Namely we have `data visibility` and `function visibility`.

### Data Visibility

Data visibility is used to describe whether the data (or state) used in a function is generally accessible (public) or on a need to know basis (private). Functions with public data visibility are executed by the sequencer, and functions with private data visibility are executed by the user. For more information on why this is the case, see [communication](../../../../concepts/foundation/communication/public_private_calls/main.md).

### Function visibility

This is the kind of visibility you are more used to seeing in Solidity and more traditional programming languages. It is used to describe whether a function is callable from other contracts, or only from within the same contract.

By default, all functions are callable from other contracts, similarly to the Solidity `public` visibility. To make them only callable from the contract itself, you can mark them as `internal`. Contrary to solidity, we don't have the `external` nor `private` keywords. `external` since it is limited usage when we don't support inheritance, and `private` since we don't support inheritance and it would also be confusing with multiple types of `private`.

A good place to use `internal` is when you want a private function to be able to alter public state. As mentioned above, private functions cannot do this directly. They are able to call public functions and by making these internal we can ensure that this state manipulating function is only callable from our private function.

:::danger
Note that non-internal functions could be used directly as an entry-point, which currently means that the `msg_sender` would be `0`, so for now, using address `0` as a burn address is not recommended.
:::

For a practical guide of using multiple types of data visibility and `internal` functions,follow the [token tutorial](../../../tutorials/writing_token_contract.md). 

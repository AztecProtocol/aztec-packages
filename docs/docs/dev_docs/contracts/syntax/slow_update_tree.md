---
title: Slow Updates Tree
---

Slow Updates Tree is a data structure that allows for public data to be accessed in both private and public domains. Read more about it in the [concepts section](../../../concepts/foundation/communication/public_private_calls/slow_updates_tree.md).

The Slow Updates Tree works by having a current tree and a pending tree, and replacing the current tree with the pending tree after an epoch has passed. Public functions can read directly from the current tree, and private functions can perform a membership proof that values are part of a commitment.


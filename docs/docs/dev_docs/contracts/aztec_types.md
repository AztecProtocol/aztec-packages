---
title: Aztec.nr Types
description: Documentation of Aztec's Types
---

With Aztec.nr we are include a series of types that are useful for writing Aztec contracts. While almost anything is modelled just as plain Fields underneath it can be quite useful for developers to have a series of types when writing that apply different types of constrains on top to make the code more readable and easier to follow.

## `AztecAddress`

A wrapper around a Field that mainly just alters the name to make it more clear that the value is an address and not a number of a hash or something else.

## `EthereumAddress`

A wrapper around a Field that perform a range check to ensure that the number of bytes used don't exceed 20.



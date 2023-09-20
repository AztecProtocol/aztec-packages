---
title: Aztec.nr Types
description: Documentation of Aztec's Types
---

With Aztec.nr we include a series of useful types. While most types are Fields underneath it can be useful for developers to have custom types that:
1. Apply different types of constrains 
2. Make the code easier to follow

A Field wrapper that alters the name. Making it explicit that the value is an address, and not something else.

A wrapper around a Field that mainly just alters the name to make it more clear that the value is an address and not a number of a hash or something else.

A wrapper around a Field that performs a range check to ensure that the value is 20 bytes.

A wrapper around a Field that perform a range check to ensure that the number of bytes used don't exceed 20.



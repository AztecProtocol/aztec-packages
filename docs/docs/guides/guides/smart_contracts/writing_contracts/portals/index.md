---
title: Portals
---

A portal is a point of contact between L1 and a contract on Aztec. For applications such as token bridges, this is the point where the tokens are held on L1 while used in L2.

As outlined in [Communication](/aztec/aztec/concepts/smart_contracts/communication/cross_chain_calls), an Aztec L2 contract is linked to _ONE_ L1 address at time of deployment (specified by the developer). This L1 address is the only address that can send messages to that specific L2 contract, and the only address that can receive messages sent from the L2 contract to L1. Note, that a portal doesn't actually need to be a contract, it could be any address on L1.

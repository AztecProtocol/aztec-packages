---
title: Contract Classes
tags: [contracts, protocol]
sidebar_position: 0
---

Aztec defines a difference between contract *classes* and contract *instances*. This can be compared to object oriented programming and is different from Ethereum, where every contract's bytecode is deployed to the network and has a unique address.

## Contract classes

A contract class defines the contract's bytecode and is uniquely identified by a hash. A contract class doesn't have its own storage or state, but is more of a template that outlines the contract's code.

## Contract instances

A contract instance is a deployed version of a contract class with its own storage and state. Each instance operates independently. This separation allows for multiple deployments of the same contract logic without interference between instances.

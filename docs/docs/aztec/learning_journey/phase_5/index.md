---
title: "Phase 5: Your First Private Contract"
description: "Learn practical Aztec.nr development by building your first privacy-preserving smart contract from scratch."
sidebar_position: 5
tags: [aztec-nr, smart-contracts, private-contracts, development]
---

import Image from "@theme/IdealImage";

# Phase 5: Your First Private Contract

*Target Audience: Developers ready to build*  
*Learning Approach: Hands-on coding with detailed explanations*

---

Now it's time to **build**! After understanding the foundations of privacy-preserving blockchain technology, you're ready to write your first Aztec.nr smart contract. This phase combines theory with practice, showing you how concepts translate into code.

## What You'll Learn

By the end of Phase 5, you'll be able to:

✅ **Set up your development environment** for Aztec.nr development  
✅ **Write and deploy a private smart contract** that manages private state  
✅ **Understand private vs public functions** and when to use each  
✅ **Work with storage types and note management** in real applications  

## From Theory to Practice

In the previous phases, you learned:
- **Why** privacy matters (Phase 1)
- **How** to think about privacy-first systems (Phase 2)  
- **What** cryptographic tools enable privacy (Phase 3)
- **How** Aztec's architecture works (Phase 4)

Now you'll learn **how to build** privacy-preserving applications using Aztec.nr.

## Learning Path

This phase takes you through practical development step-by-step:

<div className="card-container">

  <Card shadow='tl' link='/aztec/learning_journey/phase_5/development_environment'>
    <CardHeader>
      <h3>1. Development Environment Setup</h3>
    </CardHeader>
    <CardBody>
      Installing tools, setting up your workspace, and understanding the development workflow
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/learning_journey/phase_5/first_private_contract'>
    <CardHeader>
      <h3>2. Your First Private Contract</h3>
    </CardHeader>
    <CardBody>
      Building an enhanced counter contract that demonstrates private state management
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/learning_journey/phase_5/private_vs_public'>
    <CardHeader>
      <h3>3. Private vs Public Functions</h3>
    </CardHeader>
    <CardBody>
      Understanding execution contexts and designing hybrid public/private functionality
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/learning_journey/phase_5/storage_and_notes'>
    <CardHeader>
      <h3>4. Storage Types and Note Management</h3>
    </CardHeader>
    <CardBody>
      Working with different storage patterns and managing note lifecycles effectively
    </CardBody>
  </Card>

</div>

## What We'll Build

Throughout this phase, we'll build a **Private Counter Contract** that demonstrates key Aztec.nr concepts:

```rust
contract PrivateCounter {
    // Private state that only you can read
    #[storage]
    struct Storage {
        counters: Map<AztecAddress, PrivateMutable<ValueNote>>,
    }

    // Private function - runs on your device
    #[private]
    fn increment_private(owner: AztecAddress) {
        // Private logic here
    }

    // Public function - runs on network
    #[public]  
    fn increment_public() {
        // Public logic here
    }
}
```

This simple contract will teach you:
- Private state management
- Note creation and spending
- Function execution contexts
- Storage patterns
- Testing and deployment

## Prerequisites

Before starting this phase, you should:
- ✅ Have completed Phases 1-4 (or be familiar with the concepts)
- ✅ Be comfortable with programming (any language)
- ✅ Have basic familiarity with smart contract concepts
- ✅ Be willing to learn Noir/Rust-like syntax

**Don't worry if you're new to Rust** - we'll explain Aztec.nr syntax as we go, and it's designed to be approachable for developers from any background.

## Getting Started

Start with [Development Environment Setup →](/aztec/learning_journey/phase_5/development_environment) to prepare your development workspace.

---

## Learning Journey Navigation

**Previous Phase:** [Phase 4: Aztec Architecture ←](/aztec/learning_journey/phase_4)  
**Current Phase:** Phase 5 - Your First Private Contract  
**Next Phase:** [Phase 6: Privacy Development Patterns →](/aztec/learning_journey/phase_6)

---

*This is part of the comprehensive Aztec Learning Journey. [View full learning path →](/aztec/learning_journey)*
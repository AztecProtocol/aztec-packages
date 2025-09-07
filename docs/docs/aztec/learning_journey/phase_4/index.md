---
title: "Phase 4: Aztec Architecture"
description: "Understanding how all the components work together in Aztec Protocol's system design."
sidebar_position: 4
tags: [aztec-architecture, system-design, network-topology]
---

import Image from "@theme/IdealImage";

# Phase 4: Aztec Architecture

*Target Audience: Developers understanding ZK basics*  
*Learning Approach: Systems thinking, component interaction*

---

Now that you understand the foundational concepts and cryptographic building blocks, it's time to see how everything comes together in **Aztec's system architecture**. This phase will give you a complete picture of how the Aztec network operates.

## What You'll Learn

By the end of Phase 4, you'll understand:

✅ **Network architecture** and how different node types interact  
✅ **Transaction lifecycle** from private execution to L1 settlement  
✅ **The five-tree state model** and how it enables hybrid privacy  
✅ **L1-L2 communication** and cross-chain message patterns  

## The Big Picture

Aztec is a **privacy-centric zkRollup** that combines:
- Private client-side execution (PXE)
- Public network computation (AVM) 
- Ethereum settlement layer (L1)
- Sophisticated cryptographic state trees
- Efficient proof aggregation system

## Learning Path

This phase explores four key architectural areas:

<div className="card-container">

  <Card shadow='tl' link='/aztec/learning_journey/phase_4/network_architecture'>
    <CardHeader>
      <h3>1. Network Architecture</h3>
    </CardHeader>
    <CardBody>
      Nodes, sequencers, provers, and how the Aztec network is structured
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/learning_journey/phase_4/transaction_lifecycle'>
    <CardHeader>
      <h3>2. Transaction Lifecycle</h3>
    </CardHeader>
    <CardBody>
      Following a transaction from private execution through to L1 settlement
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/learning_journey/phase_4/state_trees'>
    <CardHeader>
      <h3>3. State Trees</h3>
    </CardHeader>
    <CardBody>
      The five-tree model that enables hybrid public/private state management
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/learning_journey/phase_4/l1_l2_communication'>
    <CardHeader>
      <h3>4. L1-L2 Communication</h3>
    </CardHeader>
    <CardBody>
      Cross-chain messaging and how Aztec integrates with Ethereum
    </CardBody>
  </Card>

</div>

## Architecture Overview

Before diving into details, here's the high-level flow:

```
User Device (PXE)           Aztec Network              Ethereum L1
├── Private execution       ├── Public execution       ├── Proof verification
├── Proof generation        ├── State aggregation      ├── State commitment  
├── Transaction submission  ├── Batch processing       └── Final settlement
└── State synchronization   └── L1 proof submission
```

## Getting Started

Start with [Network Architecture →](/aztec/learning_journey/phase_4/network_architecture) to understand how the Aztec network is structured and operates.

---

## Learning Journey Navigation

**Previous Phase:** [Phase 3: Zero-Knowledge Fundamentals ←](/aztec/learning_journey/phase_3)  
**Current Phase:** Phase 4 - Aztec Architecture  
**Next Phase:** Phase 5: Your First Private Contract *(Coming Soon)*

---

*This is part of the comprehensive Aztec Learning Journey. [View full learning path →](/aztec/learning_journey)*
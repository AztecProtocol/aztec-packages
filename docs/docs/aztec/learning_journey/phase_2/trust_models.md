---
title: "Trust Models"
description: "Understanding client-side vs server-side execution and how this fundamental shift affects privacy and security."
sidebar_position: 4
tags: [trust-models, client-side-execution, server-side-execution, pxe]
---

# Trust Models: Client-Side vs Server-Side Execution

## The Fundamental Trust Question

Traditional blockchains require you to trust the network to execute your transactions correctly. Privacy-preserving systems flip this model: **your most sensitive computations happen on your own device.**

This shift has profound implications for privacy, security, and how applications work.

## Traditional Model: Server-Side Execution

### How It Works Today

```
Your Computer                    Blockchain Network
├── Creates transaction          ├── Receives your transaction
├── Signs transaction            ├── Executes your code publicly  
├── Submits to network           ├── Updates global state
└── Trusts network execution     └── Broadcasts results to everyone
```

### Trust Assumptions

**You trust the network to:**
- Execute your transaction correctly
- Not manipulate the execution
- Handle your transaction fairly
- Maintain the global state accurately

**The network trusts:**
- Your transaction signature is valid
- You're not trying to spend more than you have (verified by checking public balances)

### Privacy Implications

**Everything is visible:**
- Your transaction parameters
- The execution process  
- The intermediate calculations
- The final results
- Your state changes

This transparency is great for verification but terrible for privacy.

## Privacy Model: Client-Side Execution  

### How Aztec Works

```
Your Computer (PXE)              Aztec Network
├── Stores your private keys     ├── Receives cryptographic proofs
├── Stores your private notes    ├── Verifies proofs are valid
├── Executes private functions   ├── Updates public state trees
├── Generates ZK proofs          ├── Doesn't see your private data
└── Submits proofs to network    └── Can't manipulate your execution
```

### Trust Shift

**You trust:**
- Your own device to execute correctly
- Your wallet software to manage keys properly
- The cryptographic proofs to be sound

**The network trusts:**
- Your zero-knowledge proofs are valid
- The proof generation process was honest
- The cryptographic commitments are binding

**Nobody needs to trust:**
- The network to keep your data private
- Centralized servers to execute your logic
- Third parties to see your sensitive information

## The PXE: Your Personal Blockchain Computer

### What is the PXE?

The **Private Execution Environment (PXE)** is your personal blockchain computer - like having a tiny blockchain node running on your device that handles all your private operations.

**PXE Responsibilities:**
- **Key Management:** Stores your private keys securely
- **Note Management:** Tracks your private notes and balances  
- **Private Execution:** Runs private functions on your behalf
- **Proof Generation:** Creates cryptographic proofs of correct execution
- **State Synchronization:** Keeps track of public state changes

### PXE vs Traditional Wallet

**Traditional Crypto Wallet:**
```
Wallet Functions:
├── Store private keys
├── Sign transactions
├── Submit transactions to network
└── Display results from network
```

**PXE (Privacy Wallet):**
```
PXE Functions:
├── Store private keys
├── Store and manage private notes
├── Execute private smart contract functions
├── Generate zero-knowledge proofs
├── Manage private state synchronization
└── Interface with dApps privately
```

## Security Model Implications

### Benefits of Client-Side Execution

**True Privacy:**
- Your private data never leaves your device
- Computations happen locally using your private information
- Only proof results are shared, not the underlying data

**Censorship Resistance:**
- No one can prevent you from executing your private functions
- Your private logic runs on your device, not on servers others control
- Network operators can't selectively censor your private operations

**Data Sovereignty:**
- You maintain full control over your private information
- No third parties can access your private state
- You choose what information to reveal and when

### Challenges of Client-Side Execution

**Device Requirements:**
- Your device must be capable of generating cryptographic proofs
- Proof generation can be computationally intensive
- You need to maintain synchronization with network state

**Availability Dependence:**
- You need your device to be available to make private transactions
- Private state is tied to your device/wallet
- Backup and recovery become more complex

**Complexity Trade-offs:**
- More complex wallet software
- Users must understand key management better
- More moving parts that can break

## Hybrid Trust: Best of Both Worlds

Aztec's hybrid model combines the benefits of both approaches:

### Private Functions (Client-Side)
```
Your Device Benefits:
├── Complete privacy for sensitive operations
├── No one can see your private computations  
├── You control the execution environment
└── Censorship-resistant private operations
```

### Public Functions (Server-Side)
```
Network Benefits:
├── Shared computation everyone can verify
├── Coordination between multiple parties
├── Integration with other public protocols
└── Transparent and auditable operations
```

## Practical Implications

### For Users

**Privacy Benefits:**
- Your financial information stays private
- No one can see your transaction patterns
- You can participate without revealing sensitive data

**Responsibility Changes:**
- You're responsible for backing up your private state
- You need to keep your device secure and updated
- You must understand the privacy implications of your actions

### For Developers

**New Capabilities:**
- Build applications that protect user privacy by default
- Create selective disclosure features
- Implement privacy-preserving business logic

**New Considerations:**
- Design for both client-side and server-side execution
- Handle private state management properly
- Optimize for proof generation performance

### For the Network

**Reduced Load:**
- Private computations don't consume network resources
- Only proof verification happens on-chain
- Better scalability for private operations

**Changed Role:**
- Network becomes a proof verification system
- Focus shifts from execution to verification
- State management becomes hybrid (public trees + private notes)

## Key Mental Shifts

### From Trusting Networks to Trusting Yourself

**Old Model:**
- "I trust the blockchain network to execute my transaction correctly"
- "The network validates my transaction and updates global state"

**New Model:**
- "I execute my private logic locally and generate a proof"
- "The network validates my proof without seeing my private data"

### From Global State to Personal State

**Old Model:**
- "All state is global and visible to everyone"
- "I read my balance from the global state tree"

**New Model:**
- "I maintain my private state locally"
- "I synchronize with public state when needed"
- "Only I can see my complete state picture"

### From Immediate Verification to Proof-Based Trust

**Old Model:**
- "Everyone can immediately verify my transaction by checking balances"

**New Model:**
- "I prove my transaction is valid without revealing the details"
- "Others trust the cryptographic proof, not the visible state changes"

## Key Takeaways

1. **Client-side execution enables true privacy** - your sensitive data never leaves your device
2. **Trust shifts from networks to proofs** - cryptographic guarantees replace trust in execution
3. **The PXE is your personal blockchain computer** - handles all private operations locally
4. **Hybrid models give you choice** - private or public execution based on your needs
5. **New responsibilities come with new capabilities** - privacy requires active key and state management

---

## Phase 2 Complete!

Congratulations! You've completed Phase 2 of your Aztec learning journey. You now understand:

✅ **Mental model shifts** from account-based to UTXO-based privacy  
✅ **Hybrid execution patterns** and when to use private vs public functions  
✅ **State management** with notes, nullifiers, and commitments  
✅ **Trust model changes** with client-side vs server-side execution

## What's Next?

Now that you understand the conceptual foundations of privacy-first thinking, you're ready to learn about the **cryptographic techniques** that make these systems possible.

**Continue to:** [Phase 3: Zero-Knowledge Fundamentals →](/aztec/learning_journey/phase_3)

---

**Phase 2 Navigation:**  
[← State Models](/aztec/learning_journey/phase_2/state_models) | **Trust Models** | *Phase 2 Complete!*

---

*Return to [Phase 2 Overview](/aztec/learning_journey/phase_2) or [Full Learning Journey](/aztec/learning_journey)*
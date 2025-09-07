---
title: "Hybrid Execution"
description: "Understanding private and public functions and when to use each execution context in privacy-preserving smart contracts."
sidebar_position: 2
tags: [hybrid-execution, private-functions, public-functions]
---

# Hybrid Execution: Private + Public Functions

## The Innovation: Choose Your Execution Context

Traditional blockchains have one execution model: everything runs publicly on-chain where everyone can see the computation and its results.

Aztec introduces **hybrid execution** - the same smart contract can have functions that run in different execution contexts:

- **Private functions:** Execute privately on your device
- **Public functions:** Execute publicly on the network  
- **Utility functions:** Execute off-chain for queries

This gives you the flexibility to choose privacy or transparency **per function**, not per contract.

## Private Functions: Your Personal Computer

### How Private Functions Work

```
Your Device (PXE)
├── Executes private function code
├── Accesses your private state (notes)
├── Generates cryptographic proof
└── Submits proof to network (not the execution details)

Network
├── Receives the proof
├── Verifies proof is correct
├── Updates state based on proof
└── Never sees your private data
```

### Characteristics of Private Functions

**Privacy First:**
- Run on your device using your private data
- Generate zero-knowledge proofs of correct execution
- Only the proof is submitted to the network, not the computation details

**Limited but Powerful:**
- Can read and modify your private state (notes)
- Can read historical public state (but not current state)
- Can enqueue public function calls to run later

**Think of them like:** Your private calculator that can prove it did the math correctly

### When to Use Private Functions

- **Private state management:** Creating, spending, or modifying private notes
- **Sensitive computations:** Calculations you don't want others to see
- **Personal logic:** Authorization checks using private information
- **Setup operations:** Preparing data before public execution

**Example Use Cases:**
- Checking your private balance before making a payment
- Calculating a private proof of funds for a loan
- Generating commitments to values you'll reveal later
- Private voting that creates public tallies

## Public Functions: The Network Computer

### How Public Functions Work

```
Network (AVM)
├── Executes function code publicly
├── Accesses public state directly
├── Performs computation transparently  
└── Updates public state immediately

Everyone Can See:
├── The function being called
├── The parameters passed
├── The computation performed
└── The state changes made
```

### Characteristics of Public Functions

**Transparency First:**
- Run on network nodes where everyone can see
- Access and modify public state directly
- Computation and results are fully transparent

**Powerful but Visible:**
- Can read and write current public state
- Can call other public functions immediately
- Can perform complex computations efficiently

**Think of them like:** A public whiteboard where everyone can see the calculations

### When to Use Public Functions

- **Public state management:** Updating transparent data and records
- **Public computations:** Calculations that benefit from transparency
- **Network coordination:** Logic that requires public visibility
- **Integration points:** Interacting with other public protocols

**Example Use Cases:**
- Updating a public token supply
- Processing public governance votes
- Managing a public order book
- Bridging to/from other networks

## The Execution Flow: Private → Public

Here's the crucial insight: **Private functions can call public functions, but public functions cannot call private functions.**

This creates a **directional execution flow:**

```
Transaction Execution:
1. Private functions execute first (on your device)
2. Public functions execute second (on network)
3. No going back to private execution
```

### Why This Direction?

**Privacy Protection:** If public functions could call private functions, they could potentially leak private information.

**Proof Generation:** Private functions need to generate proofs before public execution can verify and act on them.

**State Consistency:** Public functions need to see the results of all private execution before making public state changes.

## Hybrid Patterns in Action

### Pattern 1: Private Preparation + Public Execution

```
Private Function:
├── Check private balance
├── Create private authorization proof  
├── Enqueue public function call
└── Generate proof of correct preparation

Public Function:  
├── Receive authorization proof
├── Verify proof validity
├── Update public state
└── Emit public events
```

**Use Case:** Private DEX trading where balance checks are private but order matching is public.

### Pattern 2: Public Setup + Private Processing

```
Public Function (called in previous transaction):
├── Create public commitment
├── Set parameters for private processing
└── Wait for private responses

Private Function (called in later transaction):
├── Read public parameters
├── Process private data against public rules
├── Generate private results
└── Submit proof of compliance
```

**Use Case:** Public auction where bid commitments are public but actual bid amounts are private.

### Pattern 3: Progressive Disclosure

```
Private Function (Round 1):
├── Generate encrypted commitment
├── Submit commitment hash publicly
└── Keep commitment details private

Public Function (Round 2):
├── Everyone reveals commitments
├── Process all revealed data
└── Determine outcomes transparently
```

**Use Case:** Commit-reveal voting or sealed-bid auctions.

## Choosing the Right Function Type

### Choose Private Functions When:
- ✅ Working with sensitive user data
- ✅ Performing personal financial calculations  
- ✅ Implementing privacy-preserving authorization
- ✅ Building user-specific business logic

### Choose Public Functions When:
- ✅ Coordinating between multiple users publicly
- ✅ Managing shared/public resources
- ✅ Integrating with other public protocols
- ✅ Implementing transparent governance

### Use Both Together When:
- ✅ Building complex applications that need both privacy and coordination
- ✅ Implementing privacy-preserving versions of public protocols
- ✅ Creating selective transparency features
- ✅ Managing hybrid public/private state

## Key Mental Shifts

### From Single Execution to Hybrid Thinking

**Old Mindset:**
- "This function runs on-chain publicly"
- "Everyone can see all computation"
- "State is globally visible"

**New Mindset:**
- "Which execution context serves this function's purpose?"
- "What should be private vs public in this workflow?"  
- "How do I coordinate between private and public execution?"

### From Immediate Calls to Enqueued Execution

**Old Pattern:**
```javascript
function transfer() {
    updateBalance();  // Immediate call
}
```

**New Pattern:**
```javascript
private function privateTransfer() {
    // Private computation
    enqueue publicUpdate(); // Queued for later
}

public function publicUpdate() {
    // Executes after private function completes
}
```

## Key Takeaways

1. **Hybrid execution gives you choice** - privacy or transparency per function
2. **Execution flows in one direction** - private first, then public
3. **Different execution contexts have different capabilities** - choose based on your needs
4. **Complex applications use both** - coordinate between private and public logic

---

## Next Steps

Now that you understand hybrid execution, let's dive deeper into how privacy-preserving systems manage state with notes, nullifiers, and commitments.

**Continue to:** [State Models →](/aztec/learning_journey/phase_2/state_models)

---

**Phase 2 Navigation:**  
[← Mental Model Shift](/aztec/learning_journey/phase_2/mental_model_shift) | **Hybrid Execution** | [State Models →](/aztec/learning_journey/phase_2/state_models)
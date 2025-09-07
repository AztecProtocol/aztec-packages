---
title: "Mental Model Shift"
description: "Understanding the fundamental shift from account-based to UTXO-based privacy and why it's necessary."
sidebar_position: 1
tags: [mental-models, utxo, account-based, privacy-state]
---

# Mental Model Shift: Account-Based to UTXO-Based Privacy

## The Challenge of Privacy with Accounts

If you're familiar with Ethereum, you think about state in terms of **accounts**:
- Each address has a balance stored in a global state tree
- Balances are modified directly (subtract from sender, add to receiver)
- All balances are publicly visible in the state

This account-based model works well for transparency, but creates problems for privacy:

### Problem 1: Balance Visibility
```
Alice's Account: 100 ETH  ← Everyone can see this
Bob's Account: 50 ETH    ← Everyone can see this
Carol's Account: 200 ETH ← Everyone can see this
```

### Problem 2: Transaction Linkability  
```
Alice sends 10 ETH to Bob
→ Alice: 100 - 10 = 90 ETH
→ Bob: 50 + 10 = 60 ETH
↑ Everyone can see this transaction and link Alice to Bob
```

### Problem 3: No Selective Disclosure
With accounts, it's all-or-nothing: either your balance is public or the system doesn't work.

## Enter UTXO-Based Privacy

**UTXO** stands for **Unspent Transaction Output** - think of it as digital cash rather than bank accounts.

### The Cash Analogy

**Physical Cash:**
- You have individual bills in your wallet
- To pay someone, you give them specific bills
- Others can't see how much total cash you have
- You can choose which bills to use for which purchase

**Digital UTXOs (Notes):**
- You have individual "notes" in your wallet
- To pay someone, you give them specific notes
- Others can't see your total balance or other notes
- You can choose which notes to use for which transaction

## UTXO vs Account: Side by Side

### Account-Based (Ethereum Style)

```
Global State:
├── Alice: 100 ETH
├── Bob: 50 ETH  
└── Carol: 200 ETH

Transaction: Alice → Bob (10 ETH)
├── Alice: 100 - 10 = 90 ETH
└── Bob: 50 + 10 = 60 ETH

Result: Everyone knows balances and transaction
```

### UTXO-Based (Privacy Style)

```
Alice's Private Notes:
├── Note1: 60 ETH (encrypted)
├── Note2: 25 ETH (encrypted)
└── Note3: 15 ETH (encrypted)

Transaction: Alice → Bob (10 ETH)
├── Alice uses Note3 (15 ETH)
├── Creates: Note for Bob (10 ETH)
├── Creates: Change note for Alice (5 ETH)
└── Nullifies: Note3 (marks as spent)

Result: Only Alice and Bob know transaction details
```

## Why UTXOs Enable Privacy

### 1. **Encrypted Amounts**
Unlike account balances, note amounts are encrypted. Only the note owner can see the value.

### 2. **No Global Balance**
There's no single "Alice has X ETH" record. Alice's total is the sum of her notes, but only she knows all her notes.

### 3. **Unlinkable Transactions**
When Alice spends a note, observers can't easily link it to her other notes or determine her total wealth.

### 4. **Selective Revelation**
Alice can choose to reveal specific note details (like proving she owns a note worth at least X) without revealing her total wealth.

## The Mental Shift Required

### From Accounts to Notes

**Old Thinking (Accounts):**
- "Alice has 100 ETH in her account"
- "Subtract from Alice, add to Bob"
- "Check Alice's account balance"

**New Thinking (Notes):**
- "Alice has several encrypted notes that sum to some amount"
- "Alice creates new notes for Bob and herself, destroys old note"
- "Alice proves she has sufficient notes without revealing amounts"

### From Direct State Updates to Proofs

**Old Thinking:**
- "Update the balance directly in the state tree"
- "Everyone can verify by looking at the new balance"

**New Thinking:**
- "Create a proof that the note creation/destruction is valid"
- "Others verify the proof without seeing the actual amounts"

### From Public Verification to Private Computation

**Old Thinking:**
- "All computation happens publicly on-chain"
- "Anyone can re-run the computation to verify"

**New Thinking:**
- "Sensitive computation happens privately off-chain"
- "Generate cryptographic proof of correct computation"
- "Others verify the proof without re-doing the computation"

## Practical Implications

### For Users
- **Privacy by design:** Your total wealth isn't visible to others
- **Selective disclosure:** You can prove specific things (like "I have at least 10 ETH") without revealing everything
- **Better UX patterns:** Applications can't see your full financial picture

### For Developers
- **Different state management:** Work with individual notes rather than global balances
- **Proof generation:** Build applications that generate proofs of valid state transitions
- **Note discovery:** Help users find and manage their encrypted notes

## Key Takeaways

1. **UTXOs are like digital cash** - individual, private, and selective
2. **Privacy requires hiding amounts** - which accounts can't do effectively  
3. **Notes enable selective disclosure** - prove specific facts without revealing everything
4. **Proofs replace public computation** - verify correctness without revealing details

## Common Confusions

### "But UTXOs are from Bitcoin!"
Yes, Bitcoin uses UTXOs, but for different reasons (transaction structure). Aztec uses UTXOs specifically for **privacy** - Bitcoin UTXOs are still completely public.

### "Don't UTXOs use more storage?"
Yes, but privacy-preserving systems optimize for privacy first, efficiency second. Modern cryptographic techniques make this practical.

### "How do users manage multiple notes?"
Good question! This is where wallet software comes in - it manages your notes automatically, similar to how your wallet app manages your bank accounts.

---

## Next Steps

Now that you understand why privacy requires a shift from accounts to UTXOs, let's explore how this affects the execution of smart contract functions.

**Continue to:** [Hybrid Execution →](/aztec/learning_journey/phase_2/hybrid_execution)

---

**Phase 2 Navigation:**  
← *Phase 2 Overview* | **Mental Model Shift** | [Hybrid Execution →](/aztec/learning_journey/phase_2/hybrid_execution)
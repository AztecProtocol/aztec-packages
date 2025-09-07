---
title: "Encryption and Key Management"
description: "Understanding private key management and encryption schemes for note-based privacy in Aztec."
sidebar_position: 4
tags: [encryption, key-management, private-keys, note-encryption]
---

# Encryption and Key Management

## The Foundation of Privacy: Keys

In privacy-preserving systems, **key management is everything**. Unlike traditional blockchains where losing your private key only affects signing transactions, in Aztec your keys protect:

- Your ability to see your notes
- Your ability to spend your notes  
- Your ability to receive new notes
- Your transaction privacy

Let's understand how this sophisticated key system works.

## Aztec's Multi-Key Architecture

Unlike Ethereum's single private key model, Aztec uses multiple specialized keys:

### The Key Hierarchy

```
Master Seed
    ├── Nullifier Secret Key (for spending notes)
    ├── Incoming Viewing Secret Key (for receiving notes)
    ├── Outgoing Viewing Secret Key (for tracking sent notes)
    └── Account Contract Keys (for authorization)
```

### Why Multiple Keys?

**Separation of Concerns:**
- Different operations require different keys
- Compromising one key doesn't compromise everything
- Enables fine-grained access control

**Privacy Enhancement:**
- Different key types can't be linked easily
- Reduces correlation between different activities
- Better forward secrecy properties

## The Three Core Key Types

### 1. Nullifier Keys: For Spending

**Purpose:** Generate nullifiers when spending notes

```
Nullifier Generation:
├── Input: Note + Nullifier Secret Key
├── Process: nullifier = hash(note_data + nsk)
├── Result: Unique nullifier for this note
└── Properties: Unlinkable to other nullifiers
```

**Security Properties:**
- **Uniqueness:** Each note produces a unique nullifier
- **Unlinkability:** Can't link nullifiers to notes or users
- **Non-forgery:** Only the key holder can generate valid nullifiers

**What Happens if Compromised:**
- Attacker could spend your notes
- But couldn't see your balance or receive new notes

### 2. Incoming Viewing Keys: For Receiving

**Purpose:** Decrypt notes sent to you

```
Note Encryption Flow:
Sender:
├── Gets your Incoming Viewing Public Key
├── Encrypts note: encrypted_note = encrypt(note_data, ivpk)
├── Publishes encrypted note on-chain

Receiver (You):
├── Downloads encrypted notes from chain
├── Tries to decrypt: note_data = decrypt(encrypted_note, ivsk)  
├── If successful: This note belongs to you
└── Adds note to your local database
```

**Security Properties:**
- **Selective Decryption:** Only you can decrypt your notes
- **Forward Secrecy:** Past notes remain secure even if current key compromises
- **Sender Authentication:** Verify notes came from expected senders

**What Happens if Compromised:**
- Attacker could see your incoming notes and balance
- But couldn't spend your notes or impersonate you

### 3. Outgoing Viewing Keys: For Tracking

**Purpose:** Decrypt notes you sent to others (for your records)

```
Why Track Outgoing Notes?
├── Tax reporting: Know what you sent to whom
├── Business accounting: Track payments and transfers
├── Wallet UX: Show complete transaction history
└── Compliance: Prove payments when required
```

**How It Works:**
```
When You Send a Note:
├── Create note for recipient
├── Encrypt note for recipient (using their incoming key)
├── Also encrypt note details for yourself (using your outgoing key)
├── Store both encrypted versions
└── You can later decrypt to see what you sent
```

**What Happens if Compromised:**
- Attacker could see your outgoing transaction history
- But couldn't spend your notes or see incoming transactions

## Note Encryption Schemes

### Symmetric vs Asymmetric Encryption

**Asymmetric (Public Key) Encryption:**
```
Key Pair Generation:
├── Private key: ivsk (incoming viewing secret key)
├── Public key: ivpk (incoming viewing public key)
└── Property: Encrypt with public key, decrypt with private key

Note Sending:
├── Encrypt note using recipient's public key
├── Only recipient can decrypt with their private key
└── Sender doesn't need recipient's private key
```

**Why Not Symmetric?**
- Would require sharing secret keys between all users
- Key distribution problem becomes unmanageable
- No way to revoke access without changing all keys

### Encryption Process Deep Dive

**Creating an Encrypted Note:**
```
Original Note:
├── Value: 50 ETH
├── Owner: recipient_address  
├── Nonce: random_value
└── App-specific data: custom_fields

Encryption Process:
├── Serialize note data
├── Generate encryption randomness
├── Encrypt: ciphertext = encrypt(note_data, randomness, ivpk)
├── Create commitment: hash(note_data)
└── Store: commitment (public), ciphertext (public but encrypted)
```

**Decryption Process:**
```
For Each New Note Commitment:
├── Download associated ciphertext
├── Attempt decryption: decrypt(ciphertext, your_ivsk)
├── If successful: This note is yours
├── If failed: Not your note, ignore
└── Add successful decryptions to your note database
```

## Key Derivation and HD Wallets

### Hierarchical Deterministic (HD) Key Generation

Like modern Bitcoin wallets, Aztec uses HD key derivation:

```
Master Seed (12/24 word phrase)
    ↓
Master Key (derived from seed)
    ↓
Account Keys (derived from master)
    ├── Account 0 Keys
    │   ├── Nullifier Secret Key
    │   ├── Incoming Viewing Secret Key  
    │   └── Outgoing Viewing Secret Key
    ├── Account 1 Keys
    │   └── [same key types]
    └── Account N Keys
        └── [same key types]
```

### Key Derivation Benefits

**Backup Simplicity:**
- One seed phrase backs up unlimited accounts and keys
- No need to backup individual keys
- Deterministic regeneration from seed

**Account Isolation:**
- Each account has independent keys  
- Compromise of one account doesn't affect others
- Better privacy between different use cases

## Advanced Key Management

### Key Rotation

**Why Rotate Keys?**
- Suspected compromise
- Planned security upgrade
- Compliance requirements
- Forward secrecy improvement

**How Key Rotation Works:**
```
Rotation Process:
├── Generate new key pair
├── Create "key rotation" transaction
├── Proves: You control both old and new keys
├── Updates: Account contract to use new keys
└── Result: New notes use new keys, old notes still accessible
```

### Multi-Signature Keys

**Account Abstraction Enables:**
- Multiple keys required to authorize transactions
- Threshold schemes (M-of-N signatures)
- Time-locked keys for recovery
- Custom authorization logic

**Example Multi-Sig Setup:**
```
Account Contract:
├── Requires: 2 of 3 signatures
├── Key 1: Primary user key
├── Key 2: Backup user key  
├── Key 3: Recovery service key
└── Logic: Any 2 can authorize transactions
```

### Key Recovery Mechanisms

**Social Recovery:**
```
Guardian Setup:
├── Choose trusted guardians (friends, family, services)
├── Guardians get guardian keys (not spending keys)
├── Recovery requires majority of guardian signatures
└── Guardians help recover without seeing your notes
```

**Hardware Key Support:**
```
Hardware Wallet Integration:
├── Private keys stored on hardware device
├── Signing happens on hardware (never on computer)
├── Better protection against malware
└── Still supports all Aztec key types
```

## Privacy Implications of Key Management

### Key Reuse Considerations

**Bad Practice:**
```
Using the same key for multiple purposes
→ Creates correlation between different activities
→ Reduces overall privacy
```

**Good Practice:**  
```
Separate keys for separate contexts:
├── Personal spending: Account 1
├── Business transactions: Account 2  
├── DeFi interactions: Account 3
└── Each has independent privacy properties
```

### Metadata Privacy

**Keys Can Leak Information:**
- Key generation patterns
- Timing of key usage
- Correlation between key operations

**Privacy Best Practices:**
```
Key Usage Patterns:
├── Randomize operation timing
├── Use different keys for different contexts
├── Batch operations when possible
└── Avoid predictable key usage patterns
```

## Common Key Management Mistakes

### Mistake 1: Single Key Backup
```
Wrong: Only backing up spending key
Right: Backup complete key hierarchy (use seed phrase)
```

### Mistake 2: Key Sharing
```
Wrong: Sharing viewing keys for convenience
Right: Use specific access permissions and viewing key derivatives
```

### Mistake 3: Predictable Key Generation
```
Wrong: Using predictable randomness for key generation
Right: Use cryptographically secure randomness sources
```

### Mistake 4: No Key Rotation Plan
```
Wrong: Using same keys forever
Right: Regular key rotation schedule and procedures
```

## Key Takeaways

1. **Aztec uses multiple specialized keys** - each with specific purposes and security properties
2. **Different keys protect different aspects** - spending, receiving, and tracking capabilities are separated
3. **HD key derivation enables simple backup** - one seed phrase protects all your keys and accounts
4. **Key management affects privacy** - proper key usage patterns enhance privacy protection
5. **Account abstraction enables advanced features** - multi-sig, rotation, and recovery mechanisms
6. **Backup and recovery planning is critical** - losing keys means losing access to your private notes

---

## Phase 3 Complete!

Congratulations! You've completed Phase 3 of your Aztec learning journey. You now understand:

✅ **Zero-knowledge proof fundamentals** - proving without revealing  
✅ **Circuit and constraint systems** - how computations become provable  
✅ **Merkle trees for privacy** - enabling private membership verification  
✅ **Encryption and key management** - protecting your private data and capabilities  

## What's Next?

Now that you understand the cryptographic foundations, you're ready to learn about **Aztec's specific architecture** - how all these components work together in the Aztec Protocol.

**Continue to:** [Phase 4: Aztec Architecture →](/aztec/learning_journey/phase_4)

---

**Phase 3 Navigation:**  
[← Merkle Trees for Privacy](/aztec/learning_journey/phase_3/merkle_trees_privacy) | **Encryption and Keys** | *Phase 3 Complete!*

---

*Return to [Phase 3 Overview](/aztec/learning_journey/phase_3) or [Full Learning Journey](/aztec/learning_journey)*
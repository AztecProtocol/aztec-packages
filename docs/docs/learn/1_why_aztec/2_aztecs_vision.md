---
title: "Aztec's Vision"
description: "Discover how Aztec is creating a fully programmable private zk rollup that combines privacy, accessibility, trust minimization, and compliance"
---

## Welcome to the Future of Private Applications

Now that you understand the privacy problem from our previous lesson, let's explore how Aztec is solving it. This goes beyond just fixing privacy; we're creating an new paradigm for building decentralized applications.

You can have your cake and eat it too: the security and decentralization of blockchain, combined with the privacy you expect from traditional applications. This is what we're building at Aztec.

## Learning Objectives

By the end of this lesson, you'll understand:

1. How Aztec approaches privacy differently from other solutions
2. Why accessibility through zero-knowledge proofs matters for mass adoption
3. How trust minimization ensures no one can compromise your privacy
4. Why programmable compliance is necessary for real-world adoption

---

## Core Value #1: Privacy First, Always

### Programmable Privacy

Let's start with what makes Aztec unique. While other blockchains treat privacy as an afterthought or optional feature, we've built Aztec from the ground up with privacy at its core.

Think of it this way:

- **Other blockchains**: "Here's a transparent system. Maybe we can add some privacy later?"
- **Aztec**: "Here's a private system. You can make things public when you choose to."

This fundamental difference changes everything about how applications work.

### The UTXO Architecture

You might have heard of UTXO (Unspent Transaction Output) from Bitcoin, but Aztec takes this concept and supercharges it for privacy. Let's explain why this matters with a simple analogy:

**Traditional Account Model** (like Ethereum):

```
Your Bank Account Balance: $1000 (everyone can see this)
You send $100 to Alice
New Balance: $900 (everyone can see this too)
```

**Aztec's Private UTXO Model**:

```
You have several encrypted "notes" that only you can read, making up your balance.
You consume one note and create two new ones:
  - One for Alice (only she can decrypt)
  - One for your remaining balance (only you can decrypt)
Observers see: "Someone did something" ¯\_(ツ)_/¯
```

This isn't just hiding amounts - it's complete transaction privacy!

We will be going into notes and Aztec's private UTXO model later in the learning journey.

### Smart Contracts with Secrets

Here's where it gets really exciting. Aztec doesn't just enable private payments; it enables private smart contracts. Let's explore what this means:

#### Private State Management

In Aztec, smart contracts can have:

- **Private variables** that only authorized parties can read
- **Private functions** that execute without revealing inputs
- **Selective disclosure** where you choose what to make public

```javascript
// Traditional Ethereum Contract
contract Voting {
    mapping(address => uint) public votes;  // Everyone sees who voted for what
}

// Aztec Private Contract (conceptual)
contract PrivateVoting {
    private mapping(address => uint) votes;  // Votes are encrypted

    function vote(uint choice) {
        // Your vote is recorded privately
        // Only the final tally is revealed
    }
}
```

### Real Privacy

Let's be clear about what we mean by privacy:

:::info What Aztec's Privacy Means

- **Data Encryption**: Information is mathematically encrypted, not just hidden
- **Computational Privacy**: Even the execution of functions can be private
- **Selective Transparency**: You control what becomes public
- **Forward Privacy**: Past transactions remain private even with future technology
  :::

This isn't like using a mixer or a privacy coin where you're just obscuring transactions. This is fundamental, cryptographic privacy built into every layer of the system.

---

## Core Value #2: Accessibility

### The Magic of Recursive Proofs

Now, you might be thinking, "Privacy sounds expensive. Won't this make transactions super costly?" by using recursive proofs, (little proofs combined into one mega proof), Aztec keeps transactions low cost.

Let's explain this using an analogy:

**Traditional Blockchain Verification:**
Imagine you're a teacher grading 1000 test papers. You have to check every single answer on every single paper. That's a lot of work!

**Aztec's Recursive Proof System:**
Now imagine each student grades their own test and gives you a magical certificate that proves they graded it correctly. Then, groups of students combine their certificates into one super-certificate. Finally, you only need to verify one final certificate that proves all 1000 tests were graded correctly.

That's the power of recursive aggregation! We can batch hundreds or thousands of transactions and prove them all with a single, efficient proof.

### Cost Reduction

Let's look at what this means for you as a user:

```
Previous Private Transaction Cost:
├── Compute complex cryptography: $$$$$
├── Store encrypted data: $$
├── Verify each transaction: $$$$
└── Total: Very Expensive 😢

Aztec's Aggregated Transaction Cost:
├── Your transaction joins a batch
├── Cost split among all transactions
├── Single proof verifies everything
└── Total: Affordable! 😊
```

The key here is that other rollups use ZK proofs and batching transactions purely for succinct verification. But, Aztec uses it also for private state whiilst _still_ maintaining cheaper transaction costs.

The more people use Aztec, the cheaper it becomes for everyone. It's like carpooling for blockchain transactions!

### Accessibility

1. **Developer Experience**: We provide familiar tools so developers don't need PhDs in cryptography.
2. **User Experience**: Privacy should be the default, not something users have to figure out.
3. **Global Reach**: Low costs mean anyone, anywhere can participate
4. **No Special Hardware**: You don't need expensive equipment to use Aztec. Only internet access.

:::tip Why This Matters
Without accessibility, privacy becomes a luxury only available to the wealthy. We believe privacy is a human right, not a premium feature. That's why making Aztec affordable and usable for everyone is core to our mission.
:::

---

## Core Value #3: Trust Minimization

### What Does Trust Minimization Really Mean?

Trust minimization means you don't have to trust anyone, not even Aztec, to keep your information private. The math and the code guarantee it.

**Traditional Privacy**:

- Your bank _promises_ to keep your data private
- Messaging apps _say_ your messages are encrypted
- A company _pinky-swears_ they won't look at your data
- _You have to trust them_

**Aztec's Privacy**:

- Math proves your data is private
- Open source code you can verify
- Decentralized network with no single point of failure
- _You don't have to trust anyone_

### The Sequencer Network

Aztec's sequencer network is decentralized from day 1.

Here's how Aztec ensures no single entity can compromise your privacy or censor your transactions:

#### The Network

```
Your Transaction
    ↓
Encrypted & Sent to Multiple Sequencers
    ↓
Sequencers (stake tokens to participate):
├── Sequencer A ─┐
├── Sequencer B ─┼─→ Compete to include your transaction
├── Sequencer C ─┤
└── Sequencer D ─┘
    ↓
Selected Sequencer Creates Block
    ↓
Proof Generated & Posted to Ethereum
    ↓
Your Private Transaction is Final!
```

No single sequencer can:

- See your private data
- Censor your transaction
- Change the rules
- Shut down the network

### Credible Neutrality

This is a fancy term for a simple idea: the same rules apply to everyone, enforced by code, not people.

**What This Means:**

- A billionaire's transaction follows the same rules as yours
- Governments can't get special access to private data
- Even Aztec's creators can't change the rules without community consent
- The protocol doesn't care who you are, where you're from, or what you're doing

It's like having a referee that's actually a robot - it can't be bribed, intimidated, or play favorites!

:::success Your Rights on Aztec

- **Right to Privacy**: Cryptographically guaranteed, not policy-based
- **Right to Transact**: No one can freeze your assets or stop your transactions
- **Right to Verify**: All code is open source and auditable
- **Right to Participate**: Anyone can become a sequencer or prover
- **Right to Exit**: You can always withdraw to Ethereum mainnet
  :::

---

## Core Value #4: Compliance

Previously, you could have privacy OR compliance on the blockchain, but not both". With Atec, you can have privacy AND selective, programmable compliance".

Aztec lets developers build compliance directly into applications while preserving user privacy.

**Example: Private Lending with KYC**

- [TODO] check this code lol

```rust
contract PrivateLender {
    #[private]
    fn borrow(
        amount: Field,
        kyc_proof: KYCProof,
        creditworthiness_proof: CreditProof
    ) {
        // Verify user meets requirements without revealing:
        // - Exact income or credit score
        // - Identity or personal details
        // - Transaction history

        assert(kyc_proof.verify());
        assert(creditworthiness_proof.verify_minimum_score(650));

        // Approve loan based on zero-knowledge proofs
        mint_loan_tokens(amount);
    }
}
```

Users can prove they're creditworthy without exposing their financial details.

**Example: Regulatory Reporting**

- [TODO] check code lol

```rust
contract ComplianceReporter {
    #[aztec(public)]
    fn generate_aml_report() -> AMLProof {
        // Generate proof showing:
        // ✓ No transactions exceeded $10k (without amounts)
        // ✓ All users were KYC verified (without identities)
        // ✓ No sanctioned addresses involved (without revealing addresses)

        AMLProof::aggregate_compliance_data(self.transaction_nullifiers)
    }
}
```

Regulators get the assurance they need, users keep their privacy. Everyone wins!

### Real-World Compliance Examples

Let's explore how this enables previously impossible applications:

- **Private But Auditable Business Operations**: Companies can keep trade secrets while proving regulatory complianc and auditors can verify correctness without seeing sensitive data.
- **Age Verification**: Prove you're over 18 without revealing your birthdate or any personal details. This enables compliance with age-verification laws such as age-restricted access, without storing personal details, such as government ID, in a database.
- **Tax Compliance**: Prove you paid the correct taxes without revealing your entire financial history. This enables automatic reporting without manual disclosure

:::warning Important Distinction
Aztec provides the tools for compliance. It is up to application developers to implement them appropriately for their jurisdiction and use case. The protocol layer remains neutral and permissionless.
:::

### Example Privacy Applications

When you combine privacy with programmable compliance on the blockchain, new business models become possible:

- **Private DEXs** that meet trading regulations.
- **Confidential payroll** systems that handle tax withholding.
- **Private voting** that is verifiably correct and prevents double-voting.
- **Private healthcare** applications that meet HIPAA requirements.
- **Confidential supply chains** that provide necessary customs data.

---

## Summary

These four core values don't exist in isolation; they reinforce each other:

```
Privacy ←→ Accessibility
   ↑            ↓
   ↑            ↓
Trust Minimization ←→ Compliance
```

- **Privacy needs accessibility** or it's only for the elite.
- **Accessibility needs trust minimization** or it can be shut down.
- **Trust minimization needs compliance** or it can't integrate with the real world.
- **Compliance needs Privacy** or it exposes too much information.

### What This Means for You

As a developer learning Aztec, you're not just learning another blockchain platform. You're learning to build on-chain privacy applications that:

- Protect user privacy by default
- Cost less through proof aggregation
- Can't be censored or controlled by any single entity
- Can meet real-world compliance requirements

You're learning to build the future of Web3. One that's _actually_ better than Web2!

### The Journey Ahead

Aztec is live, the technology works, and developers are _already_ building amazing applications.

- [TODO] link to a page of example dapps on Aztec

As you continue through this learning journey, you'll see how these values translate into actual code, real applications, and tangible benefits for users.

:::success Checkpoint
**You've completed Section 1.2: Aztec's Vision!**

You now understand:

- ✅ How Aztec makes privacy programmable, not just optional
- ✅ Why recursive proofs make private transactions affordable
- ✅ How trust minimization guarantees your privacy rights
- ✅ Why compliance and privacy are partners, not enemies

**Feeling inspired?** You should be! You're about to learn how to build applications that were literally impossible before Aztec.

- [TODO] maybe add a link to cretae a tweet to say you're on the learning journey? Could be good for our metric tracking?
:::

---

## Next Steps

Now that you understand the vision, you're ready to see how it all works under the hood. In the next section, we'll explore:

- The architecture that makes this vision possible
- How zero-knowledge proofs actually work (without heavy math!)
- The developer tools that make building on Aztec accessible
- Your first hands-on experience with Aztec

Remember, every expert was once a beginner. Every line of code you write brings us closer to a world where privacy is a default, not a luxury. Welcome to the revolution. We're glad you're here!

## Quick Review Questions

Before moving on, try to answer these questions to test your understanding:

1. **Why is UTXO better for privacy than the account model?**
   _Hint: Think about what observers can see in each model_

2. **How do recursive proofs make transactions cheaper?**
   _Hint: Think about the teacher and test papers analogy_

3. **What's the difference between trusting and trust minimized privacy?**
   _Hint: Who controls your privacy in each model?_

4. **How can applications be compliant AND private?**
   _Hint: Think about proving properties without revealing data_

Don't worry if you can't answer all of these yet, they'll become clearer as we dive deeper into the technical details in upcoming modules!

## Further Resources

- [Aztec Network Website](https://aztec.network/)
- [Join the Aztec Community](https://discord.gg/aztec)

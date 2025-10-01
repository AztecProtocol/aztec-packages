---
title: "Continue Building: Advanced Features"
tags: [contracts, learning journey, practice]
description: "Add advanced features like authentication witnesses, cross-chain communication, and historical state proofs to your contract."
---

Excellent work learning about authentication witnesses, cross-chain communication, and historical state! You've now explored some of Aztec's most advanced and powerful capabilities. These features enable sophisticated applications that bridge the gap between privacy and interoperability.

## Taking Your Contract to the Next Level

You've been building and expanding your contract throughout this learning journey. Now it's time to consider adding these advanced features that can unlock entirely new use cases and user experiences.

If you haven't been building along, this is still a great time to start experimenting with these concepts using the [Aztec Noir Boilerplate](https://github.com/defi-wonderland/aztec-boilerplate).

## Advanced Features to Explore

Here are the powerful new capabilities you can now add to your contracts:

### Authentication Witnesses

Implement delegation and authorization patterns:

- Allow users to authorize actions without direct interaction
- Enable meta-transactions where someone else pays gas fees
- Build contracts that can act on behalf of users (with explicit permission)
- Implement sophisticated access control and approval workflows

AuthWit is particularly valuable for improving user experience - users can pre-approve actions, and your contract can execute them at the right time without requiring the user to be online.

### Cross-Chain Communication

Bridge the gap between L1 and L2:

- Send messages from Aztec (L2) to Ethereum (L1)
- Consume messages from L1 in your L2 contracts
- Build portals that connect your Aztec contract to Ethereum contracts
- Create hybrid applications that leverage both layers

Cross-chain communication opens up possibilities like bridging assets, triggering L1 actions from private L2 state, or integrating with existing Ethereum DeFi protocols.

### Historical State Proofs

Access and prove past state:

- Prove what a value was at a specific point in the past
- Verify historical conditions without revealing current state
- Build time-locked features and retroactive checks
- Create audit trails with cryptographic guarantees

This is powerful for building things like historical snapshots for voting, time-based access control, or proving compliance without revealing current data.

## Ideas for Implementation

Depending on what you've built, here are ways to incorporate these advanced features:

### If You Built a Task Manager:

- **AuthWit**: Let users delegate task management to assistants or automation tools
- **Cross-Chain**: Trigger Ethereum notifications when important tasks are completed
- **History**: Prove task completion status at a specific date for audits

### If You Built a Token:

- **AuthWit**: Enable approved spenders (like DeFi protocols or wallets) to move tokens on behalf of users
- **Cross-Chain**: Build a bridge to move tokens between L1 and L2
- **History**: Prove a user's token balance at a historical block for airdrops or voting

### If You Built a Voting System:

- **AuthWit**: Allow delegated voting where trusted parties can vote on your behalf
- **Cross-Chain**: Post final vote tallies to L1 for transparency
- **History**: Take voting power snapshots at proposal creation time

### If You Built an Escrow:

- **AuthWit**: Let authorized agents act on behalf of parties in the escrow
- **Cross-Chain**: Release funds to L1 when escrow conditions are met
- **History**: Prove the state of the escrow at dispute time

### If You Built a Secret Society:

- **AuthWit**: Allow moderators to add members on behalf of other moderators with permission
- **Cross-Chain**: Post membership milestones or announcements to L1 for external visibility
- **History**: Prove membership status at a historical point for retroactive benefits or voting

## Getting Started

These features are more advanced, so here's a suggested approach:

1. **Start with AuthWit**: This is the most immediately useful for improving UX. Pick one function that would benefit from delegation and add AuthWit support.

2. **Experiment with History**: If your contract has state that changes over time, try implementing a function that can prove what a value was in the past.

3. **Explore Cross-Chain**: This is the most complex feature. Start by understanding the message flow, then try a simple message passing example before building a full portal.

## Practical Exercises

### Exercise 1: Add AuthWit to a Sensitive Function

Choose a function in your contract that modifies state or moves assets. Modify it to accept an authentication witness, allowing approved third parties to call it on behalf of the user.

Hint: You'll need to:

- Import the auth utilities from `aztec.nr`
- Add AuthWit validation to your function
- Test with both direct calls and authorized calls

### Exercise 2: Prove Historical State

If your contract has public state that changes over time, implement a function that can prove what that state was at a previous block.

Hint: Use the historical state access patterns to read old values and create proofs about them.

### Exercise 3: Design a Cross-Chain Flow (Conceptual)

Even if you don't implement it yet, design how your contract could interact with an L1 Ethereum contract:

- What messages would you send from L2 to L1?
- What L1 actions would trigger L2 effects?
- What would your portal contract look like?

This exercise helps you understand the architecture even if full implementation comes later.

## Key Concepts to Apply

As you work with these advanced features, keep these principles in mind:

**AuthWit Enables UX Innovation**: Pre-approvals and delegated actions let you build experiences where users maintain control but don't need to sign every transaction. This is crucial for mainstream adoption.

**Cross-Chain Is About Composability**: Don't think of L1 and L2 as separate - they're two layers of the same system. Use each for what it does best: L2 for privacy and scale, L1 for settlement and interoperability.

**Historical Proofs Enable Trust**: Being able to prove past state without revealing current state is a unique capability. Use it to build features that would be impossible in fully private or fully transparent systems.

**Complexity Has Trade-offs**: These features are powerful but add complexity. Make sure the benefits justify the additional code and potential attack surface.

## When to Use Each Feature

### Use AuthWit When:

- Users need to pre-approve actions
- You want to enable gasless transactions
- Multiple parties need to coordinate on shared resources
- You're building token contracts or DeFi protocols

### Use Cross-Chain When:

- You need to bridge assets between L1 and L2
- You want to trigger L1 actions from L2 (or vice versa)
- You're integrating with existing Ethereum contracts
- You need L1's security guarantees for certain operations

### Use Historical Proofs When:

- You need voting power snapshots
- You're implementing time-locks or vesting
- You need to prove past state for audits or disputes
- You want retroactive eligibility checks without revealing current state

## Next Steps

Once you've experimented with these advanced features:

- **Test edge cases**: These features have complex interactions - test thoroughly
- **Consider security**: AuthWit and cross-chain features introduce new trust assumptions
- **Think about gas costs**: Historical proofs and cross-chain messages have performance implications
- **Build gradually**: Add one feature at a time and make sure it works before adding more

You're now working with production-grade features used in real Aztec applications. Take your time, experiment, and don't hesitate to start simple.

## Additional Resources

- [Aztec Noir Boilerplate](https://github.com/defi-wonderland/aztec-boilerplate) - Reference implementation
- [Aztec.nr Reference](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr) - Library documentation
- [Example Contracts](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts) - See AuthWit, portals, and history in action
- [Portal Examples](https://github.com/AztecProtocol/aztec-packages/tree/master/l1-contracts) - L1 portal contract examples

---

**You're nearly there!** These advanced features represent the cutting edge of what's possible with privacy-preserving smart contracts. Mastering them puts you at the forefront of this technology. Keep experimenting and building!

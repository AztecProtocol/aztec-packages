---
title: "Keep Building: Expand Your Contract"
tags: [contracts, learning journey, practice]
description: "Enhance the contract you started earlier by adding custom notes, composability, and events."
---

Great work completing the sections on custom notes, composability, and events! You've now learned some of Aztec's most powerful features for building sophisticated privacy-preserving applications. Let's put these concepts into practice.

## Time to Level Up Your Contract

Remember the contract you started building after learning about storage, functions, and compilation? Now's the perfect time to expand it with the advanced features you've just learned. These concepts will transform your basic contract into something much more powerful and production-ready.

If you haven't started building yet, check out [Start Building: Practice Your Skills](../storage_functions_compile_test/exercise) first, then come back here.

## What to Add Next

Here are the new capabilities you can now incorporate into your contract:

### Custom Notes

Refine your private data structures with custom note types:

- Design notes that perfectly match your use case
- Add custom fields beyond simple values
- Implement specialized behavior for your notes
- Control exactly what private data gets stored and how

If you started with simple `ValueNote` storage, consider replacing it with a custom note that captures more context about your application's domain.

### Contract Composability

Make your contract interact with others:

- Call functions in other contracts (both private and public)
- Build modular systems where contracts work together
- Create contracts that act as interfaces to existing protocols
- Use the auto-generated contract interfaces for type-safe calls

Think about what external contracts your application might need - a token contract for payments? A registry for lookups? An oracle for data?

### Events

Add visibility and tracking to your contract:

- Emit events when important state changes occur
- Allow applications to monitor and react to contract activity
- Create both encrypted (private) and unencrypted (public) events
- Help users and interfaces track what's happening

Consider what events would be useful for someone building a frontend for your contract. What actions should they be notified about?

## Ideas for Expansion

Depending on what you built initially, here are some ways to incorporate these new concepts:

### If You Built a Task Manager:

- **Custom Notes**: Create detailed task notes with metadata like priority, tags, and timestamps
- **Composability**: Integrate with a token contract to add task rewards or bounties
- **Events**: Emit events when tasks are created, completed, or assigned

### If You Built a Token:

- **Custom Notes**: Add transfer notes with memo fields or expiration dates
- **Composability**: Build a DEX interface that calls your token's transfer functions
- **Events**: Emit transfer events (encrypted or public based on privacy needs)

### If You Built a Voting System:

- **Custom Notes**: Store votes with additional context like comments or weights
- **Composability**: Connect to a token contract to check voting power
- **Events**: Emit events when proposals are created and when voting ends

### If You Built an Escrow:

- **Custom Notes**: Create detailed escrow agreements with terms and conditions
- **Composability**: Call token contracts to hold and release funds
- **Events**: Emit events for escrow creation, funding, and release

### If You Built a Secret Society:

- **Custom Notes**: Create membership notes with additional metadata like join date, roles, or reputation
- **Composability**: Integrate with a token contract for membership fees or voting power
- **Events**: Emit encrypted events when members are added (visible only to members)

## Getting Started with Enhancements

Here's a suggested approach to adding these features:

1. **Start with Events**: Add event emissions to your existing functions. This is straightforward and immediately useful for testing and monitoring.

2. **Upgrade to Custom Notes**: If you used simple notes, refactor them into custom note types that better represent your domain.

3. **Add Composability**: Identify one external interaction that would add value (like calling a token contract) and implement it.

## Key Concepts to Apply

As you build, keep these principles in mind:

**Custom Notes Are Powerful**: Don't settle for generic note types. Design notes that perfectly match your needs - this makes your contract clearer and more maintainable.

**Composability Enables Innovation**: The ability to call other contracts means you don't have to build everything yourself. Leverage existing infrastructure and focus on your unique value.

**Events Create Transparency**: Even in private systems, selective transparency through events is valuable. Choose what to reveal carefully, but do provide ways for users and applications to track important changes.

## Practical Exercises

Try these specific implementations to practice the concepts:

### Exercise 1: Add a Custom Note

Take one of your existing `PrivateSet` storage slots and replace its note type with a custom note that includes at least 3 meaningful fields for your application.

### Exercise 2: Call Another Contract

Implement a function that calls a method on another contract. Even if you don't have a real external contract yet, you can define an interface and structure the call.

### Exercise 3: Emit Events

Add at least one encrypted event and one unencrypted event to your contract. Make sure they provide useful information for someone monitoring your contract.

## Next Steps

Once you've enhanced your contract with these features:

- **Test thoroughly**: Make sure your new functionality works as expected
- **Experiment with combinations**: See how these features work together
- **Consider edge cases**: What happens in error scenarios?
- **Think about security**: Are there any new attack vectors to consider?

Building real contracts with real features is how you'll truly internalize these powerful concepts. Each addition makes your contract more capable and your understanding deeper.

## Additional Resources

- [Aztec Noir Boilerplate](https://github.com/defi-wonderland/aztec-boilerplate) - Reference implementation
- [Aztec.nr Reference](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr) - Library documentation
- [Example Contracts](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts) - Real-world examples

---

**Keep building!** Each feature you add brings your contract closer to being production-ready. Don't worry about getting everything perfect - iteration and experimentation are key to mastering these concepts.

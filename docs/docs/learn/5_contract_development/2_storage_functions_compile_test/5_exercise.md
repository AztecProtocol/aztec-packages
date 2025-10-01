---
title: "Start Building: Practice Your Skills"
tags: [contracts, learning journey, practice]
description: "Apply what you've learned about storage, functions, and compilation by building your own Aztec smart contract."
---

Congratulations on completing the sections on storage, functions, and compilation! You now have the foundational knowledge needed to start building Aztec smart contracts. The best way to solidify your understanding is to **start building something yourself**.

## Ready to Build?

Now that you understand the core concepts, we recommend you start building a contract that incorporates what you've learned. The [Aztec Noir Boilerplate](https://github.com/defi-wonderland/aztec-boilerplate) is an excellent starting point - it provides a complete development environment with:

- A sample Counter contract to learn from
- Pre-configured tooling and dependencies
- Project structure following Aztec conventions
- Ready-to-use testing setup

## What to Practice

As you build your own contract, try to incorporate these concepts you've learned:

### Storage

- Define both private and public state
- Use different storage types (`PrivateSet`, `PublicMutable`, `Map`, etc.)
- Consider creating custom note types for your private data

### Functions

- Implement different function types:
  - `#[private]` for confidential operations
  - `#[public]` for transparent state changes
  - `#[utility]` for off-chain queries
  - `#[initializer]` for contract setup
- Practice enqueuing public functions from private contexts
- Use `#[internal]` for functions that should only be called by the contract itself

### Compilation

- Compile your contract with `aztec-nargo compile`
- Post-process artifacts with `aztec-postprocess-contract`
- Understand the generated artifacts in the `target` directory

## Project Ideas

Not sure what to build? Here are some ideas that will let you practice the concepts:

- **Task Manager**: Private tasks with public counters
- **Token**: Private balances with public supply tracking
- **Voting System**: Private votes with public tallies
- **Escrow Contract**: Private agreements with public settlement
- **Secret Society**: Private membership system with role-based access control (admin and moderators can privately add members)
- **Registry**: Map addresses to private or public data

Pick something that interests you and start simple. You can always add complexity as you gain confidence.

## Getting Started

1. Clone the [Aztec Noir Boilerplate](https://github.com/defi-wonderland/aztec-boilerplate)
2. Follow the setup instructions in the README
3. Examine the existing Counter contract to see patterns in action
4. Create your own contract and start implementing

## Key Concepts to Apply

As you build, keep these principles in mind:

**Privacy vs. Transparency**: Think about what data needs to be private and what can be public. Not everything needs to be private - public state is simpler and sometimes necessary for coordination.

**Function Types Matter**: Choose the right function type for each operation. Private functions hide data, public functions provide transparency, utility functions query off-chain, and initializers set up contracts.

**Custom Notes**: If you need to store complex private data, define custom note types. They give you precise control over what's stored and how it's structured.

**Compilation Workflow**: Get comfortable with the compile-postprocess-artifact cycle. Understanding what each step produces will help you debug issues.

## Next Steps

Once you've built something and gotten it compiling:

- **Test it**: Write tests to verify your contract behaves correctly
- **Experiment**: Try different approaches and see what works
- **Iterate**: Start simple, get it working, then add features

Building real contracts is how you'll truly internalize these concepts. Don't worry about making mistakes - they're part of the learning process.

## Additional Resources

- [Aztec Noir Boilerplate](https://github.com/defi-wonderland/aztec-boilerplate) - Your starting point
- [Aztec.nr Reference](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr) - Library documentation
- [Noir Language Documentation](https://noir-lang.org/docs) - Noir syntax and patterns

---

**Ready to build?** Clone the boilerplate and start creating. The skills you've learned in this section are meant to be used, not just understood. Happy building!

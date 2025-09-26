---
title: "Aztec Boilerplate"
description: "Jump-start your Aztec development with a pre-configured boilerplate featuring contracts, tests, and best practices"
tags:
  [
    development environment,
    setup,
    getting started,
    boilerplate,
    development tools,
  ]
---

Now that you have your Sandbox running, let's explore a practical starting point for Aztec development! The Aztec boilerplate repository provides a solid foundation with everything you need to begin building privacy-preserving smart contracts.

## What is the Aztec Boilerplate?

Think of the boilerplate as your starter kit - it's like getting a partially assembled model where the tricky foundation work is already done, letting you focus on building your unique features. Created by the DeFi Wonderland team, this boilerplate gives you a pre-configured Aztec workspace with example contracts, tests, and development tools all wired together.

You can find it here: https://github.com/defi-wonderland/aztec-boilerplate

## What's Inside?

The boilerplate includes several helpful components to accelerate your learning:

### Sample Counter Contract

The repository includes a basic Counter contract that demonstrates key Aztec concepts:

- **Private-to-public execution patterns** - How private functions can trigger public functions
- **Owner access control** - How to restrict certain functions to specific users
- **State management** - Working with both private and public state

This isn't just a "Hello World" - it's a practical example showing real patterns you'll use in production contracts.

### Project Structure

The boilerplate organizes code in a clean, intuitive way:

```
src/
├── nr/          # Your Noir contracts live here
├── ts/          # TypeScript tests and scripts
└── artifacts/   # Generated contract bindings (created automatically)
```

### Pre-configured Testing

One of the best features is the complete testing setup:

- **Automatic Sandbox management** - Tests automatically start and stop the Aztec Sandbox
- **Noir unit tests** - Test contract logic directly
- **TypeScript integration tests** - Test how contracts interact with each other and with users
- **Performance benchmarking** - Automatically measures gas costs and circuit constraints

## Getting Started

Let's get the boilerplate up and running. Don't worry if some concepts aren't clear yet - we'll explore them in detail throughout your learning journey.

### Step 1: Clone the Repository

```bash
git clone https://github.com/defi-wonderland/aztec-boilerplate.git
cd aztec-boilerplate
```

### Step 2: Install Aztec Tools

Make sure you have the Aztec tools installed at the correct version. If you haven't already:

```bash
aztec-up -v <version>
```

### Step 3: Install Dependencies

```bash
yarn install
```

### Step 4: Build the Contracts

```bash
yarn build
```

This command compiles your Noir contracts and generates TypeScript bindings - essentially creating a bridge between your smart contracts and your tests or application code.

### Step 5: Run the Tests

```bash
yarn test
```

Watch as the tests automatically spin up a local Aztec Sandbox, deploy contracts, and run through various scenarios. Pretty cool, right?

## Exploring the Code

Take some time to browse through the repository:

1. **Check out the Counter contract** in `src/nr/` - Notice how it uses both private and public functions
2. **Look at the tests** in `src/ts/` - See how they interact with the contract
3. **Review the configuration files** - The `package.json` shows available scripts and the testing setup

## What's Next?

Don't worry if not everything in the repository makes perfect sense right now. As you progress through the learning journey, you'll understand:

- How private and public execution works (coming in the next module)
- Testing strategies and best practices (covered in detail later)
- Advanced patterns for building complex applications

### Try This!

If you're feeling adventurous, try modifying the Counter contract:

1. Add a new function that decrements the counter
2. Run `yarn build` to recompile
3. Add a test for your new function
4. Run `yarn test` to see if it works

Don't worry if you run into issues - experimentation is how we learn! Each error message is a learning opportunity.

## Key Takeaways

- The boilerplate provides a ready-to-use development environment
- It includes example contracts demonstrating important Aztec patterns
- The testing setup is already configured and ready to go
- You can start experimenting with real Aztec contracts immediately

Remember, this boilerplate is your playground. Feel free to break things, experiment, and learn by doing. In the upcoming sections, we'll dive deeper into how everything works under the hood.

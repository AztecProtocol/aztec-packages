---
title: "End-to-End Testing with TypeScript"
description: "Learn how to write comprehensive end-to-end tests for your Aztec smart contracts using TypeScript, including test setup, wallet management, contract deployment, and testing both private and public functions"
tags: [contracts, testing, typescript, e2e, development]
source: "developers/docs/guides/aztec-js/how_to_test.md"
---

## Testing Your Privacy-Preserving Contracts

Welcome to one of the most important skills in Aztec development - testing! If you've written tests for traditional smart contracts, you'll find Aztec testing familiar yet more powerful. You're not just testing logic anymore; you're testing privacy guarantees, note management, and the complex choreography between private and public execution.

Think of testing as your safety net. With Aztec's privacy features, it's harder to debug issues in production (you can't just inspect the blockchain!), so comprehensive testing becomes even more critical. The good news? Aztec makes testing straightforward with excellent TypeScript tooling.

## What You'll Learn

By the end of this section, you'll understand:

- **Test environment setup** - Configuring the Aztec sandbox for automated testing
- **Account management** - Creating and managing test wallets programmatically
- **Contract deployment** - Deploying contracts within your test suite
- **Testing private functions** - Verifying private execution and note handling
- **Testing public functions** - Checking public state changes and interactions
- **Hybrid testing** - Testing the private → public execution flow
- **Best practices** - Organizing tests, handling async operations, and debugging failures

## Why Testing Matters in Aztec

Testing privacy-preserving smart contracts has unique challenges:

**Privacy makes debugging harder:**
- You can't just look at the blockchain to see what went wrong
- Private state is encrypted and not directly observable
- Notes can be accidentally "lost" if not tracked properly

**Complexity requires confidence:**
- Private → public execution flow must work correctly
- Note creation and nullification must be tracked accurately
- Authorization checks need verification in private contexts

**Testing gives you:**
- ✅ Confidence your privacy guarantees actually work
- ✅ Early detection of note management issues
- ✅ Verification that access controls function correctly
- ✅ Assurance that private and public state stay in sync

Let's dive in!

---

#include_code how_to_test /docs/docs/developers/docs/guides/aztec-js/how_to_test.md raw

---

## Key Takeaways

Let's summarize what you've learned about testing Aztec contracts:

### Essential Testing Patterns

**Setup Pattern:**
```typescript
// 1. Start with sandbox and PXE client
const pxe = await createPXEClient(PXE_URL);

// 2. Get or create test wallets
const wallets = await getInitialTestAccountsWallets(pxe);

// 3. Deploy your contract
const contract = await MyContract.deploy(wallets[0], ...args)
  .send({ from: wallets[0].getAddress() })
  .deployed();
```

**Testing Private Functions:**
```typescript
// Send transaction (creates notes, generates proofs)
await contract.methods.private_function(args)
  .send({ from: sender.getAddress() })
  .wait();

// Query result using utility function
const result = await contract.methods.balance_of_private(owner)
  .simulate({ from: sender.getAddress() });

expect(result).toBe(expectedValue);
```

**Testing Public Functions:**
```typescript
// Send transaction (public execution on sequencer)
await contract.methods.public_function(args)
  .send({ from: sender.getAddress() })
  .wait();

// Query using view function (no transaction needed)
const result = await contract.methods.get_public_value()
  .simulate({ from: sender.getAddress() });

expect(result).toBe(expectedValue);
```

**Testing Private → Public Flow:**
```typescript
// Private function that enqueues public call
await contract.methods.private_to_public(value)
  .send({ from: sender.getAddress() })
  .wait();

// Verify both private and public effects
const privateResult = await contract.methods.get_private_state()
  .simulate({ from: sender.getAddress() });
const publicResult = await contract.methods.get_public_state()
  .simulate({ from: sender.getAddress() });

expect(privateResult).toBe(expectedPrivate);
expect(publicResult).toBe(expectedPublic);
```

### Common Testing Scenarios

**Multi-User Interactions:**
```typescript
// User A creates private notes
await contract.methods.mint_private(userA.getAddress(), 100)
  .send({ from: admin.getAddress() })
  .wait();

// User A transfers to User B
await contract.methods.transfer(userB.getAddress(), 50)
  .send({ from: userA.getAddress() })
  .wait();

// Verify both balances
const balanceA = await contract.methods.balance_of_private(userA.getAddress())
  .simulate({ from: userA.getAddress() });
const balanceB = await contract.methods.balance_of_private(userB.getAddress())
  .simulate({ from: userB.getAddress() });

expect(balanceA).toBe(50n);
expect(balanceB).toBe(50n);
```

**Access Control Testing:**
```typescript
// Should succeed for authorized user
await expect(
  contract.methods.admin_function()
    .send({ from: admin.getAddress() })
    .wait()
).resolves.toBeDefined();

// Should fail for unauthorized user
await expect(
  contract.methods.admin_function()
    .send({ from: regularUser.getAddress() })
    .wait()
).rejects.toThrow();
```

**Event Testing:**
```typescript
const receipt = await contract.methods.emit_event()
  .send({ from: sender.getAddress() })
  .wait();

// Check emitted events
expect(receipt.events).toHaveLength(1);
expect(receipt.events[0].name).toBe('MyEvent');
expect(receipt.events[0].args.value).toBe(expectedValue);
```

### Testing Best Practices

**Organize Your Tests:**
```typescript
describe('MyContract', () => {
  describe('Private Functions', () => {
    it('should mint private notes', async () => { ... });
    it('should transfer privately', async () => { ... });
  });

  describe('Public Functions', () => {
    it('should update public state', async () => { ... });
    it('should enforce access control', async () => { ... });
  });

  describe('Hybrid Flows', () => {
    it('should handle private-to-public correctly', async () => { ... });
  });
});
```

**Use Descriptive Test Names:**
- ✅ `it('should allow owner to mint tokens to any address')`
- ✅ `it('should reject transfers with insufficient balance')`
- ❌ `it('test transfer')`
- ❌ `it('works')`

**Test Edge Cases:**
- Zero amounts
- Maximum values
- Unauthorized access
- Double-spending attempts
- State consistency across private/public

**Keep Tests Isolated:**
- Each test should be independent
- Don't rely on state from previous tests
- Deploy fresh contracts or reset state between tests
- Use separate wallets when testing multi-user scenarios

### Debugging Failed Tests

**Check Transaction Receipts:**
```typescript
const receipt = await tx.wait();
console.log('Status:', receipt.status);
console.log('Block:', receipt.blockNumber);
console.log('Events:', receipt.events);
```

**Use Simulation for Debugging:**
```typescript
// Simulate before sending to catch errors early
const result = await contract.methods.my_function(args)
  .simulate({ from: sender.getAddress() });
console.log('Simulation result:', result);
```

**Common Issues:**
- **"Note not found"** - Note wasn't created or PXE didn't see it
- **"Insufficient balance"** - Check note values and ownership
- **"Transaction reverted"** - Check assertions and access controls
- **"Context mismatch"** - Verify you're using the right wallet/sender

## What's Next?

Congratulations! You now know how to write comprehensive tests for Aztec contracts. This is a crucial skill that will save you countless hours of debugging and give you confidence in your contracts' correctness.

**Next Steps:**
- **Deploy to Testnet** - Take your tested contracts live (Module 7)
- **Build Full-Stack Apps** - Integrate contracts with frontends (Module 6)
- **Optimize Performance** - Learn efficiency techniques (this module's next lesson)

**Remember:** Good tests are your best friend in Aztec development. The time you invest in testing will pay dividends when your contract is handling real value and real users' privacy.

---

**Ready to optimize?** Continue to [Writing Efficient Contracts](./8_writing_efficient_contracts.md) to learn how to minimize gas costs and proving times.

---
title: Deploying Contracts
sidebar_position: 7
source: "developers/docs/guides/aztec-js/how_to_deploy_contract.md"
---

## Bringing Your Contracts to Life

You've written your contract, tested it thoroughly, and optimized it for performance. Now comes the exciting moment - deploying it to Aztec! This is where your code transforms from a local experiment into a live application that users can actually interact with.

Deploying on Aztec is similar to other blockchains but with some privacy-specific considerations. Let's walk through everything you need to know!

## What You'll Learn

By the end of this guide, you'll understand:

- **How deployment works** - The mechanics of getting your contract onchain
- **Deployment options** - Different ways to deploy (CLI vs programmatic)
- **Contract initialization** - Setting up initial state correctly
- **Deployment costs** - Understanding what you're paying for
- **Verification** - Confirming your deployment succeeded
- **Best practices** - Tips for smooth, secure deployments

## Prerequisites

Before deploying, make sure you have:

- ✅ A compiled contract (`.json` artifact)
- ✅ A wallet with funds for deployment fees
- ✅ Access to a network (Sandbox, Testnet, or Mainnet)
- ✅ Your contract's constructor parameters ready

:::info Development Note
The Aztec wallet interface is currently being refactored to improve the developer experience. The patterns shown here reflect the current deployment workflow, but expect improvements in future releases that will make deployment even simpler!
:::

---

#include_code deploy_contracts /docs/docs/developers/docs/guides/aztec-js/how_to_deploy_contract.md raw

---

## Key Concepts for Aztec Deployment

### Contract Artifacts

When you compile your Noir contract, it generates a JSON artifact containing:

- **Bytecode** - The compiled contract code
- **ABI** - Interface definition for calling functions
- **Verification keys** - Cryptographic keys for proof verification
- **Contract metadata** - Name, version, and other info

When you deploy a contract, you deploy the contract class, including the bytecode and commitments to the verification keys and other metadata, it it has not already been deployed.

### Deployment Transaction

Deploying a contract is itself a transaction that:

1. **Publishes the contract class** - Makes the contract code available
2. **Creates a contract instance** - Instantiates a specific copy
3. **Runs the constructor** - Initializes contract state
4. **Registers with the PXE** - Enables your wallet to interact with it

### Deployment Costs

You'll pay fees for:

- **L2 execution gas** - Running the constructor and deployment logic
- **L1 calldata** - Publishing the contract class (one-time per unique contract)
- **Note creation** - If your constructor creates private notes and posts them to the data availability layer
- **Public storage** - If your constructor writes public state

**Pro Tip:** If deploying the same contract multiple times (e.g., different tokens), you only pay the high L1 cost once for the contract class. Subsequent instances are much cheaper!

### Public vs Private Deployment

The deployment transaction itself can be public or private (it creates a contract on the network), but you can:

- Use a private function to trigger deployment
- Keep constructor parameters private (encrypted)
- Initialize private state during deployment

## Common Deployment Patterns

### Pattern 1: Simple Deployment

```typescript
// Deploy with basic parameters
const contract = await MyContract.deploy(wallet, initialSupply, admin)
  .send({ from: wallet.getAddress() })
  .deployed();

console.log(`Contract deployed at ${contract.address}`);
```

### Pattern 2: Deployment with Salt

```typescript
// Deploy with specific address (deterministic deployment)
const salt = Fr.random(); // or a specific value

const contract = await MyContract.deploy(wallet, ...args)
  .send({ from: wallet.getAddress(), salt })
  .deployed();
```

### Pattern 3: Pre-Deploy Calculation

```typescript
// Calculate address before deploying
const deployment = MyContract.deploy(wallet, ...args);
const address = deployment.getInstance().address;

console.log(`Will deploy to: ${address}`);

// Deploy later
const contract = await deployment
  .send({ from: wallet.getAddress() })
  .deployed();
```

### Pattern 4: Batch Deployment

```typescript
// Deploy multiple contracts in one transaction
const deployments = await Promise.all([
  Token.deploy(wallet, "Token A", "TKA").send(),
  Token.deploy(wallet, "Token B", "TKB").send(),
  Token.deploy(wallet, "Token C", "TKC").send(),
]);

const contracts = await Promise.all(deployments.map((d) => d.deployed()));
```

## Deployment Checklist

Before deploying to production:

### Pre-Deployment

- [ ] Contract is fully tested (unit + integration + e2e)
- [ ] Code is audited (for production)
- [ ] Constructor parameters are correct
- [ ] You have sufficient funds for deployment
- [ ] You've tested deployment on Sandbox/Testnet first

### During Deployment

- [ ] Save the transaction hash
- [ ] Save the contract address
- [ ] Save the deployment salt (if using)
- [ ] Wait for transaction confirmation
- [ ] Verify the contract deployed correctly

### Post-Deployment

- [ ] Test basic contract functionality
- [ ] Verify constructor state was set correctly
- [ ] Document the deployment (address, network, date)
- [ ] Update your frontend/application configuration
- [ ] Monitor the contract for any issues

## Troubleshooting Deployment Issues

**"Insufficient funds for deployment"**

- Check your wallet balance
- Deployment can be expensive, especially for large contracts
- Consider deploying to testnet first to estimate costs

**"Constructor reverted"**

- Check your constructor logic for assertions
- Verify all constructor parameters are valid
- Test constructor in isolation

**"Contract already deployed at this address"**

- You may have deployed with the same salt before
- Use a different salt for a new instance
- Or verify if you meant to reuse the existing instance

**"PXE doesn't recognize the contract"**

- Make sure the contract artifact is registered with your PXE
- Try calling `.register()` on the contract instance
- Check that your PXE is connected to the correct network

## Best Practices

**For Development:**

- Deploy to Sandbox first - it's fast and free!
- Use console logs to track deployment progress
- Save deployment info to a file for reference
- Test the deployed contract immediately

**For Production:**

- Use deterministic deployment (with salt) for predictable addresses
- Deploy to testnet first and test thoroughly
- Have a rollback plan (though contracts are immutable!)
- Monitor gas prices and deploy during low-traffic periods
- Keep private keys secure (use hardware wallets for mainnet)

**For Upgradeability:**

- Aztec contracts are immutable by default
- Plan your architecture with upgradeability in mind (proxy patterns)
- Document upgrade procedures if using proxies
- Test upgrades thoroughly on testnet

## What's Next?

Congratulations! Your contract is now live on Aztec. Here's what you can do next:

**Immediate Next Steps:**

1. **Verify deployment** - Call a view function to confirm it works
2. **Test interactions** - Try the main user flows
3. **Update your app** - Configure your frontend with the contract address

**Building Forward:**

- **Integrate with UI** - Connect your deployed contract to a web app (Module 6)
- **Monitor usage** - Track transactions and user interactions
- **Gather feedback** - See how users interact with your privacy features

**Going to Production:**

- **Security audit** - Have experts review your code
- **Testnet validation** - Extended testing with real users
- **Mainnet launch** - Deploy to production when ready

### Additional Resources

- [Testnet Deployment Guide](../7_testnet_and_aztec_starter.md) - Deploying to public networks

---

**Ready for full-stack development?** Check out Module 6 to learn how to build web applications that interact with your deployed contracts!

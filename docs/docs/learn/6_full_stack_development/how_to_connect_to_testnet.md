---
title: "Connecting to Testnet"
description: "Learn how to connect your Aztec application to the live testnet for real-world testing and deployment"
tags: [testnet, deployment, network, full-stack]
---

Once you've built and tested your application locally with the sandbox, the next step is connecting to the Aztec testnet. The testnet provides a production-like environment where you can test your contracts with real network conditions before deploying to mainnet.

## What You'll Learn

By the end of this section, you'll understand:

- How to configure your application to connect to testnet
- The differences between sandbox and testnet development
- How to get testnet tokens for fees
- How to deploy contracts to testnet
- Best practices for testnet development

## Why Use the Testnet?

The testnet serves several important purposes:

- **Real Network Conditions**: Test with actual network latency, sequencer selection, and proving times
- **Multi-User Testing**: Interact with contracts deployed by other developers
- **Integration Testing**: Verify your application works with live infrastructure
- **Public Demos**: Share your application with others without needing local setup
- **Pre-Mainnet Validation**: Final verification before mainnet deployment

## Testnet vs Sandbox

Understanding the differences helps you develop more effectively:

| Aspect | Sandbox | Testnet |
|--------|---------|---------|
| **Environment** | Local Docker container | Live network on Ethereum Sepolia |
| **Speed** | Instant blocks | ~12 second block times |
| **Fees** | Free (dev mode) | Requires testnet FeeJuice tokens |
| **State** | Reset when restarted | Persistent across sessions |
| **Accounts** | Pre-funded dev accounts | Must create and fund manually |
| **Network** | Isolated | Shared with other developers |
| **Proving** | Optional | Full proving required |

## Configuration Changes

To connect to testnet instead of sandbox, you'll need to update your PXE connection URL:

```typescript
// Sandbox (local development)
const pxe = await createPXEClient('http://localhost:8080');

// Testnet (live network)
const pxe = await createPXEClient('https://api.aztec.network/testnet');
```

Check the [testnet guide](../../try_testnet.md) for the current testnet RPC endpoint, as it may change with network updates.

## Getting Testnet Tokens

Unlike the sandbox where accounts come pre-funded, testnet requires you to acquire FeeJuice tokens for transaction fees:

1. **Get Sepolia ETH**: Obtain testnet ETH from a Sepolia faucet
2. **Bridge to Aztec**: Use the testnet portal to bridge ETH to Aztec testnet
3. **Convert to FeeJuice**: Swap your bridged ETH for FeeJuice tokens

Detailed instructions are available in the [testnet guide](../../try_testnet.md).

## Deployment Workflow

The workflow for deploying to testnet follows these steps:

1. **Develop Locally**: Build and test thoroughly in the sandbox
2. **Update Configuration**: Change network endpoints to testnet
3. **Create Accounts**: Generate and fund testnet accounts
4. **Deploy Contracts**: Deploy your contracts to testnet
5. **Test Thoroughly**: Verify all functionality works as expected
6. **Share and Iterate**: Get feedback and make improvements

## Best Practices

When working with testnet, keep these practices in mind:

### Start with Sandbox

Always develop and test in the sandbox first. Testnet transactions take time and cost tokens - use it for integration testing, not initial development.

### Save Your Keys

Unlike sandbox accounts that reset, testnet accounts are persistent. Save your account keys securely - losing them means losing access to your testnet funds.

### Monitor Network Status

The testnet is actively developed and may experience downtime or resets. Check the Aztec Discord for network status and announcements.

### Plan for Proving Time

Full zero-knowledge proofs take time to generate on testnet. Design your UX to handle longer confirmation times compared to the instant sandbox experience.

### Use Version Pinning

Pin your Aztec.js and contract versions to ensure compatibility. The testnet may not always be on the latest version.

### Test Fee Payment

Ensure your fee payment logic works correctly. Unlike the sandbox's free transactions, testnet requires proper fee handling for all transactions.

## Common Issues

### Connection Timeouts

**Issue**: Application can't connect to testnet PXE
**Solution**: Verify the RPC endpoint URL and check network status in Discord

### Insufficient Fees

**Issue**: Transactions fail due to insufficient FeeJuice
**Solution**: Ensure your account has enough FeeJuice tokens for fees

### Contract Deployment Failures

**Issue**: Contract deployment times out or fails
**Solution**: Check that your account has sufficient fees and that the contract compiles correctly

### Account Not Found

**Issue**: Application can't find the account after creation
**Solution**: Wait for the account deployment transaction to be confirmed on L1

## Next Steps

For comprehensive testnet information and resources, see:

- [Testnet Guide](../../try_testnet.md) - Complete guide to using the Aztec testnet
- [Aztec Starter](../../7_testnet_and_aztec_starter.md) - Example deployments and patterns
- [Getting Started on Testnet](../../developers/getting_started_on_testnet.md) - Step-by-step deployment walkthrough

Once you're comfortable with testnet deployment, you'll be ready to take your application to mainnet when it launches!

## Community Resources

- **Discord**: Join #testnet-support for help and updates
- **Status Page**: Check current testnet status and scheduled maintenance
- **Faucet**: Get testnet tokens for development
- **Explorer**: View transactions and contracts on testnet

Remember, the testnet is a learning environment. Don't be afraid to experiment, break things, and iterate. That's exactly what it's for!

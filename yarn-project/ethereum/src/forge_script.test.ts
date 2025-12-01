import { type Logger, createLogger } from '@aztec/foundation/log';

import { runForgeScript, setupL1ContractsViaForge } from './forge_script.js';
import { startAnvil } from './test/start_anvil.js';

describe('forge_script', () => {
  const privateKeyHex: `0x${string}` = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  let logger: Logger;

  let rpcUrl: string;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:forge_script');

    // Start anvil with prague hardfork (matching foundry.toml's evm_version)
    ({ stop, rpcUrl } = await startAnvil({ port: 8546, hardfork: 'prague' }));
    logger.info(`Anvil started at ${rpcUrl}`);
  }, 30000);

  afterAll(async () => {
    if (stop) {
      try {
        await stop();
      } catch (err) {
        createLogger('ethereum:cleanup').error(`Error during cleanup`, err);
      }
    }
  });

  it('runForgeScript returns proper result structure on error', async () => {
    // Run forge with an invalid script path to test error handling
    const result = await runForgeScript(['script', 'script/nonexistent.sol:NonExistent', '--rpc-url', rpcUrl], {
      logger,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  // To test manually with anvil:
  // 1. Start anvil: anvil --port 8546 --hardfork prague
  // 2. Run forge: forge script script/deploy/rollup/DeployL1Contracts.s.sol:DeployL1Contracts \
  //    --sig "run()" --rpc-url http://127.0.0.1:8546 \
  //    --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast -vvv
  it('setupL1ContractsViaForge deploys and returns complete L1ContractAddresses', async () => {
    const result = await setupL1ContractsViaForge(rpcUrl, privateKeyHex, {
      logger,
    });

    logger.info('setupL1ContractsViaForge result:', {
      rollupAddress: result.l1ContractAddresses.rollupAddress.toString(),
      registryAddress: result.l1ContractAddresses.registryAddress.toString(),
      inboxAddress: result.l1ContractAddresses.inboxAddress.toString(),
      outboxAddress: result.l1ContractAddresses.outboxAddress.toString(),
      feeJuicePortalAddress: result.l1ContractAddresses.feeJuicePortalAddress.toString(),
      rollupVersion: result.rollupVersion,
    });

    // Verify all required addresses are present
    expect(result.l1ContractAddresses.rollupAddress).toBeDefined();
    expect(result.l1ContractAddresses.registryAddress).toBeDefined();
    expect(result.l1ContractAddresses.inboxAddress).toBeDefined();
    expect(result.l1ContractAddresses.outboxAddress).toBeDefined();
    expect(result.l1ContractAddresses.feeJuiceAddress).toBeDefined();
    expect(result.l1ContractAddresses.feeJuicePortalAddress).toBeDefined();
    expect(result.l1ContractAddresses.coinIssuerAddress).toBeDefined();
    expect(result.l1ContractAddresses.rewardDistributorAddress).toBeDefined();
    expect(result.l1ContractAddresses.governanceProposerAddress).toBeDefined();
    expect(result.l1ContractAddresses.governanceAddress).toBeDefined();
    expect(result.l1ContractAddresses.stakingAssetAddress).toBeDefined();
    expect(result.l1ContractAddresses.feeAssetHandlerAddress).toBeDefined();

    // Verify l1Client is present
    expect(result.l1Client).toBeDefined();

    // Verify rollupVersion is a number
    expect(typeof result.rollupVersion).toBe('number');

    // Verify addresses are not zero addresses
    expect(result.l1ContractAddresses.rollupAddress.toString()).not.toBe('0x0000000000000000000000000000000000000000');
    expect(result.l1ContractAddresses.inboxAddress.toString()).not.toBe('0x0000000000000000000000000000000000000000');
  }, 300000); // 5 minutes
});

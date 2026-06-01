/**
 * Re-exports from the unified setup module for backward compatibility.
 * Tests that previously used utils.ts should continue to work.
 */
export {
  type BalancesFn,
  type EndToEndContext,
  type SetupOptions,
  createAndSyncProverNode,
  deployAccounts,
  ensureAccountContractsPublished,
  ensureAuthRegistryPublished,
  ensurePublicChecksPublished,
  expectMapping,
  expectMappingDelta,
  getBalancesFn,
  getLogger,
  getPrivateKeyFromIndex,
  getSponsoredFPCAddress,
  getSponsoredFPCInstance,
  publicDeployAccounts,
  registerSponsoredFPC,
  setup,
  setupPXEAndGetWallet,
  setupSharedBlobStorage,
  setupSponsoredFPC,
  startAnvil,
  teardown,
  waitForProvenChain,
} from './setup.js';

export { deployAndInitializeTokenAndBridgeContracts } from '../shared/cross_chain_test_harness.js';

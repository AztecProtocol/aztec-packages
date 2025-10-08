import { getPublicClient } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { InboxAbi } from '@aztec/l1-artifacts/InboxAbi';

import type { Anvil } from '@viem/anvil';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { deployL1Contracts } from '../deploy_l1_contracts.js';
import type { ViemClient } from '../types.js';
import { EthCheatCodes } from './eth_cheat_codes.js';
import { RollupCheatCodes } from './rollup_cheat_codes.js';
import { startAnvil } from './start_anvil.js';

describe('RollupCheatCodes', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;
  let publicClient: ViemClient;
  let cheatCodes: EthCheatCodes;
  let rollupCheatCodes: RollupCheatCodes;

  let vkTreeRoot: Fr;
  let protocolContractsHash: Fr;
  let deployedL1Contracts: Awaited<ReturnType<typeof deployL1Contracts>>;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:rollup_cheat_codes');
    // this is the 6th address that gets funded by the junk mnemonic
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractsHash = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });
    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());

    deployedL1Contracts = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: undefined,
      vkTreeRoot,
      protocolContractsHash,
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });

    rollupCheatCodes = RollupCheatCodes.create([rpcUrl], deployedL1Contracts.l1ContractAddresses, new DateProvider());
  });

  afterAll(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error(err));
  });

  describe('advanceInboxInProgress', () => {
    it('should advance the inbox inProgress field correctly', async () => {
      const inboxAddress = deployedL1Contracts.l1ContractAddresses.inboxAddress.toString();

      // Read initial state directly from contract
      const initialState = await publicClient.readContract({
        address: inboxAddress as `0x${string}`,
        abi: InboxAbi,
        functionName: 'getState',
      });

      const initialInProgress = initialState.inProgress;
      const initialRollingHash = initialState.rollingHash;
      const initialTotalMessagesInserted = initialState.totalMessagesInserted;

      // Advance the inbox inProgress by a large amount
      const advanceBy = 1000n;
      const newInProgress = await rollupCheatCodes.advanceInboxInProgress(advanceBy);

      // Read state after advancement
      const finalState = await publicClient.readContract({
        address: inboxAddress as `0x${string}`,
        abi: InboxAbi,
        functionName: 'getState',
      });

      const finalInProgress = finalState.inProgress;
      const finalRollingHash = finalState.rollingHash;
      const finalTotalMessagesInserted = finalState.totalMessagesInserted;

      // Check that the advancement worked
      expect(newInProgress).toBe(initialInProgress + advanceBy);
      expect(finalInProgress).toBe(initialInProgress + advanceBy);

      // Check that all other fields remain unchanged
      expect(finalRollingHash).toBe(initialRollingHash);
      expect(finalTotalMessagesInserted).toBe(initialTotalMessagesInserted);
    });
  });
});

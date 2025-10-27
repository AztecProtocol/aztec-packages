import { GSEContract, getPublicClient } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';

import type { Anvil } from '@viem/anvil';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { deployL1Contracts } from '../deploy_l1_contracts.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ViemClient } from '../types.js';

describe('Governance', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;
  let publicClient: ViemClient;

  let vkTreeRoot: Fr;
  let protocolContractsHash: Fr;
  let gseAddress: `0x${string}`;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:governance');
    // this is the 6th address that gets funded by the junk mnemonic
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractsHash = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });

    const deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: undefined,
      vkTreeRoot,
      protocolContractsHash,
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });

    gseAddress = deployed.l1ContractAddresses.gseAddress!.toString() as `0x${string}`;
  });

  afterAll(async () => {
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  });

  describe('ReadOnlyGovernanceContract', () => {
    let gse: GSEContract;

    beforeEach(() => {
      gse = new GSEContract(publicClient, gseAddress);
    });

    it('can generate a registration tuple', async () => {
      const bn254SecretKey = Fr.random().toBigInt();
      const registrationTuple = await gse.makeRegistrationTuple(bn254SecretKey);
      expect(registrationTuple).toBeDefined();
      expect(registrationTuple.publicKeyInG1).toBeDefined();
      expect(registrationTuple.publicKeyInG2).toBeDefined();
      expect(registrationTuple.proofOfPossession).toBeDefined();

      // Use this to make random proofs of possession
      // console.log(bn254SecretKey);
      // console.log(registrationTuple);
    });
  });
});

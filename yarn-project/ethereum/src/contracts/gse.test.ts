import { getPublicClient } from '@aztec/ethereum/client';
import { GSEContract } from '@aztec/ethereum/contracts';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';

import type { Anvil } from '@viem/anvil';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { deployAztecL1Contracts } from '../deploy_aztec_l1_contracts.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ViemClient } from '../types.js';

const logger = createLogger('ethereum:test:gse');

describe('Governance', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let publicClient: ViemClient;

  let vkTreeRoot: Fr;
  let protocolContractsHash: Fr;
  let gseAddress: `0x${string}`;

  beforeAll(async () => {
    // this is the 6th address that gets funded by the junk mnemonic
    const privateKeyRaw = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
    vkTreeRoot = Fr.random();
    protocolContractsHash = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil(logger));

    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });

    const deployed = await deployAztecL1Contracts(
      rpcUrl,
      privateKeyRaw,
      foundry.id,
      {
        ...DefaultL1ContractsConfig,
        vkTreeRoot,
        protocolContractsHash,
        genesisArchiveRoot: Fr.random(),
        realVerifier: false,
      },
      logger,
    );

    gseAddress = deployed.l1ContractAddresses.gseAddress!.toString() as `0x${string}`;
  });

  afterAll(async () => {
    await anvil.stop().catch(() => {});
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

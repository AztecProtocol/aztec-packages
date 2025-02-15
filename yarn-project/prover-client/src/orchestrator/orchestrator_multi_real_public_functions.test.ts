import { Tx } from '@aztec/circuit-types';
import { AztecAddress, ContractInstanceWithAddress, DEPLOYER_CONTRACT_ADDRESS, Fr } from '@aztec/circuits.js';
import { siloNullifier } from '@aztec/circuits.js/hash';
import { createLogger } from '@aztec/foundation/log';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { TestEnqueuedCall } from '@aztec/simulator/public/fixtures';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-multi-public-functions');

describe('prover/orchestrator/public-functions', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('blocks with public functions', () => {
    const admin = AztecAddress.fromNumber(42);
    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
    let token: ContractInstanceWithAddress;
    let constructorTx: Tx;

    beforeEach(async () => {
      // use numTransactions to provide some variability in the txs
      token = await context.tester.registerAndDeployContract(
        constructorArgs,
        /*deployer=*/ admin,
        TokenContractArtifact,
        /*skipNullifierInsertion=*/ true,
      );
      // Note: skip nullifier insertion above so it can be performed during the constructor
      // TX (via firstNullifier). We want all tree operations to end up in txEffects.
      const contractAddressNullifier = await siloNullifier(
        AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
        token.address.toField(),
      );

      constructorTx = await context.tester.createTx(
        /*sender=*/ admin,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: token.address,
            fnName: 'constructor',
            args: constructorArgs,
          },
        ],
        /*teardownCall=*/ undefined,
        /*feePayer=*/ AztecAddress.zero(), // none
        /*firstNullifier=*/ contractAddressNullifier, // as if it was deployed during private portion
      );
    });

    it.each([
      [2, 4, 3], // simple-ish
      [4, 16, 16], // max enqueued calls
    ] as const)(
      'builds an L2 block with %i transactions each with %i revertible and %i non revertible',
      async (
        numTransactions: number,
        numberOfNonRevertiblePublicCallRequests: number,
        numberOfRevertiblePublicCallRequests: number,
      ) => {
        const txs = [constructorTx];
        for (let txSeed = 0; txSeed < numTransactions; txSeed++) {
          txs.push(
            await createTx(numberOfNonRevertiblePublicCallRequests, numberOfRevertiblePublicCallRequests, txSeed),
          );
        }
        for (const tx of txs) {
          tx.data.constants.historicalHeader = context.getBlockHeader(0);
          tx.data.constants.vkTreeRoot = getVKTreeRoot();
          tx.data.constants.protocolContractTreeRoot = protocolContractTreeRoot;
        }

        context.orchestrator.startNewEpoch(1, 1, 1);
        await context.orchestrator.startNewBlock(context.globalVariables, [], context.getPreviousBlockHeader());

        const [processed, failed] = await context.processPublicFunctions(txs, numTransactions);
        expect(processed.length).toBe(numTransactions);
        expect(failed.length).toBe(0);

        await context.orchestrator.addTxs(processed);

        const block = await context.orchestrator.setBlockCompleted(context.blockNumber);
        await context.orchestrator.finaliseEpoch();

        expect(block.number).toEqual(context.blockNumber);
      },
    );

    function createMintCall(seed: number): TestEnqueuedCall {
      const to = AztecAddress.fromNumber(4200 + seed);
      const amount = BigInt(100 + seed);
      return {
        address: token.address,
        fnName: 'mint_to_public',
        args: [to, amount],
      };
    }

    async function createTx(
      numberOfNonRevertiblePublicCallRequests: number,
      numberOfRevertiblePublicCallRequests: number,
      txSeed: number,
    ): Promise<Tx> {
      const setupCallSeed = (i: number) => i * txSeed;
      const appCallSeed = (i: number) => (i + numberOfNonRevertiblePublicCallRequests) * txSeed;
      //const teardownCallSeed =  (numberOfNonRevertiblePublicCallRequests + numberOfRevertiblePublicCallRequests) * txSeed;

      const setupCalls = Array.from({ length: numberOfNonRevertiblePublicCallRequests }, (_, i) =>
        createMintCall(/*seed=*/ setupCallSeed(i)),
      );
      const appCalls = Array.from({ length: numberOfRevertiblePublicCallRequests }, (_, i) =>
        createMintCall(/*seed=*/ appCallSeed(i)),
      );
      return await context.tester.createTx(
        /*sender=*/ admin,
        /*setupCalls=*/ setupCalls,
        /*appCalls=*/ appCalls,
        // TODO: Teardown breaks!
        ///*teardownCall=*/ createMintCall(/*seed=*/ teardownCallSeed),
      );
    }
  });
});

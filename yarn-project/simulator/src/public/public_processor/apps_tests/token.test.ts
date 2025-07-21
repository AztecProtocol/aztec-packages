import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import { GlobalVariables } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { NativeWorldStateService } from '@aztec/world-state';

import { PublicTxSimulationTester, SimpleContractDataSource } from '../../fixtures/index.js';
import { PublicContractsDB } from '../../public_db_sources.js';
import { PublicTxSimulator } from '../../public_tx_simulator/public_tx_simulator.js';
import { GuardedMerkleTreeOperations } from '../guarded_merkle_tree.js';
import { PublicProcessor } from '../public_processor.js';

describe('Public Processor app tests: TokenContract', () => {
  const logger = createLogger('public-processor-apps-tests-token');

  const NUM_TRANSFERS = 10;
  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);

  let token: ContractInstanceWithAddress;
  let contractsDB: PublicContractsDB;
  let tester: PublicTxSimulationTester;
  let processor: PublicProcessor;

  beforeEach(async () => {
    const globals = GlobalVariables.empty();
    // apply some nonzero default gas fees
    globals.gasFees = new GasFees(2, 3);

    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
    const guardedMerkleTrees = new GuardedMerkleTreeOperations(merkleTrees);
    contractsDB = new PublicContractsDB(contractDataSource);
    const simulator = new PublicTxSimulator(guardedMerkleTrees, contractsDB, globals, /*doMerkleOperations=*/ true);

    processor = new PublicProcessor(
      globals,
      guardedMerkleTrees,
      contractsDB,
      simulator,
      new TestDateProvider(),
      getTelemetryClient(),
    );

    tester = new PublicTxSimulationTester(merkleTrees, contractDataSource, globals);

    // make sure tx senders have fee balance
    await tester.setFeePayerBalance(admin);
    await tester.setFeePayerBalance(sender);
  });

  it('token constructor, mint, many transfers', async () => {
    const startTime = performance.now();

    const mintAmount = 1_000_000n;
    const transferAmount = 10n;
    const authwitNonce = new Fr(0);

    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];

    token = await tester.registerAndDeployContract(constructorArgs, /*deployer=*/ admin, TokenContractArtifact);
    const constructorTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'constructor',
          args: constructorArgs,
        },
      ],
    );

    const mintTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'mint_to_public',
          args: [/*to=*/ sender, mintAmount],
        },
      ],
    );

    const transferTxs = [];
    for (let i = 0; i < NUM_TRANSFERS; i++) {
      const receiver = AztecAddress.fromNumber(200 + i); // different receiver each time
      transferTxs.push(
        await tester.createTx(
          /*sender=*/ sender,
          /*setupCalls=*/ [],
          /*appCalls=*/ [
            {
              address: token.address,
              fnName: 'transfer_in_public',
              args: [/*from=*/ sender, /*to=*/ receiver, transferAmount, authwitNonce],
            },
          ],
        ),
      );
    }

    const results = await processor.process([constructorTx, mintTx, ...transferTxs]);
    const processedTxs = results[0];
    const failedTxs = results[1];
    expect(processedTxs.length).toBe(NUM_TRANSFERS + 2); // constructor, mint, transfers
    expect(failedTxs.length).toBe(0);

    const endTime = performance.now();
    logger.verbose(`TokenContract public processor test took ${endTime - startTime}ms\n`);
  });
});

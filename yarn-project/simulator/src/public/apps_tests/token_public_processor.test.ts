import { RevertCode } from '@aztec/circuits.js/avm';
import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/circuits.js/contract';
import { GasFees } from '@aztec/circuits.js/gas';
import { GlobalVariables } from '@aztec/circuits.js/tx';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { NativeWorldStateService } from '@aztec/world-state';

import { createContractClassAndInstance } from '../../avm/fixtures/index.js';
import { PublicTxSimulationTester, SimpleContractDataSource } from '../../server.js';
import { addNewContractClassToTx, addNewContractInstanceToTx } from '../fixtures/utils.js';
import { WorldStateDB } from '../public_db_sources.js';
import { PublicProcessor } from '../public_processor.js';
import { PublicTxSimulator } from '../public_tx_simulator.js';

describe('Public Processor app tests: TokenContract', () => {
  const logger = createLogger('public-processor-apps-tests-token');

  const NUM_TRANSFERS = 10;
  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);

  let token: ContractInstanceWithAddress;
  let worldStateDB: WorldStateDB;
  let tester: PublicTxSimulationTester;
  let processor: PublicProcessor;

  beforeEach(async () => {
    const globals = GlobalVariables.empty();
    // apply some nonzero default gas fees
    globals.gasFees = new GasFees(2, 3);

    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
    worldStateDB = new WorldStateDB(merkleTrees, contractDataSource);
    const simulator = new PublicTxSimulator(merkleTrees, worldStateDB, globals, /*doMerkleOperations=*/ true);

    processor = new PublicProcessor(
      merkleTrees,
      globals,
      worldStateDB,
      simulator,
      new TestDateProvider(),
      getTelemetryClient(),
    );

    tester = new PublicTxSimulationTester(worldStateDB, contractDataSource, merkleTrees);

    // make sure tx senders have fee balance
    await tester.setFeePayerBalance(admin);
    await tester.setFeePayerBalance(sender);
  });

  it('token constructor, mint, many transfers', async () => {
    const startTime = performance.now();

    const mintAmount = 1_000_000n;
    const transferAmount = 10n;
    const nonce = new Fr(0);

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
              args: [/*from=*/ sender, /*to=*/ receiver, transferAmount, nonce],
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

  it('new contract cannot get removed from ContractDataSource by a later failing transaction', async () => {
    const mintAmount = 1_000_000n;
    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];

    const { contractClass, contractInstance } = await createContractClassAndInstance(
      constructorArgs,
      admin,
      TokenContractArtifact,
    );
    const token = contractInstance;

    // another token instance, same contract class
    const otherAdmin = AztecAddress.fromNumber(43);
    const anotherToken = await tester.registerAndDeployContract(
      constructorArgs,
      /*deployer=*/ otherAdmin,
      TokenContractArtifact,
    );

    // First transaction - deploys and initializes first token contract
    const passingConstructorTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'constructor',
          args: constructorArgs,
          contractArtifact: TokenContractArtifact,
        },
      ],
    );
    addNewContractClassToTx(passingConstructorTx, contractClass);
    await addNewContractInstanceToTx(passingConstructorTx, contractInstance);

    // NOTE: we need to include the contract artifact for each enqueued call, otherwise the tester
    // will not know how to construct the TX since we are intentionally not adding the contract to
    // the contract data source.

    // Second transaction - deploys second token but fails during transfer
    const receiver = AztecAddress.fromNumber(222);
    const transferAmount = 10n;
    const nonce = new Fr(0);
    const failingConstructorTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: anotherToken.address,
          fnName: 'constructor',
          args: constructorArgs,
          contractArtifact: TokenContractArtifact,
        },
        // The next enqueued call will fail because sender has no tokens to transfer
        {
          address: anotherToken.address,
          fnName: 'transfer_in_public',
          args: [/*from=*/ sender, /*to=*/ receiver, transferAmount, nonce],
          contractArtifact: TokenContractArtifact,
        },
      ],
    );
    addNewContractClassToTx(failingConstructorTx, contractClass, /*skipNullifierInsertion=*/ true);
    await addNewContractInstanceToTx(failingConstructorTx, contractInstance, /*skipNullifierInsertion=*/ true);

    // Third transaction - verifies first token is still accessible by minting
    const mintTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'mint_to_public',
          args: [/*to=*/ sender, mintAmount],
          contractArtifact: TokenContractArtifact,
        },
      ],
    );

    const results = await processor.process([passingConstructorTx, failingConstructorTx, mintTx]);
    //const results = await processor.process([passingConstructorTx]);
    const processedTxs = results[0];
    const failedTxs = results[1];
    expect(processedTxs.length).toBe(3);
    expect(failedTxs.length).toBe(0);

    // First tx should succeed (constructor)
    expect(processedTxs[0].revertCode).toEqual(RevertCode.OK);

    // Second tx should revert in app logic (failed transfer)
    expect(processedTxs[1].revertCode).toEqual(RevertCode.APP_LOGIC_REVERTED);

    // Third tx should succeed (mint), proving first contract is still accessible
    expect(processedTxs[2].revertCode).toEqual(RevertCode.OK);
  });
});

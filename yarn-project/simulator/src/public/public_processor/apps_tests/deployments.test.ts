import { Fr } from '@aztec/foundation/fields';
import { TestDateProvider } from '@aztec/foundation/timer';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import { GlobalVariables } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { NativeWorldStateService } from '@aztec/world-state';

import { PublicContractsDB } from '../../../server.js';
import { createContractClassAndInstance } from '../../avm/fixtures/utils.js';
import { PublicTxSimulationTester, SimpleContractDataSource } from '../../fixtures/index.js';
import { addNewContractClassToTx, addNewContractInstanceToTx, createTxForPrivateOnly } from '../../fixtures/utils.js';
import { PublicTxSimulator } from '../../public_tx_simulator/public_tx_simulator.js';
import { GuardedMerkleTreeOperations } from '../guarded_merkle_tree.js';
import { PublicProcessor } from '../public_processor.js';

describe('Public processor contract registration/deployment tests', () => {
  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);

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

    tester = new PublicTxSimulationTester(merkleTrees, contractDataSource);

    // make sure tx senders have fee balance
    await tester.setFeePayerBalance(admin);
    await tester.setFeePayerBalance(sender);
  });

  it('can deploy in a private-only tx and call a public function later in the block', async () => {
    const { contractClass, contractInstance } = await createContractClassAndInstance(
      /*constructorArgs=*/ [],
      admin,
      AvmTestContractArtifact,
    );

    // First transaction - deploys and initializes first token contract
    const deployTx = createTxForPrivateOnly(/*feePayer=*/ admin);
    await addNewContractClassToTx(deployTx, contractClass);
    await addNewContractInstanceToTx(deployTx, contractInstance);

    // NOTE: we need to include the contract artifact for each enqueued call, otherwise the tester
    // will not know how to construct the TX since we are intentionally not adding the contract to
    // the contract data source.

    // Second transaction - makes a simple public call on the deployed contract
    const simplePublicTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: contractInstance.address,
          fnName: 'read_storage_single',
          args: [],
          contractArtifact: AvmTestContractArtifact,
        },
      ],
    );

    const results = await processor.process([deployTx, simplePublicTx]);
    const processedTxs = results[0];
    const failedTxs = results[1];
    expect(processedTxs.length).toBe(2);
    expect(failedTxs.length).toBe(0);

    // First tx should succeed (constructor)
    expect(processedTxs[0].revertCode).toEqual(RevertCode.OK);

    // Second tx should succeed (public call)
    expect(processedTxs[1].revertCode).toEqual(RevertCode.OK);
  });

  it('can deploy a contract and call its public function in same tx', async () => {
    const mintAmount = 1_000_000n;
    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
    const { contractClass, contractInstance } = await createContractClassAndInstance(
      constructorArgs,
      admin,
      TokenContractArtifact,
    );
    const token = contractInstance;

    // NOTE: we need to include the contract artifact for each enqueued call, otherwise the tester
    // will not know how to construct the TX since we are intentionally not adding the contract to
    // the contract data source.

    // Deploys a contract and calls its public constructor and another public call in same tx
    const deployAndCallTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'constructor',
          args: constructorArgs,
          contractArtifact: TokenContractArtifact,
        },
        {
          address: token.address,
          fnName: 'mint_to_public',
          args: [/*to=*/ sender, mintAmount],
          contractArtifact: TokenContractArtifact,
        },
      ],
    );
    await addNewContractClassToTx(deployAndCallTx, contractClass);
    await addNewContractInstanceToTx(deployAndCallTx, contractInstance);

    const results = await processor.process([deployAndCallTx]);
    const processedTxs = results[0];
    const failedTxs = results[1];
    expect(processedTxs.length).toBe(1);
    expect(failedTxs.length).toBe(0);

    // First tx should succeed (constructor)
    expect(processedTxs[0].revertCode).toEqual(RevertCode.OK);
  });

  it('new contract cannot get removed from block-level cache by a later failing transaction', async () => {
    const mintAmount = 1_000_000n;
    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];

    const { contractClass, contractInstance } = await createContractClassAndInstance(
      constructorArgs,
      admin,
      TokenContractArtifact,
    );
    const token = contractInstance;

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
    await addNewContractClassToTx(passingConstructorTx, contractClass);
    await addNewContractInstanceToTx(passingConstructorTx, contractInstance);

    // NOTE: we need to include the contract artifact for each enqueued call, otherwise the tester
    // will not know how to construct the TX since we are intentionally not adding the contract to
    // the contract data source.

    // Second transaction - deploys second token but fails during transfer
    const receiver = AztecAddress.fromNumber(222);
    const transferAmount = 10n;
    const authwitNonce = new Fr(0);
    const failingConstructorTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'constructor',
          args: constructorArgs,
          contractArtifact: TokenContractArtifact,
        },
        // The next enqueued call will fail because sender has no tokens to transfer
        {
          address: token.address,
          fnName: 'transfer_in_public',
          args: [/*from=*/ sender, /*to=*/ receiver, transferAmount, authwitNonce],
          contractArtifact: TokenContractArtifact,
        },
      ],
    );
    // FIXME(#12375): should be able to include the nullifier insertions, but at the moment
    // tx simulator cannot recover from errors during revertible private insertions.
    // Once fixed, this skipNullifierInsertion flag can be removed.
    await addNewContractClassToTx(failingConstructorTx, contractClass, /*skipNullifierInsertion=*/ true);
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

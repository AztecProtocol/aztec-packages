import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { PublicSimulatorConfig, RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import { GlobalVariables } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { NativeWorldStateService } from '@aztec/world-state';

import { PublicContractsDB } from '../../../server.js';
import { createContractClassAndInstance } from '../../avm/fixtures/utils.js';
import { CdbIpcServer } from '../../cdb_ipc_server.js';
import { PublicTxSimulationTester, SimpleContractDataSource } from '../../fixtures/index.js';
import { addNewContractClassToTx, addNewContractInstanceToTx, createTxForPrivateOnly } from '../../fixtures/utils.js';
import { type AvmIpcBackend, CppPublicTxSimulator } from '../../public_tx_simulator/cpp_public_tx_simulator.js';
import { IpcVsTsPublicTxSimulator } from '../../public_tx_simulator/ipc_vs_ts_public_tx_simulator.js';
import { GuardedMerkleTreeOperations } from '../guarded_merkle_tree.js';
import { PublicProcessor } from '../public_processor.js';

describe.each([
  { useCppSimulator: false, simulatorName: 'TS Simulator' },
  { useCppSimulator: true, simulatorName: 'Cpp Simulator' },
])('Public processor contract registration/deployment tests ($simulatorName)', ({ useCppSimulator }) => {
  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);

  let worldStateService: NativeWorldStateService;
  let contractsDB: PublicContractsDB;
  let tester: PublicTxSimulationTester;
  let processor: PublicProcessor;
  let avmBackend: AvmIpcBackend | undefined;
  let cdbServer: CdbIpcServer | undefined;

  beforeEach(async () => {
    const globals = GlobalVariables.empty();
    // apply some nonzero default gas fees
    globals.gasFees = new GasFees(2, 3);

    const contractDataSource = new SimpleContractDataSource();
    worldStateService = await NativeWorldStateService.tmp();
    const merkleTrees = await worldStateService.fork();
    const guardedMerkleTrees = new GuardedMerkleTreeOperations(merkleTrees);
    contractsDB = new PublicContractsDB(contractDataSource);
    const config = PublicSimulatorConfig.from({
      skipFeeEnforcement: false,
      collectDebugLogs: true,
      collectHints: false,
      collectStatistics: false,
      collectCallMetadata: true,
    });

    let simulator;
    if (useCppSimulator) {
      // IPC: spawn aztec-avm + CDB server
      const wsdbSocketPath = worldStateService.getSocketPath();
      const { AvmBackend } = await import('@aztec/bb.js/aztec-avm');
      const { findAvmBinary } = await import('@aztec/bb.js/platform');
      const avmBinaryPath = findAvmBinary();
      if (!avmBinaryPath) {
        throw new Error('aztec-avm binary not found');
      }

      cdbServer = new CdbIpcServer();

      avmBackend = new AvmBackend({
        binaryPath: avmBinaryPath,
        wsdbSocketPath,
        cdbSocketPath: cdbServer.socketPath,
      });

      const forkId = merkleTrees.getRevision().forkId;
      cdbServer.registerFork(forkId, contractsDB, globals.timestamp);
      simulator = new CppPublicTxSimulator(avmBackend, globals, config, undefined, forkId);
    } else {
      // TS mode: use IpcVsTs to compare TS and IPC C++ results
      // Both paths need IPC setup since IpcVsTsPublicTxSimulator uses CppPublicTxSimulator internally
      const wsdbSocketPath = worldStateService.getSocketPath();
      const { AvmBackend } = await import('@aztec/bb.js/aztec-avm');
      const { findAvmBinary } = await import('@aztec/bb.js/platform');
      const avmBinaryPath = findAvmBinary();
      if (!avmBinaryPath) {
        throw new Error('aztec-avm binary not found');
      }

      cdbServer = new CdbIpcServer();

      avmBackend = new AvmBackend({
        binaryPath: avmBinaryPath,
        wsdbSocketPath,
        cdbSocketPath: cdbServer.socketPath,
      });

      const forkId = merkleTrees.getRevision().forkId;
      cdbServer.registerFork(forkId, contractsDB, globals.timestamp);
      simulator = new IpcVsTsPublicTxSimulator(
        guardedMerkleTrees,
        contractsDB,
        globals,
        avmBackend,
        config,
        undefined,
        forkId,
      );
    }

    processor = new PublicProcessor(
      globals,
      guardedMerkleTrees,
      contractsDB,
      simulator,
      new TestDateProvider(),
      getTelemetryClient(),
      createLogger('simulator:public-processor'),
    );

    tester = new PublicTxSimulationTester(merkleTrees, contractDataSource);

    // make sure tx senders have fee balance
    await tester.setFeePayerBalance(admin);
    await tester.setFeePayerBalance(sender);
  });

  afterEach(async () => {
    if (avmBackend?.destroy) {
      await avmBackend.destroy();
    }
    if (cdbServer) {
      await cdbServer.close();
    }
    avmBackend = undefined;
    cdbServer = undefined;
    await worldStateService.close();
  });

  it('can deploy in a private-only tx and call a public function later in the block', async () => {
    const { contractClass, contractInstance } = await createContractClassAndInstance(
      /*constructorArgs=*/ [],
      admin,
      AvmTestContractArtifact,
    );

    // First transaction - deploys and initializes first token contract
    const deployTx = await createTxForPrivateOnly(/*feePayer=*/ admin);
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
    // We must skip the nullifier insertions here because this tx re-deploys the same contract
    // class/instance as the first tx, which would produce a nullifier collision. By design, a
    // nullifier collision during tx-level revertible insertions is unprovable (not revertible),
    // so without this flag the tx would be thrown out rather than reverting in app logic.
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
    expect(processedTxs[1].revertCode).toEqual(RevertCode.REVERTED);

    // Third tx should succeed (mint), proving first contract is still accessible
    expect(processedTxs[2].revertCode).toEqual(RevertCode.OK);
  });
});

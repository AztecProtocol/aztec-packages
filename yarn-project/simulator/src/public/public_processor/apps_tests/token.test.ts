import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider, Timer } from '@aztec/foundation/timer';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import { GlobalVariables } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { NativeWorldStateService } from '@aztec/world-state';

import { CdbIpcServer } from '../../cdb_ipc_server.js';
import { PublicTxSimulationTester, SimpleContractDataSource } from '../../fixtures/index.js';
import { PublicContractsDB } from '../../public_db_sources.js';
import { type AvmIpcBackend, CppPublicTxSimulator } from '../../public_tx_simulator/cpp_public_tx_simulator.js';
import { IpcVsTsPublicTxSimulator } from '../../public_tx_simulator/ipc_vs_ts_public_tx_simulator.js';
import { GuardedMerkleTreeOperations } from '../guarded_merkle_tree.js';
import { PublicProcessor } from '../public_processor.js';

describe.each([
  { useCppSimulator: false, simulatorName: 'TS Simulator' },
  { useCppSimulator: true, simulatorName: 'Cpp Simulator' },
])('Public Processor app tests: TokenContract ($simulatorName)', ({ useCppSimulator }) => {
  const logger = createLogger('public-processor-apps-tests-token');

  const NUM_TRANSFERS = 10;
  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);

  let token: ContractInstanceWithAddress;
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

    tester = new PublicTxSimulationTester(merkleTrees, contractDataSource, globals);

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

  it('token constructor, mint, many transfers', async () => {
    const timer = new Timer();

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

    logger.verbose(`TokenContract public processor test took ${timer.ms()}ms\n`);
  });
});

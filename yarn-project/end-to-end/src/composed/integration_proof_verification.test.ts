import { L2Block, deployL1Contract, fileURLToPath } from '@aztec/aztec.js';
import { BBCircuitVerifier } from '@aztec/bb-prover';
import { Fr, HEADER_LENGTH, Proof } from '@aztec/circuits.js';
import { type L1ContractAddresses } from '@aztec/ethereum';
import { type Logger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import { AvailabilityOracleAbi, RollupAbi } from '@aztec/l1-artifacts';

import { type Anvil } from '@viem/anvil';
import { readFile } from 'fs/promises';
import { join } from 'path';
// @ts-expect-error solc-js doesn't publish its types https://github.com/ethereum/solc-js/issues/689
import solc from 'solc';
import {
  type Account,
  type Chain,
  type GetContractReturnType,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
  getContract,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { AGGREGATION_OBJECT_SIZE } from '../../../bb-prover/src/verification_key/verification_key_data.js';
import { MNEMONIC } from '../fixtures/fixtures.js';
import { getACVMConfig } from '../fixtures/get_acvm_config.js';
import { getBBConfig } from '../fixtures/get_bb_config.js';
import { getLogger, setupL1Contracts, startAnvil } from '../fixtures/utils.js';

describe('proof_verification', () => {
  let proof: Proof;
  let block: L2Block;
  let anvil: Anvil | undefined;
  let rpcUrl: string;
  let walletClient: WalletClient<HttpTransport, Chain, Account>;
  let publicClient: PublicClient<HttpTransport, Chain>;
  // eslint-disable-next-line
  let l1ContractAddresses: L1ContractAddresses;
  let logger: Logger;
  let circuitVerifier: BBCircuitVerifier;
  let bbTeardown: () => Promise<void>;
  let acvmTeardown: () => Promise<void>;
  let verifierContract: GetContractReturnType<any, typeof walletClient>;

  beforeAll(async () => {
    logger = getLogger();
    ({ anvil, rpcUrl } = await startAnvil());
    ({ l1ContractAddresses, publicClient, walletClient } = await setupL1Contracts(
      rpcUrl,
      mnemonicToAccount(MNEMONIC),
      logger,
    ));

    const bb = await getBBConfig(logger);
    const acvm = await getACVMConfig(logger);

    circuitVerifier = await BBCircuitVerifier.new({
      acvmBinaryPath: acvm!.acvmBinaryPath,
      acvmWorkingDirectory: acvm!.acvmWorkingDirectory,
      bbBinaryPath: bb!.bbBinaryPath,
      bbWorkingDirectory: bb!.bbWorkingDirectory,
    });

    bbTeardown = bb!.cleanup;
    acvmTeardown = acvm!.cleanup;

    const input = {
      language: 'Solidity',
      sources: {
        'UltraVerifier.sol': {
          content: await circuitVerifier.generateSolidityContract('RootRollupArtifact', 'UltraVerifier.sol'),
        },
      },
      settings: {
        // we require the optimizer
        optimizer: {
          enabled: true,
          runs: 200,
        },
        outputSelection: {
          '*': {
            '*': ['evm.bytecode.object', 'abi'],
          },
        },
      },
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    const abi = output.contracts['UltraVerifier.sol']['UltraVerifier'].abi;
    const bytecode: string = output.contracts['UltraVerifier.sol']['UltraVerifier'].evm.bytecode.object;

    try {
      const verifierAddress = await deployL1Contract(walletClient, publicClient, abi, `0x${bytecode}`);
      verifierContract = getContract({
        address: verifierAddress.toString(),
        client: publicClient,
        abi,
      }) as any;
    } catch (err) {
      logger.error(anvil?.logs.join(' '));
      throw err;
    }
  });

  afterAll(async () => {
    // await ctx.teardown();
    await anvil?.stop();
    await bbTeardown();
    await acvmTeardown();
  });

  beforeEach(async () => {
    proof = Proof.fromString(
      await readFile(join(fileURLToPath(import.meta.url), '../../fixtures/dumps/proof.txt'), 'utf-8'),
    );
    block = L2Block.fromString(
      await readFile(join(fileURLToPath(import.meta.url), '../../fixtures/dumps/block.txt'), 'utf-8'),
    );
  });

  describe('bb', () => {
    it('verifies proof', async () => {
      await expect(circuitVerifier.verifyProofForCircuit('RootRollupArtifact', proof)).resolves.toBeUndefined();
    });
  });

  describe('UltraVerifier', () => {
    it('verifies proof', async () => {
      const reader = BufferReader.asReader(proof.buffer);
      // +2 fields for archive
      const archive = reader.readArray(2, Fr);
      const header = reader.readArray(HEADER_LENGTH, Fr);
      const aggObject = reader.readArray(AGGREGATION_OBJECT_SIZE, Fr);

      const publicInputs = [...archive, ...header, ...aggObject].map(x => x.toString());

      const proofStr = `0x${proof.buffer
        .subarray((HEADER_LENGTH + 2 + AGGREGATION_OBJECT_SIZE) * Fr.SIZE_IN_BYTES)
        .toString('hex')}` as const;

      await expect(verifierContract.read.verify([proofStr, publicInputs])).resolves.toBeTruthy();
    });

    it('verifies proof taking public inputs from block', async () => {
      const aggObject = proof.buffer.subarray(
        Fr.SIZE_IN_BYTES * (HEADER_LENGTH + 2),
        Fr.SIZE_IN_BYTES * (HEADER_LENGTH + 2 + AGGREGATION_OBJECT_SIZE),
      );

      const justTheProof = `0x${proof.buffer
        .subarray(Fr.SIZE_IN_BYTES * (AGGREGATION_OBJECT_SIZE + HEADER_LENGTH + 2))
        .toString('hex')}` as const;

      const publicInputs = [
        ...block.archive.toFields(),
        ...block.header.toFields(),
        ...BufferReader.asReader(aggObject).readArray(16, Fr),
      ].map(x => x.toString());

      await expect(verifierContract.read.verify([justTheProof, publicInputs])).resolves.toBeTruthy();
    });
  });

  describe('Rollup', () => {
    let availabilityContract: GetContractReturnType<typeof AvailabilityOracleAbi, typeof walletClient>;
    let rollupContract: GetContractReturnType<typeof RollupAbi, typeof walletClient>;

    beforeAll(async () => {
      rollupContract = getContract({
        address: l1ContractAddresses.rollupAddress.toString(),
        abi: RollupAbi,
        client: walletClient,
      });

      availabilityContract = getContract({
        address: l1ContractAddresses.availabilityOracleAddress.toString(),
        abi: AvailabilityOracleAbi,
        client: walletClient,
      });

      await rollupContract.write.setVerifier([verifierContract.address]);
    });

    it('verifies proof', async () => {
      const proofWithoutPublicInputs = proof.buffer.subarray(Fr.SIZE_IN_BYTES * (HEADER_LENGTH + 2)); // 22 fields for header, 2 fields for header
      const data = {
        header: block.header.toBuffer(),
        archive: block.archive.root.toBuffer(),
        body: block.body.toBuffer(),
        proof: proofWithoutPublicInputs,
      };

      await availabilityContract.write.publish([`0x${data.body.toString('hex')}`]);

      await expect(
        rollupContract.write.process([
          `0x${data.header.toString('hex')}`,
          `0x${data.archive.toString('hex')}`,
          `0x${data.proof.toString('hex')}`,
        ]),
      ).resolves.toBeDefined();
    });
  });
});

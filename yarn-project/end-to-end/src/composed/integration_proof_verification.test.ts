import { L2Block, deployL1Contract, fileURLToPath } from '@aztec/aztec.js';
import { BBCircuitVerifier } from '@aztec/bb-prover';
import { Fr, Proof } from '@aztec/circuits.js';
import { type L1ContractAddresses } from '@aztec/ethereum';
import { type Logger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';

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

import { MNEMONIC } from '../fixtures/fixtures.js';
import { getACVMConfig } from '../fixtures/get_acvm_config.js';
import { getBBConfig } from '../fixtures/get_bb_config.js';
import { getLogger, setupL1Contracts, startAnvil } from '../fixtures/utils.js';

/**
 * Regenerate this test's fixture with
 * AZTEC_GENERATE_TEST_DATA=1 yarn workspace @aztec/end-to-end test e2e_prover
 */
describe('proof_verification', () => {
  let proof: Proof;
  let proverId: Fr;
  let vkTreeRoot: Fr;
  let block: L2Block;
  let aggregationObject: Fr[];
  let anvil: Anvil | undefined;
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
    let rpcUrl = process.env.ETHEREUM_HOST;
    if (!rpcUrl) {
      ({ anvil, rpcUrl } = await startAnvil());
    }
    logger.info('Anvil started');

    ({ l1ContractAddresses, publicClient, walletClient } = await setupL1Contracts(
      rpcUrl,
      mnemonicToAccount(MNEMONIC),
      logger,
    ));
    logger.info('l1 contracts done');

    const bb = await getBBConfig(logger);
    const acvm = await getACVMConfig(logger);

    circuitVerifier = await BBCircuitVerifier.new({
      bbBinaryPath: bb!.bbBinaryPath,
      bbWorkingDirectory: bb!.bbWorkingDirectory,
    });

    bbTeardown = bb!.cleanup;
    acvmTeardown = acvm!.cleanup;
    logger.info('bb, acvm done');

    const content = await circuitVerifier.generateSolidityContract('BlockRootRollupArtifact', 'UltraHonkVerifier.sol');
    logger.info('generated contract');

    const input = {
      language: 'Solidity',
      sources: {
        'UltraHonkVerifier.sol': {
          content,
        },
      },
      settings: {
        // we require the optimizer
        optimizer: {
          enabled: true,
          runs: 200,
        },
        evmVersion: 'paris',
        outputSelection: {
          '*': {
            '*': ['evm.bytecode.object', 'abi'],
          },
        },
      },
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    logger.info('compiled contract');

    const abi = output.contracts['UltraHonkVerifier.sol']['HonkVerifier'].abi;
    const bytecode: string = output.contracts['UltraHonkVerifier.sol']['HonkVerifier'].evm.bytecode.object;

    const { address: verifierAddress } = await deployL1Contract(walletClient, publicClient, abi, `0x${bytecode}`);
    verifierContract = getContract({
      address: verifierAddress.toString(),
      client: publicClient,
      abi,
    }) as any;
    logger.info('deployed verifier');
  });

  afterAll(async () => {
    // await ctx.teardown();
    await anvil?.stop();
    await bbTeardown();
    await acvmTeardown();
  });

  beforeAll(async () => {
    // regenerate with
    // AZTEC_GENERATE_TEST_DATA=1 yarn workspace @aztec/end-to-end test e2e_prover
    const blockResult = JSON.parse(
      await readFile(join(fileURLToPath(import.meta.url), '../../fixtures/dumps/block_result.json'), 'utf-8'),
    );

    block = L2Block.fromString(blockResult.block);
    proof = Proof.fromString(blockResult.proof);
    proverId = Fr.fromString(blockResult.proverId);
    vkTreeRoot = Fr.fromString(blockResult.vkTreeRoot);
    aggregationObject = blockResult.aggregationObject.map((x: string) => Fr.fromString(x));
  });

  describe('bb', () => {
    it('verifies proof', async () => {
      await expect(circuitVerifier.verifyProofForCircuit('BlockRootRollupArtifact', proof)).resolves.toBeUndefined();
    });
  });

  describe('HonkVerifier', () => {
    it('verifies full proof', async () => {
      // skip proof size which is an uint32
      const reader = BufferReader.asReader(proof.buffer.subarray(4));
      const [circuitSize, numPublicInputs, publicInputsOffset] = reader.readArray(3, Fr);
      const publicInputs = reader.readArray(numPublicInputs.toNumber(), Fr).map(x => x.toString());

      const proofStr = `0x${Buffer.concat([
        circuitSize.toBuffer(),
        numPublicInputs.toBuffer(),
        publicInputsOffset.toBuffer(),
        reader.readToEnd(),
      ]).toString('hex')}` as const;

      await expect(verifierContract.read.verify([proofStr, publicInputs])).resolves.toBeTruthy();
    });

    it('verifies proof taking public inputs from block', async () => {
      const reader = BufferReader.asReader(proof.buffer.subarray(4));
      const [circuitSize, numPublicInputs, publicInputsOffset] = reader.readArray(3, Fr);
      const publicInputsFromProof = reader.readArray(numPublicInputs.toNumber(), Fr).map(x => x.toString());

      const proofStr = `0x${Buffer.concat([
        circuitSize.toBuffer(),
        numPublicInputs.toBuffer(),
        publicInputsOffset.toBuffer(),
        reader.readToEnd(),
      ]).toString('hex')}` as const;

      const publicInputs = [
        block.header.lastArchive.root,
        block.header.globalVariables.blockNumber,
        block.archive.root,
        new Fr(block.archive.nextAvailableLeafIndex),
        Fr.ZERO, // prev block hash
        block.hash(),
        ...block.header.globalVariables.toFields(), // start global vars
        ...block.header.globalVariables.toFields(), // end global vars
        new Fr(block.header.contentCommitment.outHash),
        block.header.globalVariables.coinbase.toField(), // the fee taker's address
        block.header.totalFees, // how much they got
        ...Array(62).fill(Fr.ZERO), // 31 other (fee takers, fee) pairs
        vkTreeRoot,
        proverId, // 0x51
        ...aggregationObject,
      ].map((x: Fr) => x.toString());

      expect(publicInputs.length).toEqual(publicInputsFromProof.length);
      expect(publicInputs.slice(0, 27)).toEqual(publicInputsFromProof.slice(0, 27));
      expect(publicInputs.slice(27, 89)).toEqual(publicInputsFromProof.slice(27, 89));
      expect(publicInputs.slice(89, 91)).toEqual(publicInputsFromProof.slice(89, 91));
      expect(publicInputs.slice(91)).toEqual(publicInputsFromProof.slice(91));

      await expect(verifierContract.read.verify([proofStr, publicInputs])).resolves.toBeTruthy();
    });
  });
});

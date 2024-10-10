import { deployL1Contract, fileURLToPath } from '@aztec/aztec.js';
import { BBCircuitVerifier } from '@aztec/bb-prover';
import { Proof, RootRollupPublicInputs } from '@aztec/circuits.js';
import { compileContract, createL1Clients } from '@aztec/ethereum';
import { type Logger } from '@aztec/foundation/log';
import { IVerifierAbi } from '@aztec/l1-artifacts';

import { type Anvil } from '@viem/anvil';
import { readFile } from 'fs/promises';
import { join } from 'path';
// @ts-expect-error solc-js doesn't publish its types https://github.com/ethereum/solc-js/issues/689
import solc from 'solc';
import {
  type Account,
  type Chain,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
  getContract,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { MNEMONIC } from '../fixtures/fixtures.js';
import { getACVMConfig } from '../fixtures/get_acvm_config.js';
import { getBBConfig } from '../fixtures/get_bb_config.js';
import { getLogger, startAnvil } from '../fixtures/utils.js';

/**
 * Regenerate this test's fixture with
 * AZTEC_GENERATE_TEST_DATA=1 yarn workspace @aztec/prover-client test bb_prover_full_rollup
 */
describe('proof_verification', () => {
  let proof: Proof;
  let publicInputs: RootRollupPublicInputs;
  let anvil: Anvil | undefined;
  let walletClient: WalletClient<HttpTransport, Chain, Account>;
  let publicClient: PublicClient<HttpTransport, Chain>;
  let logger: Logger;
  let circuitVerifier: BBCircuitVerifier;
  let bbTeardown: () => Promise<void>;
  let acvmTeardown: () => Promise<void>;
  let verifierContract: GetContractReturnType<typeof IVerifierAbi, typeof walletClient>;

  beforeAll(async () => {
    logger = getLogger();
    let rpcUrl = process.env.ETHEREUM_HOST;
    if (!rpcUrl) {
      ({ anvil, rpcUrl } = await startAnvil());
    }
    logger.info('Anvil started');

    const bb = await getBBConfig(logger);
    const acvm = await getACVMConfig(logger);

    circuitVerifier = await BBCircuitVerifier.new(bb!);

    bbTeardown = bb!.cleanup;
    acvmTeardown = acvm!.cleanup;
    logger.info('BB and ACVM initialized');

    ({ publicClient, walletClient } = createL1Clients(rpcUrl, mnemonicToAccount(MNEMONIC)));
    const content = await circuitVerifier.generateSolidityContract('RootRollupArtifact', 'UltraHonkVerifier.sol');
    const { bytecode, abi } = compileContract('UltraHonkVerifier.sol', 'HonkVerifier', content, solc);
    const { address: verifierAddress } = await deployL1Contract(walletClient, publicClient, abi, bytecode);
    verifierContract = getContract({ address: verifierAddress.toString(), client: publicClient, abi: IVerifierAbi });
    logger.info('Deployed verifier');
  });

  afterAll(async () => {
    await anvil?.stop();
    await bbTeardown();
    await acvmTeardown();
  });

  beforeAll(async () => {
    // AZTEC_GENERATE_TEST_DATA=1 yarn workspace @aztec/prover-client test bb_prover_full_rollup
    const epochProof = JSON.parse(
      await readFile(join(fileURLToPath(import.meta.url), '../../fixtures/dumps/epoch_proof_result.json'), 'utf-8'),
    );

    proof = Proof.fromString(epochProof.proof);
    publicInputs = RootRollupPublicInputs.fromString(epochProof.publicInputs);
  });

  describe('public inputs', () => {
    it('output and proof public inputs are equal', () => {
      const proofPublicInputs = proof.extractPublicInputs().map(x => x.toString());
      const aggregationObject = proof.extractAggregationObject();
      const outputPublicInputs = [...publicInputs.toFields(), ...aggregationObject].map(x => x.toString());

      expect(proofPublicInputs).toEqual(outputPublicInputs);
    });
  });

  describe('bb', () => {
    it('verifies proof', async () => {
      await expect(circuitVerifier.verifyProofForCircuit('RootRollupArtifact', proof)).resolves.toBeUndefined();
    });
  });

  describe('honk verifier', () => {
    it('verifies proof', async () => {
      const proofStr = `0x${proof.withoutPublicInputs().toString('hex')}` as Hex;
      const proofPublicInputs = proof.extractPublicInputs().map(x => x.toString());

      await expect(verifierContract.read.verify([proofStr, proofPublicInputs])).resolves.toBeTruthy();
    });
  });
});

import { fileURLToPath } from '@aztec/aztec.js';
import { BBCircuitVerifier } from '@aztec/bb-prover';
import { PAIRING_POINTS_SIZE } from '@aztec/constants';
import { type ExtendedViemWalletClient, createExtendedL1Client, deployL1Contract } from '@aztec/ethereum';
import type { Logger } from '@aztec/foundation/log';
import { HonkVerifierAbi, HonkVerifierBytecode, IVerifierAbi } from '@aztec/l1-artifacts';
import { Proof } from '@aztec/stdlib/proofs';
import { RootRollupPublicInputs } from '@aztec/stdlib/rollup';

import type { Anvil } from '@viem/anvil';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { type GetContractReturnType, type Hex, getContract } from 'viem';
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
  let l1Client: ExtendedViemWalletClient;
  let logger: Logger;
  let circuitVerifier: BBCircuitVerifier;
  let bbTeardown: () => Promise<void>;
  let acvmTeardown: () => Promise<void>;
  let verifierContract: GetContractReturnType<typeof IVerifierAbi, typeof l1Client>;

  beforeAll(async () => {
    logger = getLogger();
    let rpcUrlList = process.env.ETHEREUM_HOSTS?.split(',');
    let rpcUrl = rpcUrlList?.[0];
    if (!rpcUrl) {
      ({ anvil, rpcUrl } = await startAnvil());
      rpcUrlList = [rpcUrl];
    }
    logger.info('Anvil started');

    const bb = await getBBConfig(logger);
    const acvm = await getACVMConfig(logger);

    circuitVerifier = await BBCircuitVerifier.new(bb!);

    bbTeardown = bb!.cleanup;
    acvmTeardown = acvm!.cleanup;
    logger.info('BB and ACVM initialized');

    l1Client = createExtendedL1Client(rpcUrlList!, mnemonicToAccount(MNEMONIC));

    const { address: verifierAddress } = await deployL1Contract(l1Client, HonkVerifierAbi, HonkVerifierBytecode);
    logger.info(`Deployed honk verifier at ${verifierAddress}`);

    verifierContract = getContract({ address: verifierAddress.toString(), client: l1Client, abi: IVerifierAbi });
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
      const outputPublicInputs = [...publicInputs.toFields()].map(x => x.toString());

      expect(proofPublicInputs).toEqual(outputPublicInputs);
    });
  });

  describe('bb', () => {
    it('verifies proof', async () => {
      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/13188): Handle the pairing point object without these hacks.
      const modifiedProof = Proof.fromString(proof.toString());
      modifiedProof.numPublicInputs -= PAIRING_POINTS_SIZE;
      await expect(circuitVerifier.verifyProofForCircuit('RootRollupArtifact', modifiedProof)).resolves.toBeUndefined();
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

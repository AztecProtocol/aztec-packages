import { type Tx } from '@aztec/aztec.js';
import { BarretenbergProverVerifier } from '@aztec/bb.js';
import { ClientCircuitArtifacts, type ClientProtocolArtifact } from '@aztec/noir-protocol-circuits-types';

import { gunzipSync } from 'zlib';

import { ClientProverTest } from './client_prover_test.js';

const TIMEOUT = 90_000;

async function verifyProof(circuitType: ClientProtocolArtifact, tx: Tx) {
  const circuit = ClientCircuitArtifacts[circuitType];
  const bytecode = Buffer.from(circuit.bytecode, 'base64');
  const uncompressedBytecode = gunzipSync(bytecode);
  const verifier: BarretenbergProverVerifier = new BarretenbergProverVerifier(uncompressedBytecode, {});
  const result = await verifier.verifyRawProof(tx.proof.buffer);
  expect(result).toBeTruthy();
}

describe('client_prover_integration', () => {
  const t = new ClientProverTest('transfer_private');
  let { provenAsset, accounts, tokenSim, logger } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    ({ provenAsset, accounts, tokenSim, logger } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it(
    'private transfer less than balance',
    async () => {
      logger.debug('Starting test...');
      const balance0 = await provenAsset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      const interaction = provenAsset.methods.transfer(accounts[0].address, accounts[1].address, amount, 0);
      const provenTx = await interaction.prove();

      // This will recursively verify all app and kernel circuits involved in the private stage of this transaction!
      await verifyProof('PrivateKernelTailArtifact', provenTx);

      await interaction.send().wait();
      tokenSim.transferPrivate(accounts[0].address, accounts[1].address, amount);
    },
    TIMEOUT,
  );

  it(
    'public transfer less than balance',
    async () => {
      const balance0 = await provenAsset.methods.balance_of_public(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      const interaction = provenAsset.methods.transfer(accounts[0].address, accounts[1].address, amount, 0);
      const provenTx = await interaction.prove();

      // This will recursively verify all app and kernel circuits involved in the private stage of this transaction!
      await verifyProof('PrivateKernelTailToPublicArtifact', provenTx);

      await interaction.send().wait();
      tokenSim.transferPublic(accounts[0].address, accounts[1].address, amount);
    },
    TIMEOUT,
  );
});

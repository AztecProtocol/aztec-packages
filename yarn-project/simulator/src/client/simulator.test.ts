import { CompleteAddress, Note } from '@aztec/circuit-types';
import type { AztecNode } from '@aztec/circuit-types/interfaces/client';
import { KeyValidationRequest, computeAppNullifierSecretKey, deriveKeys } from '@aztec/circuits.js';
import { getFunctionArtifactByName } from '@aztec/circuits.js/abi';
import type { FunctionArtifact } from '@aztec/circuits.js/abi';
import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import type { Point } from '@aztec/foundation/fields';
import { TokenBlacklistContractArtifact } from '@aztec/noir-contracts.js/TokenBlacklist';

import { mock } from 'jest-mock-extended';
import type { MockProxy } from 'jest-mock-extended';

import { WASMSimulator } from '../providers/acvm_wasm.js';
import type { DBOracle } from './db_oracle.js';
import { AcirSimulator } from './simulator.js';

describe('Simulator', () => {
  const simulationProvider = new WASMSimulator();

  let oracle: MockProxy<DBOracle>;
  let node: MockProxy<AztecNode>;

  let simulator: AcirSimulator;
  let ownerMasterNullifierPublicKey: Point;
  let contractAddress: AztecAddress;
  let appNullifierSecretKey: Fr;

  beforeEach(async () => {
    const ownerSk = Fr.fromHexString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');
    const allOwnerKeys = await deriveKeys(ownerSk);

    ownerMasterNullifierPublicKey = allOwnerKeys.publicKeys.masterNullifierPublicKey;
    const ownerMasterNullifierSecretKey = allOwnerKeys.masterNullifierSecretKey;

    contractAddress = await AztecAddress.random();

    const ownerPartialAddress = Fr.random();
    const ownerCompleteAddress = CompleteAddress.fromSecretKeyAndPartialAddress(ownerSk, ownerPartialAddress);

    appNullifierSecretKey = await computeAppNullifierSecretKey(ownerMasterNullifierSecretKey, contractAddress);

    oracle = mock<DBOracle>();
    node = mock<AztecNode>();
    oracle.getKeyValidationRequest.mockResolvedValue(
      new KeyValidationRequest(ownerMasterNullifierPublicKey, appNullifierSecretKey),
    );
    oracle.getCompleteAddress.mockResolvedValue(ownerCompleteAddress);

    simulator = new AcirSimulator(oracle, node, simulationProvider);
  });

  describe('compute_note_hash_and_optionally_a_nullifier', () => {
    const artifact = getFunctionArtifactByName(
      TokenBlacklistContractArtifact,
      'compute_note_hash_and_optionally_a_nullifier',
    );
    const nonce = Fr.random();
    const storageSlot = TokenBlacklistContractArtifact.storageLayout['balances'].slot;
    const noteTypeId = TokenBlacklistContractArtifact.notes['TokenNote'].id;

    // Amount is a U128, with a lo and hi limbs
    const createNote = async (amount = 123n) =>
      new Note([new Fr(amount), new Fr(0), await ownerMasterNullifierPublicKey.hash(), Fr.random()]);

    it('throw if the contract does not implement "compute_note_hash_and_optionally_a_nullifier"', async () => {
      oracle.getFunctionArtifactByName.mockResolvedValue(undefined);

      const note = await createNote();
      await expect(
        simulator.computeNoteHashAndNullifier(contractAddress, nonce, storageSlot, noteTypeId, note),
      ).rejects.toThrow(/Mandatory implementation of "compute_note_hash_and_optionally_a_nullifier" missing/);
    });

    it('throw if "compute_note_hash_and_optionally_a_nullifier" has the wrong number of parameters', async () => {
      const note = await createNote();

      const modifiedArtifact: FunctionArtifact = {
        ...artifact,
        parameters: artifact.parameters.slice(1),
      };
      oracle.getFunctionArtifactByName.mockResolvedValue(modifiedArtifact);

      await expect(
        simulator.computeNoteHashAndNullifier(contractAddress, nonce, storageSlot, noteTypeId, note),
      ).rejects.toThrow(
        new RegExp(
          `Expected 6 parameters in mandatory implementation of "compute_note_hash_and_optionally_a_nullifier", but found 5 in noir contract ${contractAddress}.`,
        ),
      );
    });
  });
});

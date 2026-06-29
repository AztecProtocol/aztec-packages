import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import {
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { TxEffectOracleTestContract } from '@aztec/noir-test-contracts.js/TxEffectOracleTest';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { ContractClassLog, FlatPublicLogs, PrivateLog } from '@aztec/stdlib/logs';
import type { TxEffect, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

// Exercises the `aztec_utl_getTxEffect` utility oracle end-to-end. The contract hashes the deserialized `TxEffect`
// field-by-field with poseidon2 and asserts the result matches a hash computed in TS over the same fixed-size flat
// field layout used by Noir's auto-derived `Serialize<TxEffect>`. Any layout drift between Noir and TS produces a
// mismatch.
//
// Note: This would ideally be an integration test as it only tests an oracle implementation but we currently don't
// have the infrastructure for that. Testing it with TXE is also infeasible as there we would not be able to check the
// obtained tx effect from oracle with the one obtained directly in TS.
//
// Uses a single node with AutomineSequencer and one account.
describe('e2e tx effect oracle', () => {
  let contract: TxEffectOracleTestContract;
  let deployTxHash: TxHash;
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;
  let aztecNode: AztecNode;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      aztecNode,
      accounts: [defaultAccountAddress],
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));
    const { contract: deployed, receipt } = await TxEffectOracleTestContract.deploy(wallet).send({
      from: defaultAccountAddress,
    });
    contract = deployed;
    deployTxHash = receipt.txHash;
  });

  afterAll(() => teardown());

  // Fetches the deploy tx's TxEffect from the node, computes a poseidon2 hash over the padded field
  // layout in TS, then simulates the Noir contract's get_tx_effect_hash and compares the two hashes.
  it('tx effect in Noir exactly matches tx effect in TS', async () => {
    const nodeEffect = await aztecNode.getTxEffect(deployTxHash);
    expect(nodeEffect).toBeDefined();

    // We compare hashes instead of comparing the tx effects directly as returning the full tx effect from the function
    // would be tricky.
    const expectedHash = await hashTxEffect(nodeEffect!.data);
    const { result: actualHash } = await contract.methods
      .get_tx_effect_hash(deployTxHash.hash)
      .simulate({ from: defaultAccountAddress });

    expect(actualHash).toEqual(expectedHash.toBigInt());
  });

  // Passes a random Fr as a tx hash to assert_is_none; asserts the oracle returns None (the tx does
  // not exist) without throwing.
  it('aztec_utl_getTxEffect oracle returns None for a random tx hash', async () => {
    await contract.methods.assert_is_none(Fr.random()).simulate({ from: defaultAccountAddress });
  });
});

// Mirrors Noir's auto-derived `Serialize<TxEffect>` layout: variable-length collections are padded to their `MAX_*`
// constant. Note that contract class log fields are emitted in Noir struct order (`log.fields`, `log.length`,
// `contract_address`), which differs from `ContractClassLog.toFields()`.
function hashTxEffect(effect: TxEffect): Promise<Fr> {
  const fields = [
    effect.revertCode.toField(),
    effect.txHash.hash,
    effect.transactionFee,
    ...padArrayEnd(effect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    ...padArrayEnd(effect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
    ...padArrayEnd(effect.l2ToL1Msgs, Fr.ZERO, MAX_L2_TO_L1_MSGS_PER_TX),
    ...padArrayEnd(
      effect.publicDataWrites,
      PublicDataWrite.empty(),
      MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    ).flatMap(w => w.toFields()),
    ...padArrayEnd(effect.privateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX).flatMap(l => l.toFields()),
    ...FlatPublicLogs.fromLogs(effect.publicLogs).toFields(),
    ...padArrayEnd(effect.contractClassLogs, ContractClassLog.empty(), MAX_CONTRACT_CLASS_LOGS_PER_TX).flatMap(l => [
      ...l.fields.toFields(),
      new Fr(l.emittedLength),
      l.contractAddress.toField(),
    ]),
  ];
  return poseidon2Hash(fields);
}

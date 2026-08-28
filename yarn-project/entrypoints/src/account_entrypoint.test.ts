import { poseidon2HashBytes } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasSettings } from '@aztec/stdlib/gas';
import { ExecutionPayload } from '@aztec/stdlib/tx';

import {
  AccountFeePaymentMethodOptions,
  DefaultAccountEntrypoint,
  type DefaultAccountEntrypointOptions,
  ENTRYPOINT_PAYLOAD_DOMAIN_SEPARATOR,
} from './account_entrypoint.js';
import type { AuthWitnessProvider, ChainInfo } from './interfaces.js';

describe('DefaultAccountEntrypoint', () => {
  // Returns the message hash as the witness request hash, so tests can observe exactly what the account is asked
  // to authorize without involving keys.
  const authWitnessProvider: AuthWitnessProvider = {
    createAuthWit: (messageHash: Fr | Buffer) =>
      Promise.resolve(
        new AuthWitness(Fr.fromBuffer(Buffer.isBuffer(messageHash) ? messageHash : messageHash.toBuffer()), []),
      ),
  };

  const address = AztecAddress.fromNumberUnsafe(42);
  const chainInfo: ChainInfo = { chainId: new Fr(1), version: new Fr(2) };

  const gasSettings = GasSettings.from({
    gasLimits: { daGas: 100, l2Gas: 200 },
    teardownGasLimits: { daGas: 10, l2Gas: 20 },
    maxFeesPerGas: { feePerDaGas: 3n, feePerL2Gas: 4n },
    maxPriorityFeesPerGas: { feePerDaGas: 1n, feePerL2Gas: 2n },
  });

  const baseOptions: DefaultAccountEntrypointOptions = {
    txNonce: new Fr(7),
    cancellable: false,
    feePaymentMethodOptions: AccountFeePaymentMethodOptions.EXTERNAL,
  };

  const getPayloadAuthWitnessHash = async (options: DefaultAccountEntrypointOptions): Promise<Fr> => {
    const entrypoint = new DefaultAccountEntrypoint(address, authWitnessProvider);
    const request = await entrypoint.createTxExecutionRequest(
      ExecutionPayload.empty(),
      gasSettings,
      chainInfo,
      options,
    );
    return request.authWitnesses.at(-1)!.requestHash;
  };

  it('computes the same payload auth witness for identical requests', async () => {
    const first = await getPayloadAuthWitnessHash(baseOptions);
    const second = await getPayloadAuthWitnessHash(baseOptions);
    expect(first.equals(second)).toBe(true);
  });

  it.each([
    [AccountFeePaymentMethodOptions.EXTERNAL, AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE],
    [AccountFeePaymentMethodOptions.EXTERNAL, AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM],
    [AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE, AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM],
  ])('binds the fee payment method into the payload auth witness (%i vs %i)', async (from, to) => {
    const first = await getPayloadAuthWitnessHash({ ...baseOptions, feePaymentMethodOptions: from });
    const second = await getPayloadAuthWitnessHash({ ...baseOptions, feePaymentMethodOptions: to });
    expect(first.equals(second)).toBe(false);
  });

  it('binds the cancellable flag into the payload auth witness', async () => {
    const first = await getPayloadAuthWitnessHash({ ...baseOptions, cancellable: false });
    const second = await getPayloadAuthWitnessHash({ ...baseOptions, cancellable: true });
    expect(first.equals(second)).toBe(false);
  });

  // Guards against drift from the Noir DOM_SEP__ENTRYPOINT_PAYLOAD, which is hand-mirrored here. Re-derives the
  // value from the separator name the same way the Noir domain separators are derived (poseidon over the
  // "az_dom_sep__<name>" byte string, truncated to a u32) rather than pinning a magic number.
  it('mirrors the Noir entrypoint payload domain separator', async () => {
    const derived = Number(
      (await poseidon2HashBytes(Buffer.from('az_dom_sep__entrypoint_payload'))).toBigInt() & 0xffffffffn,
    );
    expect(ENTRYPOINT_PAYLOAD_DOMAIN_SEPARATOR).toEqual(derived);
  });
});

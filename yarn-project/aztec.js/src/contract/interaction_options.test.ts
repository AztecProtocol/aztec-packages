import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { OFFCHAIN_MESSAGE_IDENTIFIER, type OffchainEffect } from '@aztec/stdlib/tx';

import { extractOffchainOutput } from './interaction_options.js';

describe('extractOffchainOutput', () => {
  const anchorBlockTimestamp = 1234567890n;

  const makeEffect = (data: Fr[], contractAddress?: AztecAddress): OffchainEffect => ({
    data,
    contractAddress: contractAddress ?? AztecAddress.fromFieldUnsafe(Fr.random()),
  });

  const makeMessageEffect = async (recipient?: AztecAddress, payload?: Fr[], contractAddress?: AztecAddress) =>
    makeEffect(
      [
        OFFCHAIN_MESSAGE_IDENTIFIER,
        (recipient ?? (await AztecAddress.random())).toField(),
        ...(payload ?? [Fr.random()]),
      ],
      contractAddress,
    );

  it('returns empty output for empty input', () => {
    const result = extractOffchainOutput([], anchorBlockTimestamp);
    expect(result.offchainEffects).toEqual([]);
    expect(result.offchainMessages).toEqual([]);
  });

  it('keeps non-message effects as-is', () => {
    const effects = [makeEffect([Fr.random(), Fr.random()]), makeEffect([Fr.random()])];
    const result = extractOffchainOutput(effects, anchorBlockTimestamp);
    expect(result.offchainEffects).toEqual(effects);
    expect(result.offchainMessages).toEqual([]);
  });

  it('extracts a message effect into offchainMessages', async () => {
    const recipient = await AztecAddress.random();
    const payload = [Fr.random(), Fr.random(), Fr.random()];
    const contractAddress = await AztecAddress.random();
    const effect = await makeMessageEffect(recipient, payload, contractAddress);

    const result = extractOffchainOutput([effect], anchorBlockTimestamp);

    expect(result.offchainEffects).toEqual([]);
    expect(result.offchainMessages).toHaveLength(1);
    expect(result.offchainMessages[0]).toEqual({
      recipient,
      payload,
      contractAddress,
      anchorBlockTimestamp,
    });
  });

  it('splits a mixed array of effects and messages', async () => {
    const plainEffect1 = makeEffect([Fr.random()]);
    const plainEffect2 = makeEffect([Fr.random(), Fr.random()]);
    const messageEffect = await makeMessageEffect();

    const result = extractOffchainOutput([plainEffect1, messageEffect, plainEffect2], anchorBlockTimestamp);

    expect(result.offchainEffects).toEqual([plainEffect1, plainEffect2]);
    expect(result.offchainMessages).toHaveLength(1);
  });

  it('handles multiple message effects', async () => {
    const msg1 = await makeMessageEffect();
    const msg2 = await makeMessageEffect();

    const result = extractOffchainOutput([msg1, msg2], anchorBlockTimestamp);

    expect(result.offchainEffects).toEqual([]);
    expect(result.offchainMessages).toHaveLength(2);
  });

  it('does not treat an effect as a message if data has only the identifier (no recipient)', () => {
    const effect = makeEffect([OFFCHAIN_MESSAGE_IDENTIFIER]);
    const result = extractOffchainOutput([effect], anchorBlockTimestamp);

    expect(result.offchainEffects).toEqual([effect]);
    expect(result.offchainMessages).toEqual([]);
  });
});

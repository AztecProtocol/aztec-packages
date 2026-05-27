import { MEGA_VK_LENGTH_IN_FIELDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { EthAddress } from '@aztec/foundation/eth-address';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { makeBlockHeader } from '@aztec/stdlib/testing';
import { FunctionData } from '@aztec/stdlib/tx';
import { VerificationKeyAsFields } from '@aztec/stdlib/vks';

import { mapFunctionDataFromNoir, mapFunctionDataToNoir } from './client.js';
import {
  mapAztecAddressFromNoir,
  mapAztecAddressToNoir,
  mapBlockHeaderFromNoir,
  mapBlockHeaderToNoir,
  mapEthAddressFromNoir,
  mapEthAddressToNoir,
  mapFieldFromNoir,
  mapFieldToNoir,
  mapFunctionSelectorFromNoir,
  mapFunctionSelectorToNoir,
  mapPaddedVerificationKeyToNoir,
  mapPointFromNoir,
  mapPointToNoir,
} from './common.js';

describe('Noir<>stdlib type conversion test suite', () => {
  describe('Round trip', () => {
    it('should map fields', () => {
      const field = new Fr(27n);
      expect(mapFieldFromNoir(mapFieldToNoir(field))).toEqual(field);
    });

    const point = new Point(new Fr(27n), new Fr(28n), false);

    it('should map points', () => {
      expect(mapPointFromNoir(mapPointToNoir(point))).toEqual(point);
    });

    it('should map aztec addresses', async () => {
      const aztecAddress = await AztecAddress.random();
      expect(mapAztecAddressFromNoir(mapAztecAddressToNoir(aztecAddress))).toEqual(aztecAddress);
    });

    it('should map eth addresses', () => {
      const ethAddress = EthAddress.random();
      expect(mapEthAddressFromNoir(mapEthAddressToNoir(ethAddress))).toEqual(ethAddress);
    });

    const functionSelector = new FunctionSelector(34);

    it('should map function selectors', () => {
      expect(mapFunctionSelectorFromNoir(mapFunctionSelectorToNoir(functionSelector))).toEqual(functionSelector);
    });

    const functionData = new FunctionData(functionSelector, /*isPrivate=*/ true);

    it('should map function data', () => {
      expect(mapFunctionDataFromNoir(mapFunctionDataToNoir(functionData))).toEqual(functionData);
    });

    it('should map block header', () => {
      const header = makeBlockHeader(35);
      expect(mapBlockHeaderFromNoir(mapBlockHeaderToNoir(header))).toEqual(header);
    });

    it('pads slim Chonk verification keys to the Noir Mega VK width', () => {
      const appVkLength = 147;
      const vk = new VerificationKeyAsFields(
        Array.from({ length: appVkLength }, (_, i) => new Fr(i + 1)),
        new Fr(999),
      );

      const noirVk = mapPaddedVerificationKeyToNoir(vk, MEGA_VK_LENGTH_IN_FIELDS);

      expect(noirVk.key).toHaveLength(MEGA_VK_LENGTH_IN_FIELDS);
      expect(noirVk.key[appVkLength - 1]).toEqual(mapFieldToNoir(new Fr(appVkLength)));
      expect(noirVk.key[appVkLength]).toEqual(mapFieldToNoir(Fr.ZERO));
      expect(noirVk.key[MEGA_VK_LENGTH_IN_FIELDS - 1]).toEqual(mapFieldToNoir(Fr.ZERO));
      expect(noirVk.hash).toEqual(mapFieldToNoir(vk.hash));
    });

    it('rejects verification keys larger than the padded target width', () => {
      const vk = new VerificationKeyAsFields(
        Array.from({ length: MEGA_VK_LENGTH_IN_FIELDS + 1 }, (_, i) => new Fr(i + 1)),
        new Fr(999),
      );

      expect(() => mapPaddedVerificationKeyToNoir(vk, MEGA_VK_LENGTH_IN_FIELDS)).toThrow(
        `Expected at most ${MEGA_VK_LENGTH_IN_FIELDS} fields, got ${MEGA_VK_LENGTH_IN_FIELDS + 1}`,
      );
    });
  });
});

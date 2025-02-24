import { FunctionSelector } from '@aztec/circuits.js/abi';
import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { makeHeader } from '@aztec/circuits.js/testing';
import { FunctionData } from '@aztec/circuits.js/tx';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr, Point } from '@aztec/foundation/fields';

import { mapFunctionDataFromNoir, mapFunctionDataToNoir } from './client.js';
import {
  mapAztecAddressFromNoir,
  mapAztecAddressToNoir,
  mapEthAddressFromNoir,
  mapEthAddressToNoir,
  mapFieldFromNoir,
  mapFieldToNoir,
  mapFunctionSelectorFromNoir,
  mapFunctionSelectorToNoir,
  mapHeaderFromNoir,
  mapHeaderToNoir,
  mapPointFromNoir,
  mapPointToNoir,
} from './common.js';

describe('Noir<>Circuits.js type conversion test suite', () => {
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
      const header = makeHeader(35, undefined);
      expect(mapHeaderFromNoir(mapHeaderToNoir(header))).toEqual(header);
    });
  });
});

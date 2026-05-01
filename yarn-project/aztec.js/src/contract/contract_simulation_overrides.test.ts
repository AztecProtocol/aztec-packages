import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SerializableContractInstance } from '@aztec/stdlib/contract';

import { spoofContractClassPublish, spoofContractInstancePublish } from './contract_simulation_overrides.js';

describe('contract simulation override helpers', () => {
  describe('spoofContractClassPublish', () => {
    it('returns the class wrapped in contractClasses', () => {
      const klass = { id: Fr.random() } as any;
      expect(spoofContractClassPublish(klass)).toEqual({ contractClasses: [klass] });
    });
  });

  describe('spoofContractInstancePublish', () => {
    it('returns the instance wrapped in contractInstances when current == original class', async () => {
      const classId = Fr.random();
      const instance = (
        await SerializableContractInstance.random({ currentContractClassId: classId, originalContractClassId: classId })
      ).withAddress(await AztecAddress.random());

      expect(spoofContractInstancePublish(instance)).toEqual({ contractInstances: [instance] });
    });

    it('throws when current and original class IDs differ', async () => {
      const instance = (
        await SerializableContractInstance.random({
          currentContractClassId: Fr.random(),
          originalContractClassId: Fr.random(),
        })
      ).withAddress(await AztecAddress.random());

      expect(() => spoofContractInstancePublish(instance)).toThrow(/fastForwardContractUpdate/);
    });
  });
});

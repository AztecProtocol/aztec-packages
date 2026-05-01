import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { StateOverrides } from '@aztec/stdlib/interfaces/client';

/**
 * Subset of `StateOverrides` containing only contract class/instance fields. The cheatcode helpers
 * below produce values of this type for spreading into a `stateOverrides` argument.
 */
export type ContractStateOverrides = Pick<StateOverrides, 'contractClasses' | 'contractInstances'>;

/**
 * Cheatcode-style primitives for building `ContractStateOverrides` blobs to pass into
 * `simulate({ stateOverrides: { ... } })`.
 *
 * Each helper produces an override blob that, when applied during simulation, makes the simulator
 * behave as if the corresponding on-chain action had occurred — without actually running it. The
 * helpers themselves perform no state changes; they only build the blob.
 *
 * For simulating a contract upgrade end-to-end (instance + registry storage), see the higher-level
 * `fastForwardContractUpdate` helper instead — these primitives compose the contract DB side only.
 *
 * Naming mirrors the real on-chain action being spoofed:
 * - `spoofContractClassPublish` ↔ `publishContractClass`
 * - `spoofContractInstancePublish` ↔ `publishInstance`
 */

/** Builds an override blob that pretends `contractClass` was published on the class registry. */
export function spoofContractClassPublish(contractClass: ContractClassPublic): ContractStateOverrides {
  return { contractClasses: [contractClass] };
}

/**
 * Builds an override blob that pretends `instance` was published on the instance registry.
 *
 * Validates that the instance's `currentContractClassId` matches its `originalContractClassId`. The
 * AVM's UpdateCheck (run during witgen/proving) verifies that any divergence between current and
 * original class IDs is backed by a consistent entry in the registry's delayed-public-mutable
 * storage. To inject an instance whose current class differs from its original, use
 * `fastForwardContractUpdate` instead — it produces both the instance and registry storage
 * overrides as a coherent set.
 *
 * @throws If `instance.currentContractClassId` differs from `instance.originalContractClassId`.
 */
export function spoofContractInstancePublish(instance: ContractInstanceWithAddress): ContractStateOverrides {
  if (!instance.currentContractClassId.equals(instance.originalContractClassId)) {
    throw new Error(
      `Cannot spoof publish of instance ${instance.address} with currentContractClassId != originalContractClassId; ` +
        `use fastForwardContractUpdate to spoof an upgraded instance instead`,
    );
  }
  return { contractInstances: [instance] };
}

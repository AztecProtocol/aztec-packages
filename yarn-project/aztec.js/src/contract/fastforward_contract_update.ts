import { Fr } from '@aztec/foundation/curves/bn254';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  DelayedPublicMutableValuesWithHash,
  ScheduledDelayChange,
  ScheduledValueChange,
} from '@aztec/stdlib/delayed-public-mutable';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { SimulationOverrides } from '@aztec/stdlib/tx';

/**
 * Builds `SimulationOverrides` that simulate a deployed instance as if it had already been upgraded to a
 * new contract class. Mirrors a real on-chain upgrade (`pxe.updateContract` followed by waiting out the delay):
 *
 * - `publicStorage` rewrites the `ContractInstanceRegistry`'s delayed-public-mutable storage so the AVM's
 *   `UpdateCheck` resolves to the new class id.
 * - `contracts` swaps the deployed instance for one whose `currentContractClassId` is bumped to the new class.
 *
 * The new class must already be registered on chain.
 *
 * @throws If the instance is not deployed, the class is not registered on chain, or the instance is already on the target class.
 */
export async function fastForwardContractUpdate(args: {
  /** Address of the deployed instance to upgrade. */
  instanceAddress: AztecAddress;
  /** ID of the (already-registered) class to upgrade to. */
  newClassId: Fr;
  /** Node used to fetch the existing instance and validate the class is registered. */
  node: AztecNode;
}): Promise<SimulationOverrides> {
  const { instanceAddress, newClassId, node } = args;

  const instance = await node.getContract(instanceAddress);
  if (!instance) {
    throw new Error(`Instance not deployed at ${instanceAddress}. Deploy it before fast-forwarding an update.`);
  }

  const klass = await node.getContractClass(newClassId);
  if (!klass) {
    throw new Error(
      `Contract class ${newClassId} is not registered on chain. Publish it before fast-forwarding to it.`,
    );
  }

  if (instance.currentContractClassId.equals(newClassId)) {
    throw new Error(`Instance ${instanceAddress} is already on class ${newClassId}. Nothing to fast-forward.`);
  }

  // Build the SVC the same way `ContractInstanceRegistry::update` would have, but with a timestamp_of_change
  // safely in the past so the AVM's UpdateCheck resolves to the post-upgrade class id at any sim timestamp.
  const svc = new ScheduledValueChange(/*previous=*/ [new Fr(0)], /*post=*/ [newClassId], /*timestampOfChange=*/ 1n);
  const sdc = ScheduledDelayChange.empty();
  const dpmv = new DelayedPublicMutableValuesWithHash(svc, sdc);

  const { delayedPublicMutableSlot } = await DelayedPublicMutableValuesWithHash.getContractUpdateSlots(instanceAddress);
  const fields = await dpmv.toFields();

  const publicStorage = fields.map((value, i) => ({
    contract: ProtocolContractAddress.ContractInstanceRegistry,
    slot: delayedPublicMutableSlot.add(new Fr(i)),
    value,
  }));

  const upgradedInstance = { ...instance, currentContractClassId: newClassId };

  return new SimulationOverrides({
    publicStorage,
    contracts: { [instanceAddress.toString()]: { instance: upgradedInstance } },
  });
}

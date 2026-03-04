import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import type { AllowedElement } from '@aztec/stdlib/interfaces/server';

let defaultAllowedSetupFunctions: AllowedElement[] | undefined;

/** Returns the default list of functions allowed to run in the setup phase of a transaction. */
export async function getDefaultAllowedSetupFunctions(): Promise<AllowedElement[]> {
  if (defaultAllowedSetupFunctions === undefined) {
    const tokenClassId = (await getContractClassFromArtifact(TokenContractArtifact)).id;
    const setAuthorizedInternalSelector = await FunctionSelector.fromSignature('_set_authorized((Field),Field,bool)');
    const setAuthorizedSelector = await FunctionSelector.fromSignature('set_authorized(Field,bool)');
    const increaseBalanceSelector = await FunctionSelector.fromSignature('_increase_public_balance((Field),u128)');
    const transferInPublicSelector = await FunctionSelector.fromSignature(
      'transfer_in_public((Field),(Field),u128,Field)',
    );

    defaultAllowedSetupFunctions = [
      // AuthRegistry: needed for authwit support via private path (set_authorized_private enqueues _set_authorized)
      {
        address: ProtocolContractAddress.AuthRegistry,
        selector: setAuthorizedInternalSelector,
        onlySelf: true,
        rejectNullMsgSender: true,
      },
      // AuthRegistry: needed for authwit support via public path (PublicFeePaymentMethod calls set_authorized directly)
      {
        address: ProtocolContractAddress.AuthRegistry,
        selector: setAuthorizedSelector,
        rejectNullMsgSender: true,
      },
      // FeeJuice: needed for claiming on the same tx as a spend (claim_and_end_setup enqueues this)
      {
        address: ProtocolContractAddress.FeeJuice,
        selector: increaseBalanceSelector,
        onlySelf: true,
      },
      // Token: needed for private transfers via FPC (transfer_to_public enqueues this)
      {
        classId: tokenClassId,
        selector: increaseBalanceSelector,
        onlySelf: true,
      },
      // Token: needed for public transfers via FPC (fee_entrypoint_public enqueues this)
      {
        classId: tokenClassId,
        selector: transferInPublicSelector,
      },
    ];
  }
  return defaultAllowedSetupFunctions;
}

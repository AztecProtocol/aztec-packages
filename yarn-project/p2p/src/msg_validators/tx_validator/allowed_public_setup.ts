import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import type { AllowedElement } from '@aztec/stdlib/interfaces/server';

let defaultAllowedSetupFunctions: AllowedElement[] | undefined = undefined;
export async function getDefaultAllowedSetupFunctions(): Promise<AllowedElement[]> {
  if (defaultAllowedSetupFunctions === undefined) {
    const tokenClassId = (await getContractClassFromArtifact(TokenContractArtifact)).id;
    const setAuthorizedInternalSelector = await FunctionSelector.fromSignature('_set_authorized((Field),Field,bool)');
    const setAuthorizedSelector = await FunctionSelector.fromSignature('set_authorized(Field,bool)');
    const increaseBalanceSelector = await FunctionSelector.fromSignature('_increase_public_balance((Field),u128)');

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
      {
        classId: (await getContractClassFromArtifact(FPCContract.artifact)).id,
        // We can't restrict the selector because public functions get routed via dispatch.
        // selector: FunctionSelector.fromSignature('prepare_fee((Field),Field,(Field),Field)'),
      },
    ];
  }
  return defaultAllowedSetupFunctions;
}

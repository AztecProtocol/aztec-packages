import { type AllowedElement } from '@aztec/circuit-types';
import { getContractClassFromArtifact } from '@aztec/circuits.js';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

let defaultAllowedSetupFunctions: AllowedElement[] | undefined = undefined;

export function getDefaultAllowedSetupFunctions(): AllowedElement[] {
  if (defaultAllowedSetupFunctions === undefined) {
    defaultAllowedSetupFunctions = [
      // needed for authwit support
      {
        address: ProtocolContractAddress.AuthRegistry,
      },
      // needed for claiming on the same tx as a spend
      {
        address: ProtocolContractAddress.FeeJuice,
        // We can't restrict the selector because public functions get routed via dispatch.
        // selector: FunctionSelector.fromSignature('_increase_public_balance((Field),Field)'),
      },
      // needed for private transfers via FPC
      {
        classId: getContractClassFromArtifact(TokenContractArtifact).id,
        // We can't restrict the selector because public functions get routed via dispatch.
        // selector: FunctionSelector.fromSignature('_increase_public_balance((Field),Field)'),
      },
      {
        classId: getContractClassFromArtifact(FPCContract.artifact).id,
        // We can't restrict the selector because public functions get routed via dispatch.
        // selector: FunctionSelector.fromSignature('prepare_fee((Field),Field,(Field),Field)'),
      },
    ];
  }
  return defaultAllowedSetupFunctions;
}

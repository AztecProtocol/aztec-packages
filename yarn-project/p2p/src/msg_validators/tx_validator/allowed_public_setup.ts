import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { AuthRegistryArtifact } from '@aztec/protocol-contracts/auth-registry';
import { FeeJuiceArtifact } from '@aztec/protocol-contracts/fee-juice';
import { FunctionSelector, countArgumentsSize } from '@aztec/stdlib/abi';
import type { ContractArtifact, FunctionAbi } from '@aztec/stdlib/abi';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import type { AllowedElement } from '@aztec/stdlib/interfaces/server';

/** Returns the expected calldata length for a function: 1 (selector) + arguments size. */
function getCalldataLength(artifact: ContractArtifact, functionName: string): number {
  const allFunctions: FunctionAbi[] = (artifact.functions as FunctionAbi[]).concat(
    artifact.nonDispatchPublicFunctions || [],
  );
  const fn = allFunctions.find(f => f.name === functionName);
  if (!fn) {
    throw new Error(`Unknown function ${functionName} in artifact ${artifact.name}`);
  }
  return 1 + countArgumentsSize(fn);
}

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
        calldataLength: getCalldataLength(AuthRegistryArtifact, '_set_authorized'),
        onlySelf: true,
        rejectNullMsgSender: true,
      },
      // AuthRegistry: needed for authwit support via public path (PublicFeePaymentMethod calls set_authorized directly)
      {
        address: ProtocolContractAddress.AuthRegistry,
        selector: setAuthorizedSelector,
        calldataLength: getCalldataLength(AuthRegistryArtifact, 'set_authorized'),
        rejectNullMsgSender: true,
      },
      // FeeJuice: needed for claiming on the same tx as a spend (claim_and_end_setup enqueues this)
      {
        address: ProtocolContractAddress.FeeJuice,
        selector: increaseBalanceSelector,
        calldataLength: getCalldataLength(FeeJuiceArtifact, '_increase_public_balance'),
        onlySelf: true,
      },
      // Token: needed for private transfers via FPC (transfer_to_public enqueues this)
      {
        classId: tokenClassId,
        selector: increaseBalanceSelector,
        calldataLength: getCalldataLength(TokenContractArtifact, '_increase_public_balance'),
        onlySelf: true,
      },
      // Token: needed for public transfers via FPC (fee_entrypoint_public enqueues this)
      {
        classId: tokenClassId,
        selector: transferInPublicSelector,
        calldataLength: getCalldataLength(TokenContractArtifact, 'transfer_in_public'),
      },
    ];
  }
  return defaultAllowedSetupFunctions;
}

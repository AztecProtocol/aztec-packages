import { type Logger } from '@aztec/foundation/log';

import { BaseError, ContractFunctionRevertedError } from 'viem';

export function prettyLogVeimError(err: any, logger: Logger) {
  if (err instanceof BaseError) {
    const revertError = err.walk(err => err instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      const errorName = revertError.data?.errorName ?? '';
      const args =
        revertError.metaMessages && revertError.metaMessages?.length > 1 ? revertError.metaMessages[1].trimStart() : '';
      logger.debug(`canProposeAtTime failed with "${errorName}${args}"`);
    }
  }
}

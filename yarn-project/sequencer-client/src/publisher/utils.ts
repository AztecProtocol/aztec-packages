import { type Logger } from '@aztec/foundation/log';

import { BaseError, ContractFunctionRevertedError } from 'viem';

export function prettyLogViemErrorMsg(err: any) {
  if (err instanceof BaseError) {
    const revertError = err.walk(err => err instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      const errorName = revertError.data?.errorName ?? '';
      const args =
        revertError.metaMessages && revertError.metaMessages?.length > 1 ? revertError.metaMessages[1].trimStart() : '';
      return `${errorName}${args}`;
    }
  }
}

// TODO(palla/log): Review this method
export function prettyLogViemError(err: any, logger: Logger) {
  const msg = prettyLogViemErrorMsg(err);
  if (msg) {
    logger.debug(`canProposeAtTime failed with "${msg}"`);
  }
}

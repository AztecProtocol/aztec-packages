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
  return err?.message ?? err;
}

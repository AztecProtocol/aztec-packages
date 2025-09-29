import type { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { ErrorsAbi } from '@aztec/l1-artifacts/ErrorsAbi';

import {
  type Abi,
  BaseError,
  type ContractEventName,
  ContractFunctionRevertedError,
  type DecodeEventLogReturnType,
  type Hex,
  type Log,
  decodeErrorResult,
  decodeEventLog,
} from 'viem';

export interface L2Claim {
  claimSecret: Fr;
  claimAmount: Fr;
  messageHash: Hex;
  messageLeafIndex: bigint;
}

export class FormattedViemError extends Error {
  metaMessages?: any[];

  constructor(message: string, metaMessages?: any[]) {
    super(message);
    this.name = 'FormattedViemError';
    this.metaMessages = metaMessages;
  }
}

export function extractEvent<
  const TAbi extends Abi | readonly unknown[],
  TEventName extends ContractEventName<TAbi>,
  TEventType = DecodeEventLogReturnType<TAbi, TEventName, Hex[], undefined, true>,
>(
  logs: Log[],
  address: Hex,
  abi: TAbi,
  eventName: TEventName,
  filter?: (log: TEventType) => boolean,
  logger?: Logger,
): TEventType {
  const event = tryExtractEvent(logs, address, abi, eventName, filter, logger);
  if (!event) {
    throw new Error(`Failed to find matching event ${eventName} for contract ${address}`);
  }
  return event;
}

export function tryExtractEvent<
  const TAbi extends Abi | readonly unknown[],
  TEventName extends ContractEventName<TAbi>,
  TEventType = DecodeEventLogReturnType<TAbi, TEventName, Hex[], undefined, true>,
>(
  logs: Log[],
  address: Hex,
  abi: TAbi,
  eventName: TEventName,
  filter?: (log: TEventType) => boolean,
  logger?: Logger,
): TEventType | undefined {
  for (const log of logs) {
    if (log.address.toLowerCase() === address.toLowerCase()) {
      try {
        const decodedEvent = decodeEventLog({ abi, ...log });
        if (decodedEvent.eventName === eventName) {
          const matchingEvent = decodedEvent as TEventType;
          if (!filter || filter(matchingEvent)) {
            return matchingEvent;
          }
        }
      } catch (err) {
        logger?.warn(`Failed to decode event log for contract ${address}: ${err}`);
      }
    }
  }
}

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

function getNestedErrorData(error: unknown): string | undefined {
  // If nothing, bail
  if (!error) {
    return undefined;
  }

  // If it's an object with a `data` property, return it
  // (Remember to check TS type-safely or cast as needed)
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const possibleData = (error as any).data;
    if (typeof possibleData === 'string' && possibleData.startsWith('0x')) {
      return possibleData;
    }
  }

  // If it has a `cause`, recurse
  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return getNestedErrorData((error as any).cause);
  }

  // Not found
  return undefined;
}

/**
 * Formats a Viem error into a FormattedViemError instance.
 * @param error - The error to format.
 * @param abi - The ABI to use for decoding.
 * @returns A FormattedViemError instance.
 */
export function formatViemError(error: any, abi: Abi = ErrorsAbi): FormattedViemError {
  // If error is already a FormattedViemError, return it as is
  if (error instanceof FormattedViemError) {
    return error;
  }

  // First try to decode as a custom error using the ABI
  try {
    const data = getNestedErrorData(error);
    if (data) {
      // Try to decode the error data using the ABI
      const decoded = decodeErrorResult({
        abi,
        data: data as Hex,
      });
      if (decoded) {
        return new FormattedViemError(`${decoded.errorName}(${decoded.args?.join(', ') ?? ''})`, error?.metaMessages);
      }
    }

    // If it's a BaseError, try to get the custom error through ContractFunctionRevertedError
    if (error instanceof BaseError) {
      const revertError = error.walk(err => err instanceof ContractFunctionRevertedError);

      if (revertError instanceof ContractFunctionRevertedError) {
        let errorName = revertError.data?.errorName;
        if (!errorName) {
          errorName = revertError.signature ?? '';
        }
        const args =
          revertError.metaMessages && revertError.metaMessages?.length > 1
            ? revertError.metaMessages[1].trimStart()
            : '';
        return new FormattedViemError(`${errorName}${args}`, error?.metaMessages);
      }
    }
  } catch {
    // If decoding fails, we fall back to the original formatting
  }

  // Strip ABI from the error object before formatting
  if (error && typeof error === 'object') {
    // Create a clone to avoid modifying the original
    const errorClone = structuredClone(error);

    // Helper function to recursively remove ABI properties

    // Strip ABIs from the clone
    stripAbis(errorClone);

    // Use the cleaned clone for further processing
    error = errorClone;
  }

  // If it's a regular Error instance, return it with its message
  if (error instanceof Error) {
    return new FormattedViemError(error.message, (error as any)?.metaMessages);
  }

  const body = String(error);
  const length = body.length;
  // LogExplorer can only render up to 2500 characters in it's summary view. Try to keep the whole message below this number
  // Limit the error to 2000 chacaters in order to allow code higher up to decorate this error with extra details (up to 500 characters)
  if (length > 2000) {
    const chunk = 950;
    const truncated = length - 2 * chunk;
    return new FormattedViemError(
      body.slice(0, chunk) + `...${truncated} characters truncated...` + body.slice(-1 * chunk),
    );
  }

  return new FormattedViemError(body);
}

function stripAbis(obj: any) {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  // Delete ABI property at current level
  if ('abi' in obj) {
    delete obj.abi;
  }

  // Process cause property
  if (obj.cause) {
    stripAbis(obj.cause);
  }

  // Process arrays and objects
  Object.values(obj).forEach(value => {
    if (value && typeof value === 'object') {
      stripAbis(value);
    }
  });
}

export function tryGetCustomErrorName(err: any) {
  try {
    // See https://viem.sh/docs/contract/simulateContract#handling-custom-errors
    if (err.name === 'ViemError' || err.name === 'ContractFunctionExecutionError') {
      const baseError = err as BaseError;
      const revertError = baseError.walk(err => (err as Error).name === 'ContractFunctionRevertedError');
      if (revertError) {
        return (revertError as ContractFunctionRevertedError).data?.errorName;
      }
    }
  } catch {
    return undefined;
  }
}

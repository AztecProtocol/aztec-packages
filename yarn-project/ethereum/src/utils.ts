import { type Fr } from '@aztec/foundation/fields';
import { type Logger } from '@aztec/foundation/log';
import { ErrorsAbi } from '@aztec/l1-artifacts';

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

function tryExtractEvent<
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
  } catch (decodeErr) {
    // If decoding fails, we fall back to the original formatting
  }

  // If it's a regular Error instance, return it with its message
  if (error instanceof Error) {
    return error;
  }

  // Original formatting logic for non-custom errors
  const truncateHex = (hex: string, length = 100) => {
    if (!hex || typeof hex !== 'string') {
      return hex;
    }
    if (!hex.startsWith('0x')) {
      return hex;
    }
    if (hex.length <= length * 2) {
      return hex;
    }
    return `${hex.slice(0, length)}...${hex.slice(-length)}`;
  };

  const formatRequestBody = (body: string) => {
    try {
      const parsed = JSON.parse(body);

      // Recursively process all parameters that might contain hex strings
      const processParams = (obj: any): any => {
        if (Array.isArray(obj)) {
          return obj.map(item => processParams(item));
        }
        if (typeof obj === 'object' && obj !== null) {
          const result: any = {};
          for (const [key, value] of Object.entries(obj)) {
            result[key] = processParams(value);
          }
          return result;
        }
        if (typeof obj === 'string') {
          if (obj.startsWith('0x')) {
            return truncateHex(obj);
          }
        }
        return obj;
      };

      // Process the entire request body
      const processed = processParams(parsed);
      return JSON.stringify(processed, null, 2);
    } catch {
      return body;
    }
  };

  const truncateHexStringsInText = (text: string): string => {
    const hexRegex = /\b0x[a-fA-F0-9]{10,}/g;
    return text.replace(hexRegex, hex => truncateHex(hex));
  };

  const extractAndFormatRequestBody = (message: string): string => {
    // First handle Request body JSON
    const requestBodyRegex = /Request body: ({[\s\S]*?})\n/g;
    let result = message.replace(requestBodyRegex, (match, body) => {
      return `Request body: ${formatRequestBody(body)}\n`;
    });

    // Then handle Arguments section
    const argsRegex = /((?:Request |Estimate Gas )?Arguments:[\s\S]*?(?=\n\n|$))/g;
    result = result.replace(argsRegex, section => {
      const lines = section.split('\n');
      const processedLines = lines.map(line => {
        // Check if line contains a colon followed by content
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const [prefix, content] = [line.slice(0, colonIndex + 1), line.slice(colonIndex + 1).trim()];
          // If content contains a hex string, truncate it
          if (content.includes('0x')) {
            const hexMatches = content.match(/0x[a-fA-F0-9]+/g) || [];
            let processedContent = content;
            hexMatches.forEach(hex => {
              processedContent = processedContent.replace(hex, truncateHex(hex));
            });
            return `${prefix} ${processedContent}`;
          }
        }
        return line;
      });
      return processedLines.join('\n');
    });

    // Finally, catch any remaining hex strings in the message
    result = truncateHexStringsInText(result);

    return result;
  };

  const formattedRes = extractAndFormatRequestBody(error?.message || String(error));

  return new FormattedViemError(formattedRes.replace(/\\n/g, '\n'), error?.metaMessages);
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
  } catch (_e) {
    return undefined;
  }
}

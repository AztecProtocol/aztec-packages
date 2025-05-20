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
  } catch {
    // If decoding fails, we fall back to the original formatting
  }

  // Strip ABI from the error object before formatting
  if (error && typeof error === 'object') {
    // Create a clone to avoid modifying the original
    const errorClone = structuredClone(error);

    // Helper function to recursively remove ABI properties
    const stripAbis = (obj: any) => {
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
    };

    // Strip ABIs from the clone
    stripAbis(errorClone);

    // Use the cleaned clone for further processing
    error = errorClone;
  }

  // If it's a regular Error instance, return it with its message
  if (error instanceof Error) {
    return new FormattedViemError(error.message, (error as any)?.metaMessages);
  }

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
    // For extremely large hex strings, use more aggressive truncation
    if (hex.length > 10000) {
      return `${hex.slice(0, length)}...<${hex.length - length * 2} chars omitted>...${hex.slice(-length)}`;
    }
    return `${hex.slice(0, length)}...${hex.slice(-length)}`;
  };

  const replaceHexStrings = (
    text: string,
    options: {
      minLength?: number;
      maxLength?: number;
      truncateLength?: number;
      pattern?: RegExp;
      transform?: (hex: string) => string;
    } = {},
  ): string => {
    const {
      minLength = 10,
      maxLength = Infinity,
      truncateLength = 100,
      pattern,
      transform = hex => truncateHex(hex, truncateLength),
    } = options;

    const hexRegex = pattern ?? new RegExp(`(0x[a-fA-F0-9]{${minLength},${maxLength}})`, 'g');
    return text.replace(hexRegex, match => transform(match));
  };

  const formatRequestBody = (body: string) => {
    try {
      // Special handling for eth_sendRawTransaction
      if (body.includes('"method":"eth_sendRawTransaction"')) {
        try {
          const parsed = JSON.parse(body);
          if (parsed.params && Array.isArray(parsed.params) && parsed.params.length > 0) {
            // These are likely large transaction hex strings
            parsed.params = parsed.params.map((param: any) => {
              if (typeof param === 'string' && param.startsWith('0x') && param.length > 1000) {
                return truncateHex(param, 200);
              }
              return param;
            });
          }
          return JSON.stringify(parsed, null, 2);
        } catch {
          // If specific parsing fails, fall back to regex-based truncation
          return replaceHexStrings(body, {
            pattern: /"params":\s*\[\s*"(0x[a-fA-F0-9]{1000,})"\s*\]/g,
            transform: hex => `"params":["${truncateHex(hex, 200)}"]`,
          });
        }
      }

      // For extremely large request bodies, use simple truncation instead of parsing
      if (body.length > 50000) {
        const jsonStart = body.indexOf('{');
        const jsonEnd = body.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          return replaceHexStrings(body, { minLength: 10000, truncateLength: 200 });
        }
      }

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
      // If JSON parsing fails, do a simple truncation of any large hex strings
      return replaceHexStrings(body, { minLength: 1000, truncateLength: 150 });
    }
  };

  const extractAndFormatRequestBody = (message: string): string => {
    // First check if message is extremely large and contains very large hex strings
    if (message.length > 50000) {
      message = replaceHexStrings(message, { minLength: 10000, truncateLength: 200 });
    }

    // Add a specific check for RPC calls with large params
    if (message.includes('"method":"eth_sendRawTransaction"')) {
      message = replaceHexStrings(message, {
        pattern: /"params":\s*\[\s*"(0x[a-fA-F0-9]{1000,})"\s*\]/g,
        transform: hex => `"params":["${truncateHex(hex, 200)}"]`,
      });
    }

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
            const processedContent = replaceHexStrings(content);
            return `${prefix} ${processedContent}`;
          }
        }
        return line;
      });
      return processedLines.join('\n');
    });

    // Finally, catch any remaining hex strings in the message
    result = replaceHexStrings(result);

    return result;
  };

  // Extract the actual error message and highlight it for clarity
  let formattedRes = extractAndFormatRequestBody(error?.message || String(error));

  let errorDetail = '';
  // Look for specific details in known locations
  if (error) {
    // Check for details property which often has the most specific error message
    if (typeof error.details === 'string' && error.details) {
      errorDetail = error.details;
    }
    // Check for shortMessage which is often available in Viem errors
    else if (typeof error.shortMessage === 'string' && error.shortMessage) {
      errorDetail = error.shortMessage;
    }
  }

  // If we found a specific error detail, format it clearly
  if (errorDetail) {
    // Look for key sections of the formatted result to replace with highlighted error
    let replaced = false;

    // Try to find the Details: section
    const detailsMatch = formattedRes.match(/Details: ([^\n]+)/);
    if (detailsMatch) {
      formattedRes = formattedRes.replace(detailsMatch[0], `Details: *${errorDetail}*`);
      replaced = true;
    }

    // If we didn't find a Details section, add the error at the beginning
    if (!replaced) {
      formattedRes = `Error: *${errorDetail}*\n\n${formattedRes}`;
    }
  }

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
  } catch {
    return undefined;
  }
}

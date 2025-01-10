import { type Fr } from '@aztec/foundation/fields';
import { type Logger } from '@aztec/foundation/log';

import {
  type Abi,
  BaseError,
  type ContractEventName,
  ContractFunctionRevertedError,
  type DecodeEventLogReturnType,
  type Hex,
  type Log,
  decodeEventLog,
} from 'viem';

export interface L2Claim {
  claimSecret: Fr;
  claimAmount: Fr;
  messageHash: Hex;
  messageLeafIndex: bigint;
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

export function formatViemError(error: any): string {
  const truncateHex = (hex: string, length = 10) => {
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
    const hexRegex = /0x[a-fA-F0-9]{10,}/g;
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

  return JSON.stringify({ error: extractAndFormatRequestBody(error?.message || String(error)) }, null, 2).replace(
    /\\n/g,
    '\n',
  );
}

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
    if (hex.length <= length * 2) {
      return hex;
    }
    return `${hex.slice(0, length)}...${hex.slice(-length)}`;
  };

  const formatRequestBody = (body: string) => {
    try {
      const parsed = JSON.parse(body);
      if (parsed.params && Array.isArray(parsed.params)) {
        parsed.params = parsed.params.map((param: any) => (typeof param === 'string' ? truncateHex(param) : param));
      }
      return JSON.stringify(parsed, null, 2);
    } catch {
      return truncateHex(body);
    }
  };

  const errorChain = [];
  if (error instanceof BaseError) {
    error.walk((err: any) => {
      const errorInfo: any = {
        name: err.name,
        message: err.shortMessage || err.message,
      };

      // Extract request arguments if present
      const argsMatch = err.message?.match(/Request Arguments:\n([\s\S]*?)(?:\n\nDetails:|$)/);
      if (argsMatch) {
        errorInfo.args = argsMatch[1]
          .split('\n')
          .map((line: string) => line.trim())
          .filter(Boolean);
      }

      // Extract details if present
      const detailsMatch = err.message?.match(/Details: (.*?)(?:\nVersion:|$)/);
      if (detailsMatch) {
        errorInfo.details = detailsMatch[1];
      }

      // Process request body if present
      if (err.metaMessages?.some((msg: string) => msg.includes('Request body:'))) {
        const requestBody = err.metaMessages
          .find((msg: string) => msg.includes('Request body:'))
          ?.replace('Request body:', '')
          .trim();
        if (requestBody) {
          errorInfo.requestBody = formatRequestBody(requestBody);
        }
      }

      if (err.code) {
        errorInfo.code = err.code;
      }

      errorChain.push(errorInfo);
      return false;
    });
  } else {
    // Handle non-BaseError
    errorChain.push({
      message: error?.message || String(error),
      details: error?.details,
      code: error?.code,
    });
  }

  return JSON.stringify(clean({ errorChain }), null, 2);
}

const clean = (obj: any) => {
  Object.keys(obj).forEach(key => {
    if (obj[key] === undefined) {
      delete obj[key];
    }
  });
  return obj;
};

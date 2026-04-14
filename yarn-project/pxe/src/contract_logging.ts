import type { Fr } from '@aztec/foundation/curves/bn254';
import { type LogLevel, type Logger, applyStringFormatting, createLogger } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DebugLog } from '@aztec/stdlib/logs';

/** Resolves a contract address to a human-readable name, if available. */
export type ContractNameResolver = (address: AztecAddress) => Promise<string | undefined>;
export type CONTRACT_LOG_KIND = 'aztecnr' | 'user';

/**
 * Creates a logger whose output is prefixed with `contract:<name>(<addrAbbrev>)`.
 */
export async function createContractLogger(
  contractAddress: AztecAddress,
  getContractName: ContractNameResolver,
  kind: CONTRACT_LOG_KIND,
  options?: { instanceId?: string },
): Promise<Logger> {
  const addrAbbrev = contractAddress.toString().slice(0, 10);
  const name = await getContractName(contractAddress);

  const prefix = kind == 'aztecnr' ? 'aztecnr' : 'contract';
  const module = name ? `${prefix}:${name}(${addrAbbrev})` : `${prefix}:Unknown(${addrAbbrev})`;
  return createLogger(module, options);
}

/**
 * Formats and emits a single contract log message through the given logger.
 */
export function logContractMessage(logger: Logger, level: LogLevel, message: string, fields: Fr[]): void {
  logger[level](applyStringFormatting(message, fields));
}

/**
 * Displays debug logs collected during public function simulation,
 * using the `contract:` prefixed logger format.
 */
export async function displayDebugLogs(debugLogs: DebugLog[], getContractName: ContractNameResolver): Promise<void> {
  for (const log of debugLogs) {
    const { kind, message } = stripAztecnrLogPrefix(log.message);
    const logger = await createContractLogger(log.contractAddress, getContractName, kind);
    logContractMessage(logger, log.level, message, log.fields);
  }
}

export function stripAztecnrLogPrefix(message: string): { kind: CONTRACT_LOG_KIND; message: string } {
  if (message.startsWith('[aztec-nr] ')) {
    return { kind: 'aztecnr', message: message.slice('[aztec-nr] '.length) };
  } else {
    return { kind: 'user', message };
  }
}

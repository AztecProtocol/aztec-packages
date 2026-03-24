import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { AztecNode } from '@aztec/aztec.js/node';
import { getFeeJuiceBalance } from '@aztec/aztec.js/utils';
import { prettyPrintJSON } from '@aztec/cli/cli-utils';
import type { LogFn } from '@aztec/foundation/log';

const FEE_JUICE_DECIMALS = 18;
const FEE_JUICE_UNIT = 10n ** BigInt(FEE_JUICE_DECIMALS);

/** Formats a raw FeeJuice balance (18 decimals) for human-readable display. */
function formatFeeJuice(raw: bigint, exact: boolean): string {
  const whole = raw / FEE_JUICE_UNIT;
  const fractional = raw % FEE_JUICE_UNIT;
  const fracStr = fractional.toString().padStart(FEE_JUICE_DECIMALS, '0');
  if (exact) {
    return `${whole}.${fracStr} FJ`;
  }
  if (fractional === 0n) {
    return `${whole} FJ`;
  }
  return `${whole}.${fracStr.replace(/0+$/, '')} FJ`;
}

export async function getFeeJuiceBalanceCmd(
  node: AztecNode,
  address: AztecAddress,
  json: boolean,
  exact: boolean,
  log: LogFn,
) {
  const balance = await getFeeJuiceBalance(address, node);
  if (json) {
    log(prettyPrintJSON({ address: address.toString(), balance: balance.toString() }));
  } else {
    log(`Fee Juice balance for ${address.toString()}: ${formatFeeJuice(balance, exact)}`);
  }
}

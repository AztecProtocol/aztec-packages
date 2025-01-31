import { type AccountWallet, type FeePaymentMethod, type PXE, type SendMethodOptions } from '@aztec/aztec.js';
import { AztecAddress, Fr, Gas, GasFees, GasSettings } from '@aztec/circuits.js';
import { type LogFn } from '@aztec/foundation/log';

import { Option } from 'commander';

import { type WalletDB } from '../../storage/wallet_db.js';
import { aliasedAddressParser } from './options.js';

export type CliFeeArgs = {
  estimateGasOnly: boolean;
  gasLimits?: string;
  payment?: string;
  maxFeesPerGas?: string;
  maxPriorityFeesPerGas?: string;
  estimateGas?: boolean;
};

export interface IFeeOpts {
  estimateOnly: boolean;
  gasSettings: GasSettings;
  toSendOpts(sender: AccountWallet): Promise<SendMethodOptions>;
}

export function printGasEstimates(
  feeOpts: IFeeOpts,
  gasEstimates: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>,
  log: LogFn,
) {
  log(`Estimated gas usage:    ${formatGasEstimate(gasEstimates)}`);
  log(`Maximum total tx fee:   ${getEstimatedCost(gasEstimates, feeOpts.gasSettings.maxFeesPerGas)}`);
}

function formatGasEstimate(estimate: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>) {
  return `da=${estimate.gasLimits.daGas},l2=${estimate.gasLimits.l2Gas},teardownDA=${estimate.teardownGasLimits.daGas},teardownL2=${estimate.teardownGasLimits.l2Gas}`;
}

function getEstimatedCost(estimate: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>, maxFeesPerGas: GasFees) {
  return GasSettings.default({ ...estimate, maxFeesPerGas })
    .getFeeLimit()
    .toBigInt();
}

export class FeeOpts implements IFeeOpts {
  constructor(
    public estimateOnly: boolean,
    public gasSettings: GasSettings,
    private paymentMethodFactory: (sender: AccountWallet) => Promise<FeePaymentMethod>,
    private estimateGas: boolean,
  ) {}

  async toSendOpts(sender: AccountWallet): Promise<SendMethodOptions> {
    return {
      fee: {
        estimateGas: this.estimateGas,
        gasSettings: this.gasSettings,
        paymentMethod: await this.paymentMethodFactory(sender),
      },
    };
  }

  static paymentMethodOption() {
    return new Option(
      '--payment <method=name,asset=address,fpc=address,claimSecret=string,claimAmount=string,feeRecipient=string>',
      'Fee payment method and arguments. Valid methods are: none, fee_juice, fpc-public, fpc-private.',
    );
  }

  static getOptions() {
    return [
      new Option('--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>', 'Gas limits for the tx.'),
      FeeOpts.paymentMethodOption(),
      new Option('--max-fees-per-gas <da=100,l2=100>', 'Maximum fees per gas unit for DA and L2 computation.'),
      new Option(
        '--max-priority-fees-per-gas <da=0,l2=0>',
        'Maximum priority fees per gas unit for DA and L2 computation.',
      ),
      new Option('--no-estimate-gas', 'Whether to automatically estimate gas limits for the tx.'),
      new Option('--estimate-gas-only', 'Only report gas estimation for the tx, do not send it.'),
    ];
  }

  static async fromCli(args: CliFeeArgs, pxe: PXE, log: LogFn, db?: WalletDB) {
    const estimateOnly = args.estimateGasOnly;
    const gasLimits = args.gasLimits ? parseGasLimits(args.gasLimits) : {};
    const maxFeesPerGas = args.maxFeesPerGas ? parseGasFees(args.maxFeesPerGas) : await pxe.getCurrentBaseFees();
    const maxPriorityFeesPerGas = args.maxPriorityFeesPerGas ? parseGasFees(args.maxPriorityFeesPerGas) : undefined;
    const gasSettings = GasSettings.default({
      ...gasLimits,
      maxFeesPerGas,
      maxPriorityFeesPerGas,
    });

    if (!args.gasLimits && !args.payment) {
      return new NoFeeOpts(estimateOnly, gasSettings);
    }

    const defaultPaymentMethod = async () => {
      const { NoFeePaymentMethod } = await import('@aztec/aztec.js/fee');
      return new NoFeePaymentMethod();
    };

    return new FeeOpts(
      estimateOnly,
      gasSettings,
      args.payment ? parsePaymentMethod(args.payment, log, db) : defaultPaymentMethod,
      !!args.estimateGas,
    );
  }
}

class NoFeeOpts implements IFeeOpts {
  constructor(public estimateOnly: boolean, public gasSettings: GasSettings) {}

  toSendOpts(): Promise<SendMethodOptions> {
    return Promise.resolve({});
  }
}

export function parsePaymentMethod(
  payment: string,
  log: LogFn,
  db?: WalletDB,
): (sender: AccountWallet) => Promise<FeePaymentMethod> {
  const parsed = payment.split(',').reduce((acc, item) => {
    const [dimension, value] = item.split('=');
    acc[dimension] = value ?? 1;
    return acc;
  }, {} as Record<string, string>);

  const getFpcOpts = (parsed: Record<string, string>, db?: WalletDB) => {
    if (!parsed.fpc) {
      throw new Error('Missing "fpc" in payment option');
    }
    if (!parsed.asset) {
      throw new Error('Missing "asset" in payment option');
    }

    const fpc = aliasedAddressParser('contracts', parsed.fpc, db);

    return [AztecAddress.fromString(parsed.asset), fpc];
  };

  return async (sender: AccountWallet) => {
    switch (parsed.method) {
      case 'none': {
        log('Using no fee payment');
        const { NoFeePaymentMethod } = await import('@aztec/aztec.js/fee');
        return new NoFeePaymentMethod();
      }
      case 'native': {
        if (parsed.claim || (parsed.claimSecret && parsed.claimAmount && parsed.messageLeafIndex)) {
          let claimAmount, claimSecret, messageLeafIndex;
          if (parsed.claim && db) {
            ({
              amount: claimAmount,
              secret: claimSecret,
              leafIndex: messageLeafIndex,
            } = await db.popBridgedFeeJuice(sender.getAddress(), log));
          } else {
            ({ claimAmount, claimSecret, messageLeafIndex } = parsed);
          }
          log(`Using Fee Juice for fee payments with claim for ${claimAmount} tokens`);
          const { FeeJuicePaymentMethodWithClaim } = await import('@aztec/aztec.js/fee');
          return new FeeJuicePaymentMethodWithClaim(sender.getAddress(), {
            claimAmount: (typeof claimAmount === 'string'
              ? Fr.fromHexString(claimAmount)
              : new Fr(claimAmount)
            ).toBigInt(),
            claimSecret: Fr.fromHexString(claimSecret),
            messageLeafIndex: BigInt(messageLeafIndex),
          });
        } else {
          log(`Using Fee Juice for fee payment`);
          const { FeeJuicePaymentMethod } = await import('@aztec/aztec.js/fee');
          return new FeeJuicePaymentMethod(sender.getAddress());
        }
      }
      case 'fpc-public': {
        const [asset, fpc] = getFpcOpts(parsed, db);
        log(`Using public fee payment with asset ${asset} via paymaster ${fpc}`);
        const { PublicFeePaymentMethod } = await import('@aztec/aztec.js/fee');
        return new PublicFeePaymentMethod(fpc, sender);
      }
      case 'fpc-private': {
        const [asset, fpc] = getFpcOpts(parsed, db);
        log(`Using private fee payment with asset ${asset} via paymaster ${fpc}`);
        const { PrivateFeePaymentMethod } = await import('@aztec/aztec.js/fee');
        return new PrivateFeePaymentMethod(fpc, sender);
      }
      case undefined:
        throw new Error('Missing "method" in payment option');
      default:
        throw new Error(`Invalid fee payment method: ${payment}`);
    }
  };
}

function parseGasLimits(gasLimits: string): { gasLimits: Gas; teardownGasLimits: Gas } {
  const parsed = gasLimits.split(',').reduce((acc, limit) => {
    const [dimension, value] = limit.split('=');
    acc[dimension] = parseInt(value, 10);
    return acc;
  }, {} as Record<string, number>);

  const expected = ['da', 'l2', 'teardownDA', 'teardownL2'];
  for (const dimension of expected) {
    if (!(dimension in parsed)) {
      throw new Error(`Missing gas limit for ${dimension}`);
    }
  }

  return {
    gasLimits: new Gas(parsed.da, parsed.l2),
    teardownGasLimits: new Gas(parsed.teardownDA, parsed.teardownL2),
  };
}

export function parseGasFees(gasFees: string): GasFees {
  const parsed = gasFees.split(',').reduce((acc, fee) => {
    const [dimension, value] = fee.split('=');
    acc[dimension] = parseInt(value, 10);
    return acc;
  }, {} as Record<string, number>);

  const expected = ['da', 'l2'];
  for (const dimension of expected) {
    if (!(dimension in parsed)) {
      throw new Error(`Missing gas fee for ${dimension}`);
    }
  }

  return new GasFees(parsed.da, parsed.l2);
}

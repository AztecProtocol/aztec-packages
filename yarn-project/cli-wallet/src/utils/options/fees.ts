import {
  type AccountWallet,
  type DeployAccountOptions,
  FeeJuicePaymentMethod,
  type FeePaymentMethod,
  type PXE,
  type SendMethodOptions,
} from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import type { LogFn } from '@aztec/foundation/log';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';

import { Option } from 'commander';

import type { WalletDB } from '../../storage/wallet_db.js';
import { createOrRetrieveAccount } from '../accounts.js';
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
  toDeployAccountOpts(sender: AccountWallet): Promise<DeployAccountOptions>;
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

async function parseGasSettings(args: CliFeeArgs, pxe: PXE) {
  const gasLimits = args.gasLimits ? parseGasLimits(args.gasLimits) : {};
  const maxFeesPerGas = args.maxFeesPerGas ? parseGasFees(args.maxFeesPerGas) : await pxe.getCurrentBaseFees();
  const maxPriorityFeesPerGas = args.maxPriorityFeesPerGas ? parseGasFees(args.maxPriorityFeesPerGas) : undefined;
  return GasSettings.default({
    ...gasLimits,
    maxFeesPerGas,
    maxPriorityFeesPerGas,
  });
}

type OptionParams = {
  [key: string]: { type: string; description?: string; default?: string };
};

function printOptionParams(params: OptionParams) {
  const paramsWithDescription = Object.keys(params).filter(name => params[name].description);
  const maxParamWidth = paramsWithDescription.reduce((v, name) => Math.max(v, name.length), 0);
  const indent = (size: number) => ''.padEnd(size, ' ');
  const descriptionList = paramsWithDescription.map(name =>
    [
      `${indent(5)}${name}${indent(maxParamWidth - name.length)}  ${params[name].description}`,
      params[name].default ? `Default: ${params[name].default}` : '',
    ].join(' '),
  );
  return descriptionList.length
    ? `\n   Parameters:\n${descriptionList.join('\n')}\nFormat: --payment ${Object.keys(params)
        .slice(0, 3)
        .map(name => `${name}=${params[name].type}`)} ${Object.keys(params).length > 3 ? '...' : ''}`
    : '';
}

function getFeePaymentMethodParams(allowCustomFeePayer: boolean): OptionParams {
  const feePayer = allowCustomFeePayer ? { type: 'address', description: 'The account paying the fee.' } : undefined;
  return {
    method: {
      type: 'name',
      description: 'Valid values: "fee_juice", "fpc-public", "fpc-private", "fpc-sponsored"',
      default: 'fee_juice',
    },
    ...(feePayer ? { feePayer } : {}),
    asset: {
      type: 'address',
      description: 'The asset used for fee payment. Required for "fpc-public" and "fpc-private".',
    },
    fpc: {
      type: 'address',
      description: 'The FPC contract that pays in fee juice. Not required for the "fee_juice" method.',
    },
    claim: {
      type: 'boolean',
      description: 'Whether to use a previously stored claim to bridge fee juice.',
    },
    claimSecret: {
      type: 'string',
      description: 'The secret to claim fee juice on L1.',
    },
    claimAmount: {
      type: 'bigint',
      description: 'The amount of fee juice to be claimed.',
    },
    messageLeafIndex: {
      type: 'bigint',
      description: 'The index of the claim in the l1toL2Message tree.',
    },
    feeRecipient: {
      type: 'string',
      description: 'Recipient of the fee.',
    },
  };
}

function getPaymentMethodOption(allowCustomFeePayer: boolean) {
  const params = getFeePaymentMethodParams(allowCustomFeePayer);
  return new Option(`--payment <options>`, `Fee payment method and arguments.${printOptionParams(params)}`);
}

function getFeeOptions(allowCustomFeePayer: boolean) {
  return [
    getPaymentMethodOption(allowCustomFeePayer),
    new Option('--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>', 'Gas limits for the tx.'),
    new Option('--max-fees-per-gas <da=100,l2=100>', 'Maximum fees per gas unit for DA and L2 computation.'),
    new Option(
      '--max-priority-fees-per-gas <da=0,l2=0>',
      'Maximum priority fees per gas unit for DA and L2 computation.',
    ),
    new Option('--estimate-gas', 'Whether to automatically estimate gas limits for the tx.'),
    new Option('--estimate-gas-only', 'Only report gas estimation for the tx, do not send it.'),
  ];
}

export class FeeOpts implements IFeeOpts {
  constructor(
    public estimateOnly: boolean,
    public gasSettings: GasSettings,
    private paymentMethodFactory: (sender: AccountWallet) => Promise<FeePaymentMethod>,
    private getDeployWallet: (
      sender: AccountWallet,
      paymentMethod: FeePaymentMethod,
    ) => Promise<AccountWallet | undefined>,
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

  async toDeployAccountOpts(sender: AccountWallet): Promise<DeployAccountOptions> {
    const paymentMethod = await this.paymentMethodFactory(sender);
    const deployWallet = await this.getDeployWallet(sender, paymentMethod);
    return {
      deployWallet,
      fee: {
        estimateGas: this.estimateGas,
        gasSettings: this.gasSettings,
        paymentMethod,
      },
    };
  }

  static paymentMethodOption() {
    return getPaymentMethodOption(false);
  }

  static getOptions() {
    return getFeeOptions(false);
  }

  static async fromCli(args: CliFeeArgs, pxe: PXE, log: LogFn, db?: WalletDB) {
    const estimateOnly = args.estimateGasOnly;
    const gasSettings = await parseGasSettings(args, pxe);

    const defaultPaymentMethod = async (sender: AccountWallet) => {
      const { FeeJuicePaymentMethod } = await import('@aztec/aztec.js/fee');
      return new FeeJuicePaymentMethod(sender.getAddress());
    };

    const getDeployWallet = () => {
      // Returns undefined. The sender's wallet will be used by default.
      return Promise.resolve(undefined);
    };

    return new FeeOpts(
      estimateOnly,
      gasSettings,
      args.payment ? parsePaymentMethod(args.payment, false, log, db) : defaultPaymentMethod,
      getDeployWallet,
      !!args.estimateGas,
    );
  }
}

export class FeeOptsWithFeePayer extends FeeOpts {
  static override paymentMethodOption() {
    return getPaymentMethodOption(true);
  }

  static override getOptions() {
    return getFeeOptions(true);
  }

  static override async fromCli(args: CliFeeArgs, pxe: PXE, log: LogFn, db?: WalletDB) {
    const estimateOnly = args.estimateGasOnly;
    const gasSettings = await parseGasSettings(args, pxe);

    const defaultPaymentMethod = async (sender: AccountWallet) => {
      const { FeeJuicePaymentMethod } = await import('@aztec/aztec.js/fee');
      return new FeeJuicePaymentMethod(sender.getAddress());
    };

    const getDeployWallet = async (sender: AccountWallet, paymentMethod: FeePaymentMethod) => {
      if (paymentMethod instanceof FeeJuicePaymentMethod) {
        const feePayer = await paymentMethod.getFeePayer();
        if (!sender.getAddress().equals(feePayer)) {
          return (await createOrRetrieveAccount(pxe, feePayer, db)).getWallet();
        }
      }
      return undefined;
    };

    return new FeeOptsWithFeePayer(
      estimateOnly,
      gasSettings,
      args.payment ? parsePaymentMethod(args.payment, true, log, db) : defaultPaymentMethod,
      getDeployWallet,
      !!args.estimateGas,
    );
  }
}

export function parsePaymentMethod(
  payment: string,
  allowCustomFeePayer: boolean,
  log: LogFn,
  db?: WalletDB,
): (sender: AccountWallet) => Promise<FeePaymentMethod> {
  const parsed = payment.split(',').reduce(
    (acc, item) => {
      const [dimension, value] = item.split('=');
      acc[dimension] = value ?? 1;
      return acc;
    },
    {} as Record<string, string>,
  );

  const getFpc = () => {
    if (!parsed.fpc) {
      throw new Error('Missing "fpc" in payment option');
    }
    return aliasedAddressParser('contracts', parsed.fpc, db);
  };

  const getAsset = () => {
    if (!parsed.asset) {
      throw new Error('Missing "asset" in payment option');
    }
    return AztecAddress.fromString(parsed.asset);
  };

  return async (sender: AccountWallet) => {
    switch (parsed.method) {
      case 'fee_juice': {
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
          return new FeeJuicePaymentMethodWithClaim(sender, {
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
          const feePayer =
            parsed.feePayer && allowCustomFeePayer
              ? aliasedAddressParser('accounts', parsed.feePayer, db)
              : sender.getAddress();
          return new FeeJuicePaymentMethod(feePayer);
        }
      }
      case 'fpc-public': {
        const fpc = getFpc();
        const asset = getAsset();
        log(`Using public fee payment with asset ${asset} via paymaster ${fpc}`);
        const { PublicFeePaymentMethod } = await import('@aztec/aztec.js/fee');
        return new PublicFeePaymentMethod(fpc, sender);
      }
      case 'fpc-private': {
        const fpc = getFpc();
        const asset = getAsset();
        log(`Using private fee payment with asset ${asset} via paymaster ${fpc}`);
        const { PrivateFeePaymentMethod } = await import('@aztec/aztec.js/fee');
        return new PrivateFeePaymentMethod(fpc, sender);
      }
      case 'fpc-sponsored': {
        const sponsor = getFpc();
        log(`Using sponsored fee payment with sponsor ${sponsor}`);
        const { SponsoredFeePaymentMethod } = await import('@aztec/aztec.js/fee/testing');
        return new SponsoredFeePaymentMethod(sponsor);
      }
      case undefined:
        throw new Error('Missing "method" in payment option');
      default:
        throw new Error(`Invalid fee payment method: ${payment}`);
    }
  };
}

function parseGasLimits(gasLimits: string): { gasLimits: Gas; teardownGasLimits: Gas } {
  const parsed = gasLimits.split(',').reduce(
    (acc, limit) => {
      const [dimension, value] = limit.split('=');
      acc[dimension] = parseInt(value, 10);
      return acc;
    },
    {} as Record<string, number>,
  );

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
  const parsed = gasFees.split(',').reduce(
    (acc, fee) => {
      const [dimension, value] = fee.split('=');
      acc[dimension] = parseInt(value, 10);
      return acc;
    },
    {} as Record<string, number>,
  );

  const expected = ['da', 'l2'];
  for (const dimension of expected) {
    if (!(dimension in parsed)) {
      throw new Error(`Missing gas fee for ${dimension}`);
    }
  }

  return new GasFees(parsed.da, parsed.l2);
}

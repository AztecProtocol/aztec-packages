import type { L1TxRequest, ViemClient } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { SlashFactoryAbi } from '@aztec/l1-artifacts/SlashFactoryAbi';

import { type GetContractReturnType, type Hex, encodeFunctionData, getContract } from 'viem';

import {
  OffenseToBigInt,
  type SlashPayload,
  type ValidatorSlash,
  type ValidatorSlashOffense,
  bigIntToOffense,
} from '../slashing/types.js';

export class SlashFactoryContract {
  private readonly logger = createLogger('ethereum:contracts:slash_factory');
  private readonly contract: GetContractReturnType<typeof SlashFactoryAbi, ViemClient>;

  constructor(
    public readonly client: ViemClient,
    address: Hex,
  ) {
    this.contract = getContract({ address, abi: SlashFactoryAbi, client });
  }

  public get address() {
    return EthAddress.fromString(this.contract.address);
  }

  public buildCreatePayloadRequest(slashes: ValidatorSlash[]): L1TxRequest {
    const sorted = [...slashes].sort((a, b) => a.validator.toString().localeCompare(b.validator.toString()));

    return {
      to: this.contract.address,
      data: encodeFunctionData({
        abi: SlashFactoryAbi,
        functionName: 'createSlashPayload',
        args: [
          sorted.map(d => d.validator.toString()),
          sorted.map(d => d.amount),
          sorted.map(d => d.offenses.map(packValidatorSlashOffense)),
        ],
      }),
    };
  }

  public getSlashPayloadFromEvents(
    payloadAddress: EthAddress,
    round: bigint,
  ): Promise<Omit<SlashPayload, 'votes'> | undefined> {
    throw new Error('Method not implemented.');
  }

  public async getAddressAndIsDeployed(
    slashes: ValidatorSlash[],
  ): Promise<{ address: EthAddress; salt: Hex; isDeployed: boolean }> {
    const [address, salt, isDeployed] = await this.contract.read.getAddressAndIsDeployed([
      slashes.map(s => s.validator.toString()),
      slashes.map(s => s.amount),
      slashes.map(s => s.offenses.map(packValidatorSlashOffense)),
    ]);
    return { address: EthAddress.fromString(address), salt, isDeployed };
  }
}

export function packValidatorSlashOffense(offense: ValidatorSlashOffense): bigint {
  const offenseId = OffenseToBigInt[offense.offenseType];
  if (offenseId > (1 << 8) - 1) {
    throw new Error(`Offense type ${offense.offenseType} cannot be packed into 8 bits`);
  }
  return (offenseId << 120n) + offense.epochOrSlot;
}

export function unpackValidatorSlashOffense(packed: bigint): ValidatorSlashOffense {
  const offenseId = (packed >> 120n) & 0xffn;
  const epochOrSlot = packed & ((1n << 120n) - 1n);
  const offenseType = bigIntToOffense(offenseId);
  return { epochOrSlot, offenseType };
}

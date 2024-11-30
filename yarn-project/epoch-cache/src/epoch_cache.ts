
import { getEpochNumberAtTimestamp, getSlotNumberAtTimestamp } from "@aztec/circuit-types";
import { EthAddress } from "@aztec/foundation/eth-address";
import { HttpTransport, PublicClient, Chain } from "viem";
import { RollupContract } from "@aztec/ethereum";

type EpochAndSlot = {
    epoch: bigint;
    slot: bigint;
    ts: bigint;
}

export class EpochCache {
    private validators: Map<EthAddress, boolean>;

    private currentEpoch: bigint;

    private rollup: RollupContract;

    constructor(
        private publicClient: PublicClient<HttpTransport, Chain>,
        private rollupAddress: EthAddress,
        private l1GenesisTime: bigint,
        private aztecEpochDuration: number,
        private aztecSlotDuration: number,
    ){
        this.validators = new Map<EthAddress, boolean>();

        this.currentEpoch = getEpochNumberAtTimestamp(BigInt(Math.floor(Date.now() / 1000)), {
            l1GenesisTime: this.l1GenesisTime,
            epochDuration: this.aztecEpochDuration,
            slotDuration: this.aztecSlotDuration
        });

        this.rollup = new RollupContract(this.publicClient, this.rollupAddress.toString());
    }

    getEpochAndSlotNow(): EpochAndSlot {
        const now = BigInt(Math.floor(Date.now() / 1000));
        return this.getEpochAndSlotAtTimestamp(now);
    }

    getEpochAndSlotAtTimestamp(ts: bigint): EpochAndSlot {
        return {
            epoch: getEpochNumberAtTimestamp(ts, {
                l1GenesisTime: this.l1GenesisTime,
                epochDuration: this.aztecEpochDuration,
                slotDuration: this.aztecSlotDuration
            }),
            slot: getSlotNumberAtTimestamp(ts, {
                l1GenesisTime: this.l1GenesisTime,
                epochDuration: this.aztecEpochDuration,
                slotDuration: this.aztecSlotDuration
            }),
            ts,
        }
    }

    async getValidatorSet(): Promise<EthAddress[]> {
        // If the current epoch has changed, then we need to make a request to update the validator set
        const { epoch: currentEpoch, ts } = this.getEpochAndSlotNow();

        if (currentEpoch !== this.currentEpoch) {
            this.currentEpoch = currentEpoch;
            const validatorSet = await this.rollup.read.getCommitteeAt(ts);
            this.validators = new Map(validatorSet.map((v: `0x${string}`) => [EthAddress.fromString(v), true]));
        }

        return Array.from(this.validators.keys());
    }

    async getCurrentValidator(): Promise<EthAddress> {
        // Validators are sorted by their index in the committee, and getValidatorSet will cache
        // TODO: should we get the timestamp from the underlying l1 node?
        const { slot: currentSlot } = this.getEpochAndSlotNow();
        const validators = await this.getValidatorSet();

        return validators[Number(currentSlot) % validators.length];
    }

    async isInCommittee(validator: EthAddress): Promise<boolean> {
        const validators = await this.getValidatorSet();
        return validators.includes(validator);
    }
}

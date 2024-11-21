import { getEpochNumberAtTimestamp } from "@aztec/circuit-types";
import { EthAddress } from "@aztec/foundation/eth-address";
import { Chain } from "viem";
import { HttpTransport } from "viem";
import { PublicClient } from "viem";
import { RollupAbi } from "@aztec/l1-artifacts";
import { GetContractReturnType, getContract } from "viem";


export class EpochCache {
    private validators: Map<EthAddress, boolean>;

    private currentEpoch: bigint;

    private rollup: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, Chain>>;

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


        this.rollup = getContract({
            address: rollupAddress.toString(),
            abi: RollupAbi,
            client: this.publicClient,
        });
    }


    async getValidatorSet(): Promise<EthAddress[]> {
        // If the current epoch has changed, then we need to make a request to update the validator set
        const ts = BigInt(Math.floor(Date.now() / 1000));
        const currentEpoch = getEpochNumberAtTimestamp(ts, {
            l1GenesisTime: this.l1GenesisTime,
            epochDuration: this.aztecEpochDuration,
            slotDuration: this.aztecSlotDuration
        });

        if (currentEpoch !== this.currentEpoch) {
            this.currentEpoch = currentEpoch;
            const validatorSet = await this.rollup.read.getCommitteeAt(ts);
            this.validators = new Map(validatorSet.map(v => [EthAddress.fromString(v), true]));
        }

        return Array.from(this.validators.keys());
    }
}

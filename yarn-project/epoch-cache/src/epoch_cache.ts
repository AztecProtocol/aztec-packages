
import { getEpochNumberAtTimestamp, getSlotAtTimestamp, type L1RollupConstants, EmptyL1RollupConstants } from "@aztec/circuit-types";
import { EthAddress } from "@aztec/foundation/eth-address";
import { HttpTransport, PublicClient, Chain, http, createPublicClient } from "viem";
import { createEthereumChain, getL1ContractsConfigEnvVars, getL1ReaderConfigFromEnv, RollupContract } from "@aztec/ethereum";

type EpochAndSlot = {
    epoch: bigint;
    slot: bigint;
    ts: bigint;
}

export class EpochCache {
    private validators: Map<EthAddress, boolean>;
    private currentEpoch: bigint;

    constructor(
        private rollup: RollupContract,
        private readonly l1constants: L1RollupConstants = EmptyL1RollupConstants,
    ){
        this.validators = new Map<EthAddress, boolean>();

        this.currentEpoch = getEpochNumberAtTimestamp(BigInt(Math.floor(Date.now() / 1000)), this.l1constants);
    }

    // TODO: cleanup and merge rollup getters with l1 createAndSync in the archiver
    static async create(rollupAddress: EthAddress) {
        const l1ReaderConfig = getL1ReaderConfigFromEnv();
        const l1constants = getL1ContractsConfigEnvVars();

        const chain = createEthereumChain(l1ReaderConfig.l1RpcUrl, l1ReaderConfig.l1ChainId);
        const publicClient = createPublicClient({
            chain: chain.chainInfo,
            transport: http(chain.rpcUrl),
            pollingInterval: l1ReaderConfig.viemPollingIntervalMS,
        });

        const rollup = new RollupContract(publicClient, rollupAddress.toString());
        const [l1StartBlock, l1GenesisTime] = await Promise.all([
            rollup.getL1StartBlock(),
            rollup.getL1GenesisTime(),
        ] as const);

        const l1RollupConstants: L1RollupConstants = {
            l1StartBlock,
            l1GenesisTime,
            slotDuration: l1constants.aztecSlotDuration,
            epochDuration: l1constants.aztecEpochDuration,
            ethereumSlotDuration: l1constants.ethereumSlotDuration,
        }

        return new EpochCache(rollup, l1RollupConstants);
    }

    getEpochAndSlotNow(): EpochAndSlot {
        const now = BigInt(Math.floor(Date.now() / 1000));
        return this.getEpochAndSlotAtTimestamp(now);
    }

    getEpochAndSlotAtTimestamp(ts: bigint): EpochAndSlot {
        return {
            epoch: getEpochNumberAtTimestamp(ts, this.l1constants),
            slot: getSlotAtTimestamp(ts, this.l1constants),
            ts,
        }
    }

    async getValidatorSet(): Promise<EthAddress[]> {
        // If the current epoch has changed, then we need to make a request to update the validator set
        const { epoch: currentEpoch, ts } = this.getEpochAndSlotNow();

        if (currentEpoch !== this.currentEpoch) {
            this.currentEpoch = currentEpoch;
            const validatorSet = await this.rollup.getCommitteeAt(ts);
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

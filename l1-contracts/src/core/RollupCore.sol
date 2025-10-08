// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {
  IRollupCore, RollupStore, SubmitEpochRootProofArgs, RollupConfigInput
} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {IValidatorSelectionCore} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {RollupOperationsExtLib} from "@aztec/core/libraries/rollup/RollupOperationsExtLib.sol";
import {ValidatorOperationsExtLib} from "@aztec/core/libraries/rollup/ValidatorOperationsExtLib.sol";
import {RewardDeploymentExtLib} from "@aztec/core/libraries/rollup/RewardDeploymentExtLib.sol";
import {TallySlasherDeploymentExtLib} from "@aztec/core/libraries/rollup/TallySlasherDeploymentExtLib.sol";
import {EmpireSlasherDeploymentExtLib} from "@aztec/core/libraries/rollup/EmpireSlasherDeploymentExtLib.sol";
import {SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {EthValue, FeeLib} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {ProposeArgs} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {STFLib, GenesisState} from "@aztec/core/libraries/rollup/STFLib.sol";
import {StakingLib} from "@aztec/core/libraries/rollup/StakingLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {ISlasher} from "@aztec/core/slashing/Slasher.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {EIP712} from "@oz/utils/cryptography/EIP712.sol";
import {RewardLib, RewardConfig} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {FeeConfigLib, CompressedFeeConfig} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {ChainTipsLib, CompressedChainTips} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";

/**
 * @title RollupCore
 * @author Aztec Labs
 * @notice Core Aztec rollup contract that manages the L2 blockchain state, validator selection, and proof verification.
 *
 * @dev This is the main contract in the Aztec system that handles:
 *      - Block proposals from sequencers/proposers
 *      - Epoch proof submission and verification
 *      - Chain pruning and invalidation mechanisms
 *      - Validator and committee management
 *      - Fee collection and reward distribution
 *
 *      The rollup operates on a time-based model:
 *      - Time is divided into slots (configurable duration, e.g., 12 seconds)
 *      - Slots are grouped into epochs (configurable size, e.g., 32 slots)
 *      - Each slot has one designated proposer from the validator set
 *      - Each block is expected to include attestations from committee members
 *      - There is one committee per epoch
 *
 *      Key invariants:
 *      - The L2 chain is linear (no forks) but can be rolled back
 *        - New blocks must build on the state of the current pending block
 *      - Blocks with invalid attestations can be removed via the invalidation mechanism
 *      - Unproven blocks are pruned if no proof is submitted in time
 *
 * @dev Due to contract size limitations, not all functionality can be implemented in a single contract, so features
 *      are split across multiple ExtRollup external libraries.
 *
 * @dev System Roles
 *
 *      1) Validators: Node operators who have staked the staking asset and actively participate in block building.
 *         They form the pool from which committee members and proposers are selected.
 *
 *      2) Committee Members: Drafted from the validator set and remain stable throughout an epoch.
 *         A block requires >2/3rds of the committee for the epoch to be considered valid. These attestations serve two
 *         purposes:
 *         - Attest to data availability for transaction data not posted on L1, which is required by provers to generate
 *           epoch proofs
 *         - Re-execute everything and attest to the resulting state root, acting as training wheels for the public
 *           part of the system (proving systems used in public and AVM)
 *
 *      3) Proposers: Drafted from the validator set (currently proposers are part of the committee for the epoch,
 *         though this may change). They have exclusive rights to propose a block at a given slot, ensuring orderly
 *         block production without competition.
 *
 *      4) Provers: Generate validity proofs for the state transitions of blocks in an epoch. No need to stake to be a
 *         prover. They have access to large amounts of compute.
 *
 * @dev Block Building Flow
 *
 *      Relevant functions:
 *      - `propose`: Called by the proposer to submit a new block
 *      - `submitEpochRootProof`: Called by the prover to submit a proof of the epoch's state transitions
 *      - `invalidateBadAttestation`: Called to remove blocks with invalid attestations
 *      - `invalidateInsufficientAttestations`: Called to remove blocks with insufficient valid attestations
 *      - `prune`: Called to remove unproven blocks after the proof submission window has expired
 *      - `setupEpoch`: Called to initialize the validator selection for the next epoch
 *
 *      The block building flow is as follows:
 *
 *      - At each L2 slot a single proposer is chosen from the validator set who assembles a block that:
 *         - Builds on top of the last pending block (tips.pending) in the rollup
 *         - Includes state transitions, messages, and fee calculations
 *         - Is attested by >2/3 of the committee members
 *      - The L2 block is posted to L1 via the `propose` function
 *         - The pending chain tip advances to the new block
 *         - State is updated (message trees, archives, etc.)
 *      - After the epoch has ended, a prover generates a proof of the valid state transition for a prefix of blocks in
 *        the epoch
 *         - Most often the prefix will be all the blocks, but "partial epochs" can also be proven for faster message
 *           transmission
 *         - The proof is submitted via `submitEpochRootProof` and must be submitted within the configured proof
 *           submission window
 *         - Upon successful proof submission the proven chain tip advances to the last block in the proven prefix if it
 *           is past the current proven tip, otherwise the tip remain unchanged
 *         - It is possible to submit multiple proofs for the same epoch (or prefixes of it)
 *         - Provers of longest prefix shares the proving rewards
 *      - Proving a block makes it finalized from the perspective of L1
 *         - This triggers reward and fee accounting for the sequencers and provers of the epoch
 *         - And pushes messages to the outbox for L1 processing
 *
 *      Unhappy path for invalid attestations:
 *      - Attestations in blocks are not validated onchain to save gas. Since attestations are still posted to L1,
 *        nodes are expected to verify them offchain, and skip a block if its attestations are invalid.
 *      - If a block has invalid attestation signatures, anyone can call `invalidateBadAttestation()`
 *      - If a block has insufficient valid attestations (<= 2/3 of committee), anyone can call
 *        `invalidateInsufficientAttestations()`
 *      - While anyone can call invalidation functions, it is expected that the next proposer will do so, and if they
 *        fail to do so, then other committee members do, and if they fail to do so, then any validator will do so.
 *      - Upon invalidation, the invalid block and all subsequent blocks are removed from the chain, so the pending
 *        chain tip reverts to the block immediately before the invalid one.
 *       - Note that only unproven blocks can be invalidated, as proven blocks are final and cannot be reverted.
 *
 *      Unhappy path for missing proofs:
 *      - Each epoch has a proof submission window (configured via aztecProofSubmissionEpochs).
 *      - If no proof is submitted within the window, it is assumed that the epoch cannot be proven due to missing data,
 *        so the entire pending chain all the way back to the last proven block is pruned. This is done by calling
 *        `prune()` manually, or automatically on the next proposal.
 *      - The committee for the epoch is expected to disseminate transaction data to allow proving, so a prune is
 *        considered a slashable offense, that causes validators to vote for slashing the committee of the unproven
 *        epoch.
 *      - When the pending chain is pruned, all unproven blocks are removed from the pending chain, and the chain
 *        resumes from the last proven block.
 *
 * @dev Slashing Mechanism
 *
 *      Slashing is a critical security mechanism that penalizes validators who misbehave or fail to fulfill their
 *      duties. Slashing occurs for both safety violations (e.g., invalid attestations) and liveness failures
 *      (e.g., missing proofs). The slashing process is governance-based and operates through a signalling mechanism:
 *
 *      - When nodes detect validator misbehavior, they create a payload for slashing the offending validators
 *      - The payload is submitted to the SlashingProposer contract, which keeps track of signalling rounds
 *      - Each block proposer signals on a slashing payload during their assigned slot
 *      - If the payload receives sufficient signals (reaches the configured quorum) within a round, it may be submitted
 *        for execution by the Slasher after a configured delay.
 *      - The Slasher has a Vetoer specified in the constructor, which can veto the payload if it is deemed to be
 *        invalid.
 *      - Once submitted to the Slasher, if the payload is not Vetoed, the offending validators are slashed, meaning
 *        their staked assets are reduced by the slashing amount
 *      - If a validator's stake falls below the minimum required amount due to slashing, they are automatically
 *        removed from the validator set
 *
 *      Conditions that cause nodes to vote for slashing a validator:
 *      1. Validators that fail to fulfill their duties:
 *         - Committee members who fail to attest to blocks when required
 *      2. Committee members of an unproven epoch where either:
 *         - The data for the epoch is not available
 *         - The the epoch was provable but no proof was submitted
 *      3. Proposers of invalid blocks or committee members who attest to blocks built on top of invalid ones:
 *         - Proposing blocks with invalid state transitions
 *         - Proposing blocks with invalid attestations
 *         - Attesting to blocks that build upon known invalid blocks (e.g. invalid attestations)
 *         - This ensures the integrity of the chain by penalizing those who contribute to invalid blocks
 */
contract RollupCore is EIP712("Aztec Rollup", "1"), Ownable, IStakingCore, IValidatorSelectionCore, IRollupCore {
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using FeeConfigLib for CompressedFeeConfig;
  using ChainTipsLib for CompressedChainTips;

  /**
   * @notice The L1 block number when this rollup was deployed
   * @dev Used when synching the node as starting block for event watching
   */
  uint256 public immutable L1_BLOCK_AT_GENESIS;

  /**
   * @dev Storage gap to ensure checkBlob is in its own storage slot
   */
  uint256 private gap = 0;

  /**
   * @notice Flag to enable/disable blob verification during simulations
   * @dev Always true, gets unset only via state overrides during offchain simulations or in tests
   */
  bool public checkBlob = true;

  /**
   * @notice Flag controlling whether rewards can be claimed
   */
  bool public isRewardsClaimable = false;

  /**
   * @notice Initializes the Aztec rollup with all required configurations
   * @dev Sets up time parameters, deploys auxiliary contracts (slasher, reward booster),
   *      initializes staking, validator selection, and creates inbox/outbox contracts
   * @param _feeAsset The ERC20 token used for transaction fees
   * @param _stakingAsset The ERC20 token used for validator staking
   * @param _gse The Governance Staking Escrow contract
   * @param _epochProofVerifier The honk verifier contract for root epoch proofs
   * @param _governance The address with owner privileges
   * @param _genesisState Initial state containing VK tree root, protocol contracts hash, and genesis archive
   * @param _config Comprehensive configuration including timing, staking, slashing, and reward parameters
   */
  constructor(
    IERC20 _feeAsset,
    IERC20 _stakingAsset,
    GSE _gse,
    IVerifier _epochProofVerifier,
    address _governance,
    GenesisState memory _genesisState,
    RollupConfigInput memory _config
  ) Ownable(_governance) {
    // We do not allow the `normalFlushSizeMin` to be 0 when deployed as it would lock deposits (which is never desired
    // from the onset). It might be updated later to 0 by governance in order to close the validator set for this
    // instance. For details see `StakingLib.getEntryQueueFlushSize` function.
    require(_config.stakingQueueConfig.normalFlushSizeMin > 0, Errors.Staking__InvalidStakingQueueConfig());
    require(_config.stakingQueueConfig.normalFlushSizeQuotient > 0, Errors.Staking__InvalidNormalFlushSizeQuotient());

    TimeLib.initialize(
      block.timestamp, _config.aztecSlotDuration, _config.aztecEpochDuration, _config.aztecProofSubmissionEpochs
    );

    Timestamp exitDelay = Timestamp.wrap(_config.exitDelaySeconds);

    // Deploy slasher based on flavor
    ISlasher slasher;

    // We call one external library or another based on the slasher flavor
    // This allows us to keep the slash flavors in separate external libraries so we do not exceed max contract size
    // Note that we do not deploy a slasher if we run with no committees (i.e. targetCommitteeSize == 0)
    if (_config.targetCommitteeSize == 0 || _config.slasherFlavor == SlasherFlavor.NONE) {
      slasher = ISlasher(address(0));
    } else if (_config.slasherFlavor == SlasherFlavor.TALLY) {
      slasher = TallySlasherDeploymentExtLib.deployTallySlasher(
        address(this),
        _config.slashingVetoer,
        _governance,
        _config.slashingQuorum,
        _config.slashingRoundSize,
        _config.slashingLifetimeInRounds,
        _config.slashingExecutionDelayInRounds,
        _config.slashAmounts,
        _config.targetCommitteeSize,
        _config.aztecEpochDuration,
        _config.slashingOffsetInRounds,
        _config.slashingDisableDuration
      );
    } else {
      slasher = EmpireSlasherDeploymentExtLib.deployEmpireSlasher(
        address(this),
        _config.slashingVetoer,
        _governance,
        _config.slashingQuorum,
        _config.slashingRoundSize,
        _config.slashingLifetimeInRounds,
        _config.slashingExecutionDelayInRounds,
        _config.slashingDisableDuration
      );
    }

    StakingLib.initialize(
      _stakingAsset, _gse, exitDelay, address(slasher), _config.stakingQueueConfig, _config.localEjectionThreshold
    );
    ValidatorOperationsExtLib.initializeValidatorSelection(_config.targetCommitteeSize, _config.lagInEpochs);

    // If no booster is specifically provided, deploy one.
    if (address(_config.rewardConfig.booster) == address(0)) {
      _config.rewardConfig.booster = RewardDeploymentExtLib.deployRewardBooster(_config.rewardBoostConfig);
    }

    RewardLib.setConfig(_config.rewardConfig);

    L1_BLOCK_AT_GENESIS = block.number;

    STFLib.initialize(_genesisState);
    RollupStore storage rollupStore = STFLib.getStorage();

    rollupStore.config.feeAsset = _feeAsset;
    rollupStore.config.epochProofVerifier = _epochProofVerifier;

    uint32 version = _config.version;
    rollupStore.config.version = version;

    IInbox inbox = IInbox(address(new Inbox(address(this), _feeAsset, version, Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT)));

    rollupStore.config.inbox = inbox;

    rollupStore.config.outbox = IOutbox(address(new Outbox(address(this), version)));

    rollupStore.config.feeAssetPortal = IFeeJuicePortal(inbox.getFeeAssetPortal());

    FeeLib.initialize(_config.manaTarget, _config.provingCostPerMana);
  }

  /**
   * @notice Updates the reward configuration for sequencers and provers
   * @dev Only callable by the contract owner. Updates how rewards are calculated and distributed.
   * @param _config The new reward configuration including rates and booster settings
   */
  function setRewardConfig(RewardConfig memory _config) external override(IRollupCore) onlyOwner {
    RewardLib.setConfig(_config);
    emit RewardConfigUpdated(_config);
  }

  /**
   * @notice Updates the target mana (computational units) per slot
   * @dev Only callable by owner. The new target must be greater than or equal to the current target
   *      to avoid the ability for governance to use it directly to kill an old rollup.
   *      Mana is the unit of computational work in Aztec.
   * @param _manaTarget The new target mana per slot
   */
  function updateManaTarget(uint256 _manaTarget) external override(IRollupCore) onlyOwner {
    uint256 currentManaTarget = FeeLib.getStorage().config.getManaTarget();
    require(_manaTarget >= currentManaTarget, Errors.Rollup__InvalidManaTarget(currentManaTarget, _manaTarget));
    FeeLib.updateManaTarget(_manaTarget);

    // If we are going from 0 to non-zero mana limits, we need to catch up the inbox
    if (currentManaTarget == 0 && _manaTarget > 0) {
      RollupStore storage rollupStore = STFLib.getStorage();
      rollupStore.config.inbox.catchUp(rollupStore.tips.getPendingBlockNumber());
    }

    emit IRollupCore.ManaTargetUpdated(_manaTarget);
  }

  /**
   * @notice Enables or disables reward claiming
   * @dev Only callable by owner. This is a safety mechanism to control when rewards can be withdrawn.
   * @param _isRewardsClaimable True to enable reward claims, false to disable
   */
  function setRewardsClaimable(bool _isRewardsClaimable) external override(IRollupCore) onlyOwner {
    isRewardsClaimable = _isRewardsClaimable;
    emit RewardsClaimableUpdated(_isRewardsClaimable);
  }

  /**
   * @notice Updates the slasher contract address
   * @dev Only callable by owner. The slasher handles punishment for validator misbehavior.
   * @param _slasher The address of the new slasher contract
   */
  function setSlasher(address _slasher) external override(IStakingCore) onlyOwner {
    ValidatorOperationsExtLib.setSlasher(_slasher);
  }

  /**
   * @notice Updates the local ejection threshold
   * @dev Only callable by owner. The local ejection threshold is the minimum amount of stake that a validator can have
   *      after being slashed.
   * @param _localEjectionThreshold The new local ejection threshold
   */
  function setLocalEjectionThreshold(uint256 _localEjectionThreshold) external override(IStakingCore) onlyOwner {
    ValidatorOperationsExtLib.setLocalEjectionThreshold(_localEjectionThreshold);
  }

  /**
   * @notice Updates the cost of proving per unit of mana
   * @dev Only callable by owner. This affects how proving costs are calculated in the fee model.
   * @param _provingCostPerMana The cost in ETH per unit of mana for proving
   */
  function setProvingCostPerMana(EthValue _provingCostPerMana) external override(IRollupCore) onlyOwner {
    FeeLib.updateProvingCostPerMana(_provingCostPerMana);
  }

  /**
   * @notice Updates the configuration for the staking entry queue
   * @dev Only callable by owner. Controls how validators enter the active set.
   * @param _config New configuration including queue size limits and timing parameters
   */
  function updateStakingQueueConfig(StakingQueueConfig memory _config) external override(IStakingCore) onlyOwner {
    ValidatorOperationsExtLib.updateStakingQueueConfig(_config);
  }

  /**
   * @notice Claims accumulated rewards for a sequencer (block proposer)
   * @dev Rewards must be enabled via isRewardsClaimable. Transfers all accumulated rewards to the recipient.
   * @param _coinbase The address that has accumulated the rewards - rewards are sent to this address
   * @return The amount of rewards claimed
   */
  function claimSequencerRewards(address _coinbase) external override(IRollupCore) returns (uint256) {
    require(isRewardsClaimable, Errors.Rollup__RewardsNotClaimable());
    return RewardLib.claimSequencerRewards(_coinbase);
  }

  /**
   * @notice Claims prover rewards for specified epochs
   * @dev Rewards must be enabled. Provers earn rewards for successfully proving epoch transitions.
   *      Each epoch can only be claimed once per prover.
   * @param _coinbase The address that has accumulated the rewards - rewards are sent to this address
   * @param _epochs Array of epochs to claim rewards for
   * @return The total amount of rewards claimed
   */
  function claimProverRewards(address _coinbase, Epoch[] memory _epochs)
    external
    override(IRollupCore)
    returns (uint256)
  {
    require(isRewardsClaimable, Errors.Rollup__RewardsNotClaimable());
    return RewardLib.claimProverRewards(_coinbase, _epochs);
  }

  /**
   * @notice Allows the rollup itself to vote on governance proposals
   * @dev This enables the rollup to participate in governance by voting on proposals.
   *      See StakingLib.sol for more details on the voting mechanism.
   * @param _proposalId The ID of the proposal to vote on
   */
  function vote(uint256 _proposalId) external override(IStakingCore) {
    ValidatorOperationsExtLib.vote(_proposalId);
  }

  /**
   * @notice Deposits stake to become a validator
   * @dev The caller must have approved the staking asset. Validators enter a queue before becoming active.
   * @param _attester The address that will act as the validator (sign attestations)
   * @param _withdrawer The address that can withdraw the stake
   * @param _publicKeyInG1 The G1 point for the BLS public key (used for efficient signature verification in GSE)
   * @param _publicKeyInG2 The G2 point for the BLS public key (used for BLS aggregation and pairing operations in GSE)
   * @param _proofOfPossession The proof of possession to show that the keys in G1 and G2 share secret key
   * @param _moveWithLatestRollup Whether to follow the chain if governance migrates to a new rollup version
   */
  function deposit(
    address _attester,
    address _withdrawer,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession,
    bool _moveWithLatestRollup
  ) external override(IStakingCore) {
    ValidatorOperationsExtLib.deposit(
      _attester, _withdrawer, _publicKeyInG1, _publicKeyInG2, _proofOfPossession, _moveWithLatestRollup
    );
  }

  /**
   * @notice Processes the validator entry queue to add new validators to the active set
   * @dev Can be called by anyone. The number of validators added is limited by queue configuration.
   *      This helps maintain a controlled growth rate of the validator set.
   * @param _toAdd - The max number the caller will try to add
   */
  function flushEntryQueue(uint256 _toAdd) external override(IStakingCore) {
    ValidatorOperationsExtLib.flushEntryQueue(_toAdd);
  }

  function flushEntryQueue() external override(IStakingCore) {
    ValidatorOperationsExtLib.flushEntryQueue(type(uint256).max);
  }

  /**
   * @notice Initiates withdrawal of a validator's stake
   * @dev Starts the exit delay period. The validator is immediately removed from the active set.
   *      Only the registered withdrawer can initiate withdrawal.
   * @param _attester The validator address to withdraw
   * @param _recipient The address to receive the withdrawn stake
   * @return True if withdrawal was initiated, false if already initiated
   */
  function initiateWithdraw(address _attester, address _recipient) external override(IStakingCore) returns (bool) {
    return ValidatorOperationsExtLib.initiateWithdraw(_attester, _recipient);
  }

  /**
   * @notice Completes a withdrawal after the exit delay has passed
   * @dev Can be called by anyone. Transfers the stake to the designated recipient.
   * @param _attester The validator address whose withdrawal to finalize
   */
  function finalizeWithdraw(address _attester) external override(IStakingCore) {
    ValidatorOperationsExtLib.finalizeWithdraw(_attester);
  }

  /**
   * @notice Slashes a validator's stake for misbehavior
   * @dev Only callable by the authorized slasher contract. Reduces the validator's stake.
   * @param _attester The validator to slash
   * @param _amount The amount of stake to slash
   * @return True if slashing was successful
   */
  function slash(address _attester, uint256 _amount) external override(IStakingCore) returns (bool) {
    return ValidatorOperationsExtLib.slash(_attester, _amount);
  }

  /**
   * @notice Removes unproven blocks from the pending chain
   * @dev Can only be called after the proof submission window has expired for an epoch.
   *      This maintains liveness by preventing the chain from being stuck on unproven blocks.
   *      Pruning occurs at epoch boundaries and removes all blocks in unproven epochs.
   */
  function prune() external override(IRollupCore) {
    RollupOperationsExtLib.prune();
  }

  /**
   * @notice Submits a zero-knowledge proof for an epoch's state transition
   * @dev Proves the validity of a prefix of the blocks in an epoch. Once proven, blocks become final
   *      and cannot be pruned. The proof must be submitted within the submission window.
   *      Successful submission triggers prover rewards.
   * @param _args Contains the epoch range, public inputs, fees, attestations, and the ZK proof
   */
  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args) external override(IRollupCore) {
    RollupOperationsExtLib.submitEpochRootProof(_args);
  }

  /**
   * @notice Proposes a new L2 block to extend the chain
   * @dev Core function for block production.
   *      The attestations must include a signature from designated proposer to be accepted.
   *      The block must build on the previous block and include valid attestations from committee members.
   *      Failed proposals revert; successful ones emit L2BlockProposed and advance the chain state.
   *      See ProposeLib#propose for more details.
   * @param _args Block data including header, state updates, oracle inputs, and archive
   * @param _attestations Aggregated signatures from committee members attesting to block validity
   * @param _signers Addresses of committee members who signed (must match attestations)
   * @param _blobInput Blob commitment data for data availability (format: [numBlobs][48-byte commitments...])
   */
  function propose(
    ProposeArgs calldata _args,
    CommitteeAttestations memory _attestations,
    address[] calldata _signers,
    Signature calldata _attestationsAndSignersSignature,
    bytes calldata _blobInput
  ) external override(IRollupCore) {
    RollupOperationsExtLib.propose(
      _args, _attestations, _signers, _attestationsAndSignersSignature, _blobInput, checkBlob
    );
  }

  /**
   * @notice Invalidates a block due to a bad attestation signature
   * @dev Anyone can call this if they detect an invalid signature. This removes the block
   *      and all subsequent blocks from the pending chain. Used to maintain pending chain integrity.
   * @param _blockNumber The L2 block number to invalidate
   * @param _attestations The attestations that were submitted with the block
   * @param _committee The committee members for the block's epoch
   * @param _invalidIndex The index of the invalid signature in the attestations
   */
  function invalidateBadAttestation(
    uint256 _blockNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee,
    uint256 _invalidIndex
  ) external override(IRollupCore) {
    ValidatorOperationsExtLib.invalidateBadAttestation(_blockNumber, _attestations, _committee, _invalidIndex);
  }

  /**
   * @notice Invalidates a block due to insufficient valid attestations (>2/3 of committee required)
   * @dev Anyone can call this if a block doesn't meet the required attestation threshold.
   *      Even if all signatures are valid, blocks need a minimum number of attestations.
   * @param _blockNumber The L2 block number to invalidate
   * @param _attestations The attestations that were submitted with the block
   * @param _committee The committee members for the block's epoch
   */
  function invalidateInsufficientAttestations(
    uint256 _blockNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee
  ) external override(IRollupCore) {
    ValidatorOperationsExtLib.invalidateInsufficientAttestations(_blockNumber, _attestations, _committee);
  }

  /**
   * @notice Sets up validator selection for the current epoch
   * @dev Can be called by anyone at the start of an epoch. Samples the committee and determines proposers for all
   *      slots in the epoch. Also stores a seed that is used for future sampling. The corresponding library
   *      functionality is automatically called when `RollupCore.propose(...)` is called (via the
   *      `RollupOperationsExtLib.propose(...)` -> `ProposeLib.propose(...)` ->
   *      `ValidatorSelectionLib.setupEpoch(...)`).
   *
   *      If there are missed proposals then setupEpoch does not get called automatically. Since the next committee
   *      selection is computed based on the stored randao and the epoch number, failing to update the randao stored
   *      will keep the committee predictable longer into the future. We would only fail to get a fresh randao if:
   *      1. All the proposals in the epoch were missed
   *      2. Nobody called setupEpoch on the Rollup contract
   *
   *      While an attacker might theoretically benefit from preventing a fresh seed (e.g. by DoSing all proposers),
   *      preventing anyone from calling this function directly is not really feasible. This makes attacks on seed
   *      generation impractical.
   */
  function setupEpoch() external override(IValidatorSelectionCore) {
    ValidatorOperationsExtLib.setupEpoch();
  }

  /**
   * @notice Captures the randao for future validator selection
   * @dev Can be called by anyone. Takes a snapshot of the current randao to ensure unpredictable but deterministic
   *      validator selection. Automatically called from setupEpoch. Can be used as a cheaper alternative to
   *      `setupEpoch` to update the randao checkpoints.
   */
  function checkpointRandao() public override(IValidatorSelectionCore) {
    ValidatorOperationsExtLib.checkpointRandao();
  }

  /**
   * @notice Updates the L1 gas fee oracle with current gas prices
   * @dev Automatically called during block proposal but can be called manually.
   *      Updates the fee model's view of L1 costs to ensure accurate L2 fee pricing.
   *      Uses current L1 gas price and blob gas price for calculations.
   */
  function updateL1GasFeeOracle() public override(IRollupCore) {
    FeeLib.updateL1GasFeeOracle();
  }

  /**
   * @notice Returns the maximum number of validators that can be added from the entry queue
   * @dev Based on queue configuration and current validator set size. Used by flushEntryQueue.
   * @return The number of validators that can be added in the next flush
   */
  function getEntryQueueFlushSize() public view override(IStakingCore) returns (uint256) {
    return ValidatorOperationsExtLib.getEntryQueueFlushSize();
  }

  /**
   * @notice Returns the current number of active validators
   * @dev Active validators can propose blocks and participate in committees
   * @return The count of validators in the active set
   */
  function getActiveAttesterCount() public view override(IStakingCore) returns (uint256) {
    return StakingLib.getAttesterCountAtTime(Timestamp.wrap(block.timestamp));
  }
}

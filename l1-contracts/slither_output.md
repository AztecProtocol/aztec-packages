Summary
 - [uninitialized-local](#uninitialized-local) (2 results) (Medium)
 - [unused-return](#unused-return) (1 results) (Medium)
 - [missing-zero-check](#missing-zero-check) (2 results) (Low)
 - [reentrancy-events](#reentrancy-events) (2 results) (Low)
 - [timestamp](#timestamp) (1 results) (Low)
 - [assembly](#assembly) (2 results) (Informational)
 - [dead-code](#dead-code) (5 results) (Informational)
 - [solc-version](#solc-version) (1 results) (Informational)
 - [similar-names](#similar-names) (3 results) (Informational)
 - [constable-states](#constable-states) (1 results) (Optimization)
## uninitialized-local
Impact: Medium
Confidence: Medium
 - [ ] ID-0
[HeaderLib.decode(bytes).header](src/core/libraries/HeaderLib.sol#L148) is a local variable never initialized

src/core/libraries/HeaderLib.sol#L148


 - [ ] ID-1
[TxsDecoder.decode(bytes).vars](src/core/libraries/decoders/TxsDecoder.sol#L79) is a local variable never initialized

src/core/libraries/decoders/TxsDecoder.sol#L79


## unused-return
Impact: Medium
Confidence: Medium
 - [ ] ID-2
[Rollup.process(bytes,bytes32,bytes,bytes)](src/core/Rollup.sol#L61-L102) ignores return value by [(l2ToL1Msgs) = MessagesDecoder.decode(_body)](src/core/Rollup.sol#L77)

src/core/Rollup.sol#L61-L102


## missing-zero-check
Impact: Low
Confidence: Medium
 - [ ] ID-3
[Inbox.constructor(address,uint256)._rollup](src/core/messagebridge/Inbox.sol#L40) lacks a zero-check on :
		- [ROLLUP = _rollup](src/core/messagebridge/Inbox.sol#L41)

src/core/messagebridge/Inbox.sol#L40


 - [ ] ID-4
[Outbox.constructor(address)._rollup](src/core/messagebridge/Outbox.sol#L31) lacks a zero-check on :
		- [ROLLUP_CONTRACT = _rollup](src/core/messagebridge/Outbox.sol#L32)

src/core/messagebridge/Outbox.sol#L31


## reentrancy-events
Impact: Low
Confidence: Medium
 - [ ] ID-5
Reentrancy in [Inbox.sendL2Message(DataStructures.L2Actor,bytes32,bytes32)](src/core/messagebridge/Inbox.sol#L61-L95):
	External calls:
	- [index = currentTree.insertLeaf(leaf)](src/core/messagebridge/Inbox.sol#L91)
	Event emitted after the call(s):
	- [LeafInserted(inProgress,index,leaf)](src/core/messagebridge/Inbox.sol#L92)

src/core/messagebridge/Inbox.sol#L61-L95


 - [ ] ID-6
Reentrancy in [Rollup.process(bytes,bytes32,bytes,bytes)](src/core/Rollup.sol#L61-L102):
	External calls:
	- [inHash = INBOX.consume()](src/core/Rollup.sol#L91)
	- [OUTBOX.insert(header.globalVariables.blockNumber,header.contentCommitment.outHash,l2ToL1TreeHeight)](src/core/Rollup.sol#L97-L99)
	Event emitted after the call(s):
	- [L2BlockProcessed(header.globalVariables.blockNumber)](src/core/Rollup.sol#L101)

src/core/Rollup.sol#L61-L102


## timestamp
Impact: Low
Confidence: Medium
 - [ ] ID-7
[HeaderLib.validate(HeaderLib.Header,uint256,uint256,bytes32)](src/core/libraries/HeaderLib.sol#L106-L136) uses timestamp for comparisons
	Dangerous comparisons:
	- [_header.globalVariables.timestamp > block.timestamp](src/core/libraries/HeaderLib.sol#L120)

src/core/libraries/HeaderLib.sol#L106-L136


## assembly
Impact: Informational
Confidence: High
 - [ ] ID-8
[MessagesDecoder.decode(bytes)](src/core/libraries/decoders/MessagesDecoder.sol#L60-L142) uses assembly
	- [INLINE ASM](src/core/libraries/decoders/MessagesDecoder.sol#L79-L81)
	- [INLINE ASM](src/core/libraries/decoders/MessagesDecoder.sol#L112-L118)

src/core/libraries/decoders/MessagesDecoder.sol#L60-L142


 - [ ] ID-9
[TxsDecoder.computeRoot(bytes32[])](src/core/libraries/decoders/TxsDecoder.sol#L256-L275) uses assembly
	- [INLINE ASM](src/core/libraries/decoders/TxsDecoder.sol#L263-L265)

src/core/libraries/decoders/TxsDecoder.sol#L256-L275


## dead-code
Impact: Informational
Confidence: Medium
 - [ ] ID-10
[MessageBox.consume(mapping(bytes32 => DataStructures.Entry),bytes32,function(bytes32))](src/core/libraries/MessageBox.sol#L71-L79) is never used and should be removed

src/core/libraries/MessageBox.sol#L71-L79


 - [ ] ID-11
[MessageBox.contains(mapping(bytes32 => DataStructures.Entry),bytes32)](src/core/libraries/MessageBox.sol#L87-L92) is never used and should be removed

src/core/libraries/MessageBox.sol#L87-L92


 - [ ] ID-12
[MessageBox.get(mapping(bytes32 => DataStructures.Entry),bytes32,function(bytes32))](src/core/libraries/MessageBox.sol#L104-L112) is never used and should be removed

src/core/libraries/MessageBox.sol#L104-L112


 - [ ] ID-13
[MessageBox.insert(mapping(bytes32 => DataStructures.Entry),bytes32,uint64,uint32,uint32,function(bytes32,uint64,uint64,uint32,uint32,uint32,uint32))](src/core/libraries/MessageBox.sol#L30-L60) is never used and should be removed

src/core/libraries/MessageBox.sol#L30-L60


 - [ ] ID-14
[Hash.sha256ToField(bytes32)](src/core/libraries/Hash.sol#L52-L54) is never used and should be removed

src/core/libraries/Hash.sol#L52-L54


## solc-version
Impact: Informational
Confidence: High
 - [ ] ID-15
solc-0.8.23 is not recommended for deployment

## similar-names
Impact: Informational
Confidence: Medium
 - [ ] ID-16
Variable [Constants.LOGS_HASHES_NUM_BYTES_PER_BASE_ROLLUP](src/core/libraries/ConstantsGen.sol#L130) is too similar to [Constants.NOTE_HASHES_NUM_BYTES_PER_BASE_ROLLUP](src/core/libraries/ConstantsGen.sol#L123)

src/core/libraries/ConstantsGen.sol#L130


 - [ ] ID-17
Variable [Constants.L1_TO_L2_MESSAGE_LENGTH](src/core/libraries/ConstantsGen.sol#L110) is too similar to [Constants.L2_TO_L1_MESSAGE_LENGTH](src/core/libraries/ConstantsGen.sol#L111)

src/core/libraries/ConstantsGen.sol#L110


 - [ ] ID-18
Variable [Rollup.AVAILABILITY_ORACLE](src/core/Rollup.sol#L34) is too similar to [Rollup.constructor(IRegistry,IAvailabilityOracle)._availabilityOracle](src/core/Rollup.sol#L45)

src/core/Rollup.sol#L34


## constable-states
Impact: Optimization
Confidence: High
 - [ ] ID-19
[Rollup.lastWarpedBlockTs](src/core/Rollup.sol#L43) should be constant 

src/core/Rollup.sol#L43



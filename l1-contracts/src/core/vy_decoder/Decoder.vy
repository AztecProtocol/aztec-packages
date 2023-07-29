# @version ^0.3.7
PRIME_MODULOS: constant(uint256) = 21888242871839275222246405745257275088548364400416034343698204186575808495617

COMMITMENTS_PER_TX: constant(uint256) = 16
NULLIFIERS_PER_TX: constant(uint256) = 16
PUBLIC_DATA_WRITES_PER_TX: constant(uint256) = 4
L2_TO_L1_PER_TX: constant(uint256) = 2
CONTRACTS_PER_TX: constant(uint256) = 1

LOGS_SIZE_PER_TX: constant(uint256) = 64

COMMITMENT_SIZE: constant(uint256) = 32
NULLIFIER_SIZE: constant(uint256) = 32
DATA_WRITE_SIZE: constant(uint256) = 64
L2_TO_L1_SIZE: constant(uint256) = 32
CONTRACT_LEAF_SIZE: constant(uint256) = 32
CONTRACT_ETH_ADDRESS_SIZE: constant(uint256) = 20
CONTRACT_AZT_ADDRESS_SIZE: constant(uint256) = 32
CONTRACT_DATA_SIZE: constant(uint256) = 52
CONTRACT_SIZE_SRC: constant(uint256) = 84
CONTRACT_SIZE_DST: constant(uint256) = 96
L1_TO_L2_SIZE: constant(uint256) = 32

BLOCK_NUMBER_OFFSET: constant(uint256) = 64
START_TREES_BLOCK_HEADER_OFFSET: constant(uint256) = 128
TREES_BLOCK_HEADER_SIZE: constant(uint256) = 320
END_TREES_BLOCK_HEADER_OFFSET: constant(uint256) = START_TREES_BLOCK_HEADER_OFFSET + TREES_BLOCK_HEADER_SIZE
BLOCK_HEADER_OFFSET: constant(uint256) = START_TREES_BLOCK_HEADER_OFFSET + 2 * TREES_BLOCK_HEADER_SIZE

BYTES_PER_BASE: constant(uint256) = 2 * (  
    COMMITMENTS_PER_TX * COMMITMENT_SIZE +
    NULLIFIERS_PER_TX * NULLIFIER_SIZE +
    PUBLIC_DATA_WRITES_PER_TX * DATA_WRITE_SIZE +
    L2_TO_L1_PER_TX * L2_TO_L1_SIZE +
    CONTRACTS_PER_TX * CONTRACT_SIZE_DST +
    LOGS_SIZE_PER_TX
)

MAX_BYTES: constant(uint256) = 2**17
MAX_BASES: constant(uint256) = 8

MAX_L1_TO_L2_MSGS_PER_ROLLUP: constant(uint256) = 16
MAX_L2_TO_L1_MSGS: constant(uint256) = MAX_BASES * L2_TO_L1_PER_TX * 2

struct Offsets:
    countOrLength: uint256
    commitments: uint256
    nullifiers: uint256
    dataWrites: uint256
    l2ToL1Msgs: uint256
    contracts: uint256
    contractDatas: uint256
    l1ToL2Msgs: uint256
    l1ToL2MsgsCount: uint256
    encryptedLogs: uint256
    unencryptedLogs: uint256
    
struct Consumables:
    baseLeaves: DynArray[bytes32, MAX_BASES]
    l2ToL1Msgs: DynArray[bytes32, MAX_L2_TO_L1_MSGS]
    encrypedLogsHashKernel1: bytes32
    encrypedLogsHashKernel2: bytes32
    unencryptedLogsHashKernel1: bytes32
    unencryptedLogsHashKernel2: bytes32        

@external
@pure
def decode(inputs: Bytes[MAX_BYTES]) -> (
  uint256, 
  bytes32, 
  bytes32, 
  bytes32, 
  DynArray[bytes32, MAX_L2_TO_L1_MSGS], 
  DynArray[bytes32, MAX_L1_TO_L2_MSGS_PER_ROLLUP]
  ):
    block_number: uint256 = extract32(inputs, BLOCK_NUMBER_OFFSET, output_type=uint256)
    
    start_state_hash: bytes32 = sha256(concat(
        convert(block_number - 1, bytes32), 
        slice(inputs, START_TREES_BLOCK_HEADER_OFFSET, TREES_BLOCK_HEADER_SIZE)
    ))
    
    end_state_hash: bytes32 = sha256(concat(
        convert(block_number, bytes32), 
        slice(inputs, END_TREES_BLOCK_HEADER_OFFSET, TREES_BLOCK_HEADER_SIZE)
    ))
    
    offsets: Offsets = empty(Offsets)
    offset: uint256 = BLOCK_HEADER_OFFSET
    
    # Commitments
    offsets.countOrLength = convert(slice(inputs, offset, 4), uint256)
    baseLeafCount: uint256 = offsets.countOrLength / (COMMITMENTS_PER_TX * 2)

    offsets.commitments = offset + 4
    offset += 4 + offsets.countOrLength * COMMITMENT_SIZE
    
    # Nullifiers
    offsets.countOrLength = convert(slice(inputs, offset, 4), uint256)
    offsets.nullifiers = offset + 4
    offset += 4 + offsets.countOrLength * NULLIFIER_SIZE
    
    # Data Writes
    offsets.countOrLength = convert(slice(inputs, offset, 4), uint256)
    offsets.dataWrites = offset + 4
    offset += 4 + offsets.countOrLength * DATA_WRITE_SIZE
    
    # L2 to L1
    offsets.countOrLength = convert(slice(inputs, offset, 4), uint256)
    offsets.l2ToL1Msgs = offset + 4
    offset += 4 + offsets.countOrLength * L2_TO_L1_SIZE
    
    # Contracts
    offsets.countOrLength = convert(slice(inputs, offset, 4), uint256)
    offsets.contracts = offset + 4
    offsets.contractDatas = offsets.contracts + offsets.countOrLength * CONTRACT_LEAF_SIZE
    offset += 4 + offsets.countOrLength * CONTRACT_SIZE_SRC
    
    # L1 to L2
    offsets.countOrLength = convert(slice(inputs, offset, 4), uint256)
    offsets.l1ToL2Msgs = offset + 4
    offsets.l1ToL2MsgsCount = offsets.countOrLength
    offset += 4 + offsets.countOrLength * L1_TO_L2_SIZE
    
    # Encrypted logs
    offsets.countOrLength = convert(slice(inputs, offset, 4), uint256)
    offsets.encryptedLogs = offset + 4
    offset += 4 + offsets.countOrLength
    
    # Unencrypted logs
    offsets.unencryptedLogs = offset + 4 #convert(slice(inputs, offset, 4), uint256)
                
    vars: Consumables = empty(Consumables)
    
    # Compute the base leafs
    for i in range(0, MAX_BASES):
        if i == baseLeafCount:
            break
        
        # Handle the logs
        (vars.encrypedLogsHashKernel1, offsets.encryptedLogs) = self.computeKernelLogsHash(inputs, offsets.encryptedLogs)
        (vars.encrypedLogsHashKernel2, offsets.encryptedLogs) = self.computeKernelLogsHash(inputs, offsets.encryptedLogs)
        (vars.unencryptedLogsHashKernel1, offsets.unencryptedLogs) = self.computeKernelLogsHash(inputs, offsets.unencryptedLogs)
        (vars.unencryptedLogsHashKernel2, offsets.unencryptedLogs) = self.computeKernelLogsHash(inputs, offsets.unencryptedLogs)
                                        
        vars.baseLeaves.append(sha256(concat(
            slice(inputs, offsets.commitments, 2 * COMMITMENTS_PER_TX * COMMITMENT_SIZE),
            slice(inputs, offsets.nullifiers, 2 * NULLIFIERS_PER_TX * NULLIFIER_SIZE),
            slice(inputs, offsets.dataWrites, 2 * PUBLIC_DATA_WRITES_PER_TX * DATA_WRITE_SIZE),
            slice(inputs, offsets.l2ToL1Msgs, 2 * L2_TO_L1_PER_TX * L2_TO_L1_SIZE),
            slice(inputs, offsets.contracts, 2 * CONTRACTS_PER_TX * CONTRACT_LEAF_SIZE),
            slice(inputs, offsets.contractDatas, CONTRACT_AZT_ADDRESS_SIZE),
            empty(bytes12),
            slice(inputs, offsets.contractDatas + CONTRACT_AZT_ADDRESS_SIZE, CONTRACT_ETH_ADDRESS_SIZE),
            slice(inputs, offsets.contractDatas + CONTRACT_DATA_SIZE, CONTRACT_AZT_ADDRESS_SIZE),
            empty(bytes12),
            slice(inputs, offsets.contractDatas + CONTRACT_DATA_SIZE + CONTRACT_AZT_ADDRESS_SIZE, CONTRACT_ETH_ADDRESS_SIZE),
            vars.encrypedLogsHashKernel1,
            vars.encrypedLogsHashKernel2,
            vars.unencryptedLogsHashKernel1,
            vars.unencryptedLogsHashKernel2
        )))
        
        for j in range(0, 2 * L2_TO_L1_PER_TX):
            # We can more easily handle empty ones here if we want to
            start: uint256 = offsets.l2ToL1Msgs + j * 32
            vars.l2ToL1Msgs.append(extract32(inputs, start))
        
        offsets.commitments   += 2 * COMMITMENTS_PER_TX * COMMITMENT_SIZE
        offsets.nullifiers    += 2 * NULLIFIERS_PER_TX * NULLIFIER_SIZE
        offsets.dataWrites    += 2 * PUBLIC_DATA_WRITES_PER_TX * DATA_WRITE_SIZE
        offsets.l2ToL1Msgs    += 2 * L2_TO_L1_PER_TX * L2_TO_L1_SIZE
        offsets.contracts     += 2 * CONTRACTS_PER_TX * CONTRACT_LEAF_SIZE
        offsets.contractDatas += 2 * CONTRACTS_PER_TX * CONTRACT_DATA_SIZE
            
    diffRoot: bytes32 = self.compute_root(vars.baseLeaves)
    
    l1ToL2Msgs: DynArray[bytes32, MAX_L1_TO_L2_MSGS_PER_ROLLUP] = empty(DynArray[bytes32, MAX_L1_TO_L2_MSGS_PER_ROLLUP])
    for i in range(MAX_L1_TO_L2_MSGS_PER_ROLLUP):
        if i < offsets.l1ToL2MsgsCount:
            l1ToL2Msgs.append(extract32(inputs, offsets.l1ToL2Msgs + i * 32))
        else:
            l1ToL2Msgs.append(empty(bytes32))
        
    # This looks pretty ugly. Find a better way.
    l1ToL2MsgsHash: bytes32 = sha256(concat(
        l1ToL2Msgs[0],  l1ToL2Msgs[1],  l1ToL2Msgs[2],  l1ToL2Msgs[3],
        l1ToL2Msgs[4],  l1ToL2Msgs[5],  l1ToL2Msgs[6],  l1ToL2Msgs[7],
        l1ToL2Msgs[8],  l1ToL2Msgs[9],  l1ToL2Msgs[10], l1ToL2Msgs[11],
        l1ToL2Msgs[12], l1ToL2Msgs[13], l1ToL2Msgs[14], l1ToL2Msgs[15],
    ))
 
    publicInputsHash: bytes32 = convert(convert(sha256(concat(
        slice(inputs, 0, BLOCK_HEADER_OFFSET),
        diffRoot,
        l1ToL2MsgsHash
    )), uint256) % PRIME_MODULOS, bytes32)
                
    return (
        block_number, 
        start_state_hash, 
        end_state_hash,
        publicInputsHash,
        vars.l2ToL1Msgs,
        l1ToL2Msgs
    )

@internal
@pure
def computeKernelLogsHash(inputs: Bytes[MAX_BYTES], startOffset: uint256) -> (bytes32, uint256):
    offset: uint256 = startOffset        
    remainingLogsLength: uint256 = convert(slice(inputs, offset, 4), uint256)
    offset += 4
    
    kernelPublicInputsLogsHash: bytes32 = empty(bytes32)
    
    # At most supporting 100 logs per kernel
    for i in range(100):
        if remainingLogsLength == 0:
            break
    
        privateCircuitPublicInputLogsLength: uint256 = convert(
            slice(inputs, offset, 4), 
            uint256
        )
        offset += 4
        
        privateCircuitPublicInputsLogsHash: bytes32 = sha256(slice(
            inputs,
            offset,
            privateCircuitPublicInputLogsLength
        ))
        offset += privateCircuitPublicInputLogsLength
        
        # 0x4 is the length of the logs length
        remainingLogsLength -= (privateCircuitPublicInputLogsLength + 4) 
                        
        kernelPublicInputsLogsHash = sha256(
            concat(kernelPublicInputsLogsHash, privateCircuitPublicInputsLogsHash)
        )
    
    return kernelPublicInputsLogsHash, offset

# Disgusting code down here. Need to fix it
# Not having while-loops, recursion and loops of non-literal length is a bit of a pain here.
@internal
@pure
def compute_root(_leafs: DynArray[bytes32, MAX_BASES]) -> bytes32:
    # Figure out the tree depth
    treeDepth: uint256 = 0
    for i in range(MAX_BASES):
        if 2 ** treeDepth >= len(_leafs):
          break
        treeDepth += 1

    # Copy the leafs into a new array
    leafs: bytes32[MAX_BASES] = empty(bytes32[MAX_BASES])
    for i in range(MAX_BASES):
        if i == len(_leafs):
            break
        leafs[i] = _leafs[i]
    
    # Build the tree
    for i in range(0, 10):
        if i == treeDepth:
            break

        for j in range(0, MAX_BASES / 2):
            idx: uint256 = j * 2
            if idx == len(_leafs):
                break
            leafs[j] = sha256(concat(leafs[idx], leafs[idx + 1]))
    return leafs[0]
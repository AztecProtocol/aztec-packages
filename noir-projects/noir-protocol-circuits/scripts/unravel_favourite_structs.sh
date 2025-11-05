#!/usr/bin/env bash

# Usage:
# ./scripts/unravel_favourite_structs.sh

# This will help Mike manually audit the protocol circuits, eventually.

FILE="${1:-structs.txt}" # Defaults to structs.txt if not given

append_line_break() {
  local name="$1"
  local LINE_BREAK="##############################################################################################################"
  echo -e "\n\n\n$LINE_BREAK\n$name\n$LINE_BREAK\n\n\n" >> "$FILE"
}

echo "" > "$FILE"

append_line_break "PRIVATE KERNEL INIT"
node scripts/unravel_struct.js target/private_kernel_init.json --all >> "$FILE"

append_line_break "PRIVATE KERNEL INNER"
node scripts/unravel_struct.js target/private_kernel_inner.json --all >> "$FILE"

append_line_break "PRIVATE KERNEL RESET"
node scripts/unravel_struct.js target/private_kernel_reset_4_4_4_4_4_4_4_4_4.json --all >> "$FILE"

append_line_break "PRIVATE KERNEL TAIL"
node scripts/unravel_struct.js target/private_kernel_tail.json --all >> "$FILE"


append_line_break "PRIVATE TX BASE"
node scripts/unravel_struct.js target/rollup_tx_base_private.json PrivateTxBaseRollupPrivateInputs >> "$FILE"
append_line_break
node scripts/unravel_struct.js target/rollup_tx_base_private.json TxRollupPublicInputs >> "$FILE" 2>&1

append_line_break "PUBLIC TX BASE"
node scripts/unravel_struct.js target/rollup_tx_base_public.json PublicTxBaseRollupPrivateInputs >> "$FILE"
append_line_break
node scripts/unravel_struct.js target/rollup_tx_base_public.json TxRollupPublicInputs >> "$FILE" 2>&1

append_line_break "TX MERGE"
node scripts/unravel_struct.js target/rollup_tx_merge.json TxMergeRollupPrivateInputs >> "$FILE"
append_line_break
node scripts/unravel_struct.js target/rollup_tx_merge.json TxRollupPublicInputs >> "$FILE" 2>&1


append_line_break "BLOCK ROOT FIRST"
node scripts/unravel_struct.js target/rollup_block_root_first.json BlockRootFirstRollupPrivateInputs >> "$FILE" 2>&1
append_line_break
node scripts/unravel_struct.js target/rollup_block_root_first.json BlockRollupPublicInputs >> "$FILE" 2>&1

append_line_break "BLOCK ROOT"
node scripts/unravel_struct.js target/rollup_block_root.json BlockRootRollupPrivateInputs >> "$FILE" 2>&1
append_line_break
node scripts/unravel_struct.js target/rollup_block_root.json BlockRollupPublicInputs >> "$FILE" 2>&1

append_line_break "BLOCK MERGE"
node scripts/unravel_struct.js target/rollup_block_merge.json BlockMergeRollupPrivateInputs >> "$FILE" 2>&1
append_line_break
node scripts/unravel_struct.js target/rollup_block_merge.json BlockRollupPublicInputs >> "$FILE" 2>&1


append_line_break "CHECKPOINT ROOT"
node scripts/unravel_struct.js target/rollup_checkpoint_root.json CheckpointRootRollupPrivateInputs >> "$FILE" 2>&1
append_line_break
node scripts/unravel_struct.js target/rollup_checkpoint_root.json CheckpointRollupPublicInputs >> "$FILE" 2>&1

append_line_break "CHECKPOINT MERGE"
node scripts/unravel_struct.js target/rollup_checkpoint_merge.json CheckpointMergeRollupPrivateInputs >> "$FILE" 2>&1
append_line_break
node scripts/unravel_struct.js target/rollup_checkpoint_merge.json CheckpointRollupPublicInputs >> "$FILE" 2>&1


append_line_break "(EPOCH) ROOT"
node scripts/unravel_struct.js target/rollup_root.json RootRollupPrivateInputs >> "$FILE" 2>&1
append_line_break
node scripts/unravel_struct.js target/rollup_root.json RootRollupPublicInputs >> "$FILE" 2>&1


append_line_break "PARITY BASE"
node scripts/unravel_struct.js target/parity_base.json ParityBasePrivateInputs >> "$FILE" 2>&1
append_line_break
node scripts/unravel_struct.js target/parity_base.json ParityPublicInputs >> "$FILE" 2>&1

append_line_break "PARITY ROOT"
node scripts/unravel_struct.js target/parity_root.json ParityRootPrivateInputs >> "$FILE" 2>&1
append_line_break
node scripts/unravel_struct.js target/parity_root.json ParityPublicInputs >> "$FILE" 2>&1

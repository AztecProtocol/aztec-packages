# Matrix Multiplication - Gate Count Analysis

This directory contains a Noir program for matrix-vector multiplication and tooling to extract gate counts externally using `bb gates`.

## Program

The program (`src/main.nr`) implements a simple 3x3 matrix-vector multiplication:

```noir
global N: u32 = 3;

fn main(m: [[Field; N]; N], x: [Field; N]) -> pub [Field; N] {
    let mut result = [0; N];
    for i in 0..N {
        let mut sum = 0;
        for j in 0..N {
            sum += m[i][j] * x[j];
        }
        result[i] = sum;
    }
    result
}
```

## Getting Gate Count

### Option 1: Bash Script (Simple)

Run the bash script which compiles and gets gate counts:

```bash
./get_gate_count.sh
```

This will:
1. Compile the Noir program using `nargo compile`
2. Run `bb gates` to get basic gate count
3. Run `bb gates --include_gates_per_opcode` for detailed breakdown

### Option 2: Python Script (Parsed Output)

Run the Python script for nicely formatted output:

```bash
./get_gate_count.py
```

This provides:
- Parsed gate count information
- Per-opcode breakdown
- JSON output for further processing

### Option 3: Manual Commands

```bash
# Compile
/mnt/user-data/sergei/aztec-packages/noir/noir-repo/target/release/nargo compile

# Get gate count
/mnt/user-data/sergei/.bb/bb gates -s ultra_honk -b target/matrix_mult.json

# Get detailed per-opcode breakdown
/mnt/user-data/sergei/.bb/bb gates -s ultra_honk -b target/matrix_mult.json --include_gates_per_opcode
```

## Output Format

The `bb gates` command outputs JSON with the following structure:

```json
{
  "functions": [
    {
      "acir_opcodes": 3,
      "circuit_size": 30,
      "gates_per_opcode": [0, 0, 0]
    }
  ]
}
```

Where:
- `acir_opcodes`: Number of ACIR opcodes in the program
- `circuit_size`: Total number of gates in the circuit
- `gates_per_opcode`: Array showing gate count contribution per opcode (when `--include_gates_per_opcode` is used)

## Current Results

For the 3x3 matrix multiplication:
- **ACIR Opcodes**: 3
- **Circuit Size**: 30 gates

## Modifying the Program

To test different matrix sizes, change the `N` constant in `src/main.nr`:

```noir
global N: u32 = 5;  // Try different sizes
```

Then rerun the gate count scripts to see how the circuit size changes.

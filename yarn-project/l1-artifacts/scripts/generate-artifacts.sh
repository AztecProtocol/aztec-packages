set -euo pipefail;

# create generated dir if it doesn't exist
mkdir -p generated;

echo -ne "/**\n * DecoderHelper ABI.\n */\nexport const DecoderHelperAbi = " > ./generated/DecoderHelperAbi.ts;
jq -j '.abi' ../../l1-contracts/out/DecoderHelper.sol/DecoderHelper.json >> ./generated/DecoderHelperAbi.ts;
echo " as const;" >> ./generated/DecoderHelperAbi.ts;
echo -ne "/**\n * DecoderHelper bytecode.\n */\nexport const DecoderHelperBytecode = \"" > ./generated/DecoderHelperBytecode.ts;
jq -j '.bytecode.object' ../../l1-contracts/out/DecoderHelper.sol/DecoderHelper.json >> ./generated/DecoderHelperBytecode.ts;
echo "\";" >> ./generated/DecoderHelperBytecode.ts;

echo -ne "/**\n * Rollup ABI.\n */\nexport const RollupAbi = " > ./generated/RollupAbi.ts;
jq -j '.abi' ../../l1-contracts/out/Rollup.sol/Rollup.json >> ./generated/RollupAbi.ts;
echo " as const;" >> ./generated/RollupAbi.ts;

echo -ne "/**\n * Rollup bytecode.\n */\nexport const RollupBytecode = '" > ./generated/RollupBytecode.ts;
jq -j '.bytecode.object' ../../l1-contracts/out/Rollup.sol/Rollup.json >> ./generated/RollupBytecode.ts;
echo "' as const;" >> ./generated/RollupBytecode.ts;

echo -ne "/**\n * UnverifiedDataEmitter ABI.\n */\nexport const UnverifiedDataEmitterAbi = " > ./generated/UnverifiedDataEmitterAbi.ts;
jq -j '.abi' ../../l1-contracts/out/UnverifiedDataEmitter.sol/UnverifiedDataEmitter.json >> ./generated/UnverifiedDataEmitterAbi.ts;
echo " as const;" >> ./generated/UnverifiedDataEmitterAbi.ts;

echo -ne "/**\n * UnverifiedDataEmitter bytecode.\n */\nexport const UnverifiedDataEmitterBytecode = '" > ./generated/UnverifiedDataEmitterBytecode.ts;
jq -j '.bytecode.object' ../../l1-contracts/out/UnverifiedDataEmitter.sol/UnverifiedDataEmitter.json >> ./generated/UnverifiedDataEmitterBytecode.ts;
echo "' as const;" >> ./generated/UnverifiedDataEmitterBytecode.ts;

echo -ne "export * from './DecoderHelperAbi.js';\nexport * from './DecoderHelperBytecode.js';\n" > ./generated/index.ts;
echo -ne "export * from './RollupAbi.js';\nexport * from './RollupBytecode.js';\n" >> ./generated/index.ts;
echo -ne "export * from './UnverifiedDataEmitterAbi.js';\nexport * from './UnverifiedDataEmitterBytecode.js';" >> ./generated/index.ts;

echo "Successfully generated TS artifacts!";
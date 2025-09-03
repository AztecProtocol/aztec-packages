#!/bin/bash

target_dir=$(mktemp -d)
bb_executable="${BB_EXECUTABLE_PATH:-/root/.bb/bb}"
path_to_program=$1
path_to_witness=$2

$bb_executable prove -b $path_to_program -w $path_to_witness -o $target_dir &> /dev/null;
$bb_executable write_vk -b $path_to_program -o $target_dir &> /dev/null;
verification_command="$bb_executable verify -k $target_dir/vk -p $target_dir/proof -i $target_dir/public_inputs";
verification_result=$($verification_command);
echo $verification_result;
rm -rf $target_dir;

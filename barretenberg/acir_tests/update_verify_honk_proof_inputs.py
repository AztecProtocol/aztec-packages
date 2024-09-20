import argparse
import json
import shutil

def update_prover_toml(proof_file_path, vk_file_path, output_toml_path, output_toml_path_2):
    # Read the proof from the JSON file
    with open(proof_file_path, "r") as proof_file:
        proof_data = json.load(proof_file)

    # Read the verification key from the JSON file
    with open(vk_file_path, "r") as vk_file:
        vk_data = json.load(vk_file)

    # Extract the one public input (4th element in the proof array)
    public_inputs = proof_data[3] if len(proof_data) > 3 else None

    # Remove the public input from the proof array
    proof_data_without_public_input = proof_data[:3] + proof_data[4:]

    # Convert each element in the proof and verification key to a hex string with double quotes
    proof_data_str = [f'"{item}"' for item in proof_data_without_public_input]
    vk_data_str = [f'"{item}"' for item in vk_data]
    public_inputs_str = f'"{public_inputs}"'

    # Manually create the TOML content with public_inputs as an array
    toml_content = (
        f'key_hash = "0x{"0" * 64}"\n'
        f'proof = [{", ".join(proof_data_str)}]\n'
        f'public_inputs = [{public_inputs_str}]\n'
        f'verification_key = [{", ".join(vk_data_str)}]\n'
    )

    # Write the content to the output TOML file
    with open(output_toml_path, "w") as output_toml_file:
        output_toml_file.write(toml_content)

    shutil.copy(output_toml_path, output_toml_path_2)

    print(f"Prover.toml has been successfully created at {output_toml_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update and create the Prover.toml file")

    parser.add_argument("proof_file_path", help="Path to the proof file")
    parser.add_argument("vk_file_path", help="Path to the verification key file")
    parser.add_argument("output_toml_path", help="Path to the output TOML file")
    parser.add_argument("output_toml_path_2", help="Path to the second output TOML file")

    args = parser.parse_args()

    update_prover_toml(args.proof_file_path, args.vk_file_path, args.output_toml_path, args.output_toml_path_2)

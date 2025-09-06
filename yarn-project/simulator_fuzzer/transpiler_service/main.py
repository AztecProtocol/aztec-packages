from flask import Flask, request, jsonify
import subprocess
import json
import logging
import time

# Placeholder for putting Brillig bytecode to feed to the transpiler
BASE_CONTRACT_ARTIFACT = {"noir_version":"1.0.0-beta.11+a92d049c8771332a383aec07474691764c4d90f0-aztec","name":"AvmTest","functions":[{"name":"main2","hash":"9106907505563584043","is_unconstrained":True,"custom_attributes":["public"],"abi":{"parameters":[{"name":"a","type":{"kind":"integer","sign":"unsigned","width":64},"visibility":"private"}],"return_type":{"abi_type":{"kind":"integer","sign":"unsigned","width":64},"visibility":"public"},"error_types":{"17843811134343075018":{"error_kind":"string","string":"Stack too deep"}}},"bytecode":"","debug_symbols":"dVDNCoQgEH6XOXtIoVp6lYgwm0IQFdOFJXz3HaN228Ne5pvx+5GZHWac0jpqu7gNun6HKWhj9Doap2TUztLrDlUpvIGOM+AtQc4MLsUYA2IR3CwU5GVAG6GzyRgGT2nSIdq8tAdGGYitGKCdCSlw0QZLl9nXXf23cl43j9NOfSs+EaLOeaBJKh1+FsklLWg5GTzHJVl1Y+PLX8x1CB+cwjkFLEm3a1DtRcVEPeTy2xs=","expression_width":{"Bounded":{"width":4}}}],"outputs":{},"file_map":{}}

app = Flask(__name__)

@app.route("/transpile", methods=["POST"])
def transpile():
    start_time = time.time()
    data = request.json.get("bytecode", None)
    if data is None:
        return jsonify({"error": "No bytecode provided"}), 400

    with open("contract_artifact.json", "w") as f:
        contract = BASE_CONTRACT_ARTIFACT.copy()
        contract["functions"][0]["bytecode"] = data
        f.write(json.dumps(contract) + "\n")

    subprocess.run(["/app/transpiler", "contract_artifact.json", "output.json"])
    with open("output.json", "r") as f:
        output = json.load(f)['functions'][0]['bytecode']

    end_time = time.time()
    logging.info(f"Transpilation time: {end_time - start_time} seconds")
    return {"avm_bytecode": output}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=51447)

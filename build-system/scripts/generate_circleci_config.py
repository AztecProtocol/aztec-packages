#!/usr/bin/env python3
import json
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
import subprocess
import multiprocessing

# same functionality as query_manifest rebuildPatterns but in bulk
def get_manifest_and_build_patterns():
    manifest = json.load(open("build_manifest.json"))
    
    # First pass to initialize manifest_to_build_patterns
    manifest_to_build_patterns = {key: manifest[key]["rebuildPatterns"] for key in manifest}
    
    # Second pass to include dependencies
    for key in manifest:
        for dep in manifest[key].get("dependencies", []):
            manifest_to_build_patterns[key] += manifest_to_build_patterns[dep]

    # Convert lists to joined string sets
    return {key: "|".join(set(value)) for key, value in manifest_to_build_patterns.items()}

def find_string_in_jobs(jobs, manifest_name):
    matching_jobs = {}
    for job_name, job_info in jobs.items():
        steps = job_info.get("steps", [])
        for step in steps:
            run_info = step.get("run", {})
            command = run_info.get("command", "")
            if manifest_name in command:
                matching_jobs[job_name] = manifest_name
                break
    return matching_jobs

manager = multiprocessing.Manager()
tag_found_for_hash = manager.dict()

def process_manifest(key, rebuild_patterns):
    if rebuild_patterns in tag_found_for_hash:
        print(key, "SKIPPING")
        if tag_found_for_hash[rebuild_patterns]:
            return key
        return None

    print(key, rebuild_patterns)
    content_hash = subprocess.check_output(['calculate_content_hash', key, rebuild_patterns]).decode("utf-8")
    completed = subprocess.run(["check_rebuild", f"cache-{content_hash}", key], stdout=subprocess.DEVNULL)
    if completed.returncode == 0:
        tag_found_for_hash[rebuild_patterns] = True
        return key
    else:
        tag_found_for_hash[rebuild_patterns] = False
        return None

def get_already_built_manifest():
    tag_found_for_hash = {}
    manifest_to_build_patterns = get_manifest_and_build_patterns()

    with ProcessPoolExecutor() as executor:
        futures = {executor.submit(process_manifest, key, rebuild_patterns): key for key, rebuild_patterns in manifest_to_build_patterns.items()}
        for future in as_completed(futures):
            result = future.result()
            if result is not None:
                yield result

def remove_jobs_from_workflow(jobs, to_remove):
    """
    Removes jobs from a given CircleCI JSON workflow.
    
    Parameters:
        jobs (dict): The JSON object representing the CircleCI workflow jobs dependencies portion.
        to_remove (list): The list of jobs to be removed from the workflow.
    
    Returns:
        dict: The new JSON object with specified jobs removed.
    """

    new_jobs = []
    # Remove specified jobs
    for job in jobs:
        key = next(iter(job))
        if key in to_remove:
            continue
        # remove our filtered jobs from the dependency graph via the requires attribute
        job[key]["requires"] = [r for r in job[key].get("requires", []) if r not in jobs_to_remove]
        new_jobs.append(job)
    return new_jobs

if __name__ == '__main__':
    # The CircleCI workflow as a JSON string (Replace this with your actual workflow)
    workflow_json_str = sys.stdin.read()
    
    # Convert the JSON string to a Python dictionary
    workflow_dict = json.loads(workflow_json_str)
    
    for man in get_already_built_manifest():
        print("man",man)
    # List of jobs to remove
    jobs_to_remove = ["e2e-sandbox-example", "e2e-multi-transfer-contract", "deploy-end"]

    # Get rid of workflow setup step and setup flag
    workflow_dict["setup"] = False
    del workflow_dict["workflows"]["setup-workflow"]
    # Remove the jobs and get the new workflow
    workflow_dict["workflows"]["system"]["jobs"] = remove_jobs_from_workflow(workflow_dict["workflows"]["system"]["jobs"], jobs_to_remove)
    workflow_dict["workflows"]["system"]["when"] = {"equal":["system","<< pipeline.parameters.workflow >>"]}
    # Convert the new workflow back to JSON string
    new_workflow_json_str = json.dumps(workflow_dict, indent=2)
    print(new_workflow_json_str)

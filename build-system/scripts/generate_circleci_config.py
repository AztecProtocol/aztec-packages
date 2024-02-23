#!/usr/bin/env python3
# Operates on circleci (loaded as json) from stdin
# Outputs filtered circleci without the jobs we don't need to run
# NOTE: This uses the build manifest YAML file to filter the dependency graph in CircleCI BUT it is not one-to-one.
# There is a heuristic here where we expect a job to be associated with a manifest job if it lists the build_manifest.yml job name in its command.
import json
import yaml
from concurrent.futures import ProcessPoolExecutor, as_completed
import subprocess

# same functionality as query_manifest rebuildPatterns but in bulk
def get_manifest_job_names():
    manifest = yaml.safe_load(open("build_manifest.yml"))
    return list(manifest)

def has_associated_manifest_job(circleci_job, manifest_names):
    steps = circleci_job.get("steps", [])
    for step in steps:
        run_info = step.get("run", {})
        command = run_info.get("command", "")
        for manifest_name in manifest_names:
            if manifest_name in command:
                return True
    return False

def get_already_built_circleci_job_names(circleci_jobs):
    manifest_names = list(get_already_built_manifest_job_names())
    for man in manifest_names:
      eprint("MAN", man)
    for job_name, circleci_job in circleci_jobs.items():
        if has_associated_manifest_job(circleci_job, manifest_names):
            yield job_name

# Helper for multiprocessing
def _get_already_built_manifest_job_names(manifest_name):
    content_hash = subprocess.check_output(['calculate_content_hash', manifest_name]).decode("utf-8")
    completed = subprocess.run(["check_rebuild", f"cache-{content_hash}", manifest_name], stdout=subprocess.DEVNULL)
    if completed.returncode == 0:
        return manifest_name
    else:
        return None

def get_already_built_manifest_job_names():
    manifest_names = get_manifest_job_names()

    with ProcessPoolExecutor() as executor:
        futures = [executor.submit(_get_already_built_manifest_job_names, key) for key in manifest_names]
        for future in as_completed(futures):
            eprint('fut', future)
            result = future.result()
            eprint('res', result)
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
import sys

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

if __name__ == '__main__':
    # The CircleCI workflow as a JSON string (Replace this with your actual workflow)
    
    # Convert the JSON string to a Python dictionary
    workflow_dict = yaml.safe_load(open('.circleci/config.yml'))

    # # List of jobs to remove
    jobs_to_remove = list(get_already_built_circleci_job_names(workflow_dict["jobs"]))
    # Get rid of workflow setup step and setup flag
    workflow_dict["setup"] = False
    del workflow_dict["workflows"]["setup-workflow"]
    # Remove the jobs and get the new workflow
    workflow_dict["workflows"]["system"]["jobs"] = remove_jobs_from_workflow(workflow_dict["workflows"]["system"]["jobs"], jobs_to_remove)
    workflow_dict["workflows"]["system"]["when"] = {"equal":["system","<< pipeline.parameters.workflow >>"]}
    # Convert the new workflow back to JSON string
    new_workflow_json_str = json.dumps(workflow_dict, indent=2)
    for t in workflow_dict["workflows"]["system"]["jobs"]:
      eprint("KEPT")
      eprint(t)
    # print(new_workflow_json_str)
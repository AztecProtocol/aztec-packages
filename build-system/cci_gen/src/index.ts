import fs from "fs";
import { parseDocument, YAMLMap, Pair, Scalar, Alias, YAMLSeq } from "yaml";

function toCircleJob(spot: boolean) {
  return {
    ...(spot
      ? {
          docker: [{ image: "aztecprotocol/alpine-build-image" }],
          resource_class: "small",
        }
      : {
          machine: { image: "ubuntu-2204:2023.07.2" },
          resource_class: "large",
        }),
    steps: [
      { checkout: "*" },
      { setup_env: "*" },
      {
        run: {},
      },
    ],
  };
}

function toBuildJob(job: string, { spot }: any) {
  const jobObject = toCircleJob(spot);
  const run: any = jobObject.steps[2].run;
  run.name = "Build";
  run.command =
    (spot ? `cond_spot_run_build ${job} ${spot}` : `build ${job}`) +
    " | ./add_timestamps.sh";

  const jobNode: any = jobObject;
  jobNode.steps[0] = new Alias("checkout");
  jobNode.steps[1] = new Alias("setup_env");

  return jobNode;
}

function toTestJob(job: string, { spot, command }: any) {
  const jobObject = toCircleJob(spot);
  const run: any = jobObject.steps[2].run;
  run.name = "Test";
  run.command = spot
    ? `cond_spot_run_test ${job} ${spot} ${command} | ./add_timestamps.sh`
    : `cond_run_script ${job} ${command} | ./add_timestamps.sh`;

  const jobNode: any = jobObject;
  jobNode.steps[0] = new Alias("checkout");
  jobNode.steps[1] = new Alias("setup_env");

  return jobNode;
}

function toWorkflowJob(job: string, requires: string[]) {
  return {
    [`${job}`]: {
      requires,
      "<<": new Alias("defaults"),
    },
  };
}

function updateConfig() {
  // Step 1: Read and parse the YAML file
  const yamlContent = fs.readFileSync("../../build_manifest.yml", "utf-8");
  const yamlObject = parseDocument(yamlContent).toJSON();

  // Step 2: Read and parse the config.yml file to an AST
  const configYamlContent = fs.readFileSync(
    "../../.circleci/config.template.yml",
    "utf-8"
  );
  const configYamlDoc: any = parseDocument(configYamlContent);
  configYamlDoc.commentBefore =
    " WARNING: THIS IS AUTO-GENERATED FROM config.template.yml AND build-system/cci_gen! DO NOT MODIFY DIRECTLY!\n \n" +
    configYamlDoc.commentBefore;

  // Step 3: Populate jobs node in the AST with the new job entries.
  const jobsNode = new YAMLMap();
  configYamlDoc.set("jobs", jobsNode);

  const workflowJobs = new YAMLSeq();

  for (const [index, [job, json]] of Object.entries(
    yamlObject
  ).entries() as any) {
    const k = new Scalar(job);
    k.spaceBefore = index > 0;
    jobsNode.items.push(new Pair(k, toBuildJob(job, json)));
    workflowJobs.items.push(toWorkflowJob(job, json.dependencies));

    if (json.tests) {
      for (const [testName, test] of Object.entries(json.tests)) {
        const k = new Scalar(testName);
        k.spaceBefore = true;
        jobsNode.items.push(new Pair(k, toTestJob(job, test)));
        workflowJobs.items.push(toWorkflowJob(testName, [job]));
      }
    }
  }

  ((configYamlDoc.get("workflows") as YAMLMap).get("system") as YAMLMap).set(
    "jobs",
    workflowJobs
  );

  // Step 4: Stringify the modified AST back to a YAML string
  const newYamlContent = configYamlDoc.toString({ lineWidth: 0 });
  // const newYamlContent = String(configYamlDoc);

  // Step 5: Write the modified YAML string back to the config.yml file
  fs.writeFileSync("../../.circleci/config.yml", newYamlContent, "utf-8");
}

updateConfig();

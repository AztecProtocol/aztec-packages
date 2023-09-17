import fs from "fs";
import { parseDocument, YAMLMap, Pair, Scalar, Alias } from "yaml";

function toCircleJob(spot: boolean) {
  return {
    ...(spot
      ? {
          docker: [{ image: "aztecprotocol/alpine-build-image" }],
          resource_class: "small",
        }
      : {
          machine: [{ image: "ubuntu-2204:2023.07.2" }],
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
  run.command = spot ? `cond_spot_run_build ${job} ${spot}` : `build ${job}`;

  const jobNode = parseDocument(JSON.stringify(jobObject)).toJSON();
  jobNode.steps[0] = new Alias("checkout");
  jobNode.steps[1] = new Alias("setup_env");

  return jobNode;
}

function toTestJob(job: string, { spot, command }: any) {
  const jobObject = toCircleJob(spot);
  const run: any = jobObject.steps[2].run;
  run.name = "Test";
  run.command = spot
    ? `cond_spot_run_test ${job} ${spot} ${command}`
    : `cond_run_test ${job} ${command}`;

  const jobNode = parseDocument(JSON.stringify(jobObject)).toJSON();
  jobNode.steps[0] = new Alias("checkout");
  jobNode.steps[1] = new Alias("setup_env");

  return jobNode;
}

function updateConfig() {
  // Step 1: Read and parse the YAML file
  const yamlContent = fs.readFileSync("../../build_manifest.yml", "utf-8");
  const yamlObject = parseDocument(yamlContent).toJSON();

  // Step 2: Read and parse the config.yml file to an AST
  const configYamlContent = fs.readFileSync(
    "../../.circleci/config.yml",
    "utf-8"
  );
  const configYamlDoc = parseDocument(configYamlContent);

  // Step 3: Populate jobs node in the AST with the new job entries.
  const jobsNode = new YAMLMap();
  configYamlDoc.set("jobs", jobsNode);

  for (const [index, [job, json]] of Object.entries(
    yamlObject
  ).entries() as any) {
    const k = new Scalar(job);
    k.spaceBefore = index > 0;
    jobsNode.items.push(new Pair(k, toBuildJob(job, json)));

    if (json.tests) {
      for (const [index, [testName, test]] of Object.entries(
        json.tests
      ).entries()) {
        const k = new Scalar(testName);
        k.spaceBefore = true;
        jobsNode.items.push(new Pair(k, toTestJob(job, test)));
      }
    }
  }

  // Step 4: Stringify the modified AST back to a YAML string
  const newYamlContent = configYamlDoc.toString({ lineWidth: 0 });
  // const newYamlContent = String(configYamlDoc);

  // Step 5: Write the modified YAML string back to the config.yml file
  fs.writeFileSync("../../.circleci/config.new.yml", newYamlContent, "utf-8");
}

updateConfig();

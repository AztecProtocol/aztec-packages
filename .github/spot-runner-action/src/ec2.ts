import * as _ from "lodash";
import AWS from "aws-sdk";
import {
  CreateLaunchTemplateRequest,
  RunInstancesRequest,
} from "aws-sdk/clients/ec2";
import * as crypto from "crypto";
import * as core from "@actions/core";
import { ConfigInterface } from "./config";
import { UserData } from "./userdata";

interface Tag {
  Key: string;
  Value: string;
}

interface FilterInterface {
  Name: string;
  Values: string[];
}

export class Ec2Instance {
  config: ConfigInterface;
  client: AWS.EC2;
  tags: Tag[];
  credentials: AWS.Credentials;
  assumedRole: boolean = false;

  constructor(config: ConfigInterface) {
    this.config = config;
    this.credentials = new AWS.Credentials({
      accessKeyId: this.config.awsAccessKeyId,
      secretAccessKey: this.config.awsSecretAccessKey,
    });

    this.client = new AWS.EC2({
      credentials: this.credentials,
      region: this.config.awsRegion,
    });

    this.tags = this.getTags();
  }

  async getEc2Client() {
    if (!this.assumedRole && this.config.awsAssumeRole) {
      this.assumedRole = !this.assumedRole;
      const credentials = await this.getCrossAccountCredentials();
      this.client = new AWS.EC2({
        credentials: credentials,
        region: this.config.awsRegion,
      });
    }
    return this.client;
  }

  getTags() {
    // Parse custom tags
    let customTags = [];
    if (this.config.ec2InstanceTags) {
      customTags = JSON.parse(this.config.ec2InstanceTags);
    }

    return [
      {
        Key: "Name",
        Value: `${this.config.githubRepo}-${this.config.githubJobId}`,
      },
      {
        Key: "github_ref",
        Value: this.config.githubRef,
      },
      {
        Key: "owner",
        Value: "EC2_ACTION_BUILDER",
      },
      {
        Key: "github_job_id",
        Value: this.config.githubJobId,
      },
      {
        Key: "github_repo",
        Value: this.config.githubRepo,
      },
      ...customTags,
    ];
  }

  async getCrossAccountCredentials() {
    const stsClient = new AWS.STS({
      credentials: this.credentials,
      region: this.config.awsRegion,
    });

    const timestamp = new Date().getTime();
    const params = {
      RoleArn: this.config.awsIamRoleArn,
      RoleSessionName: `ec2-action-builder-${this.config.githubJobId}-${timestamp}`,
    };
    try {
      const data = await stsClient.assumeRole(params).promise();
      if (data.Credentials)
        return {
          accessKeyId: data.Credentials.AccessKeyId,
          secretAccessKey: data.Credentials.SecretAccessKey,
          sessionToken: data.Credentials.SessionToken,
        };

      core.error(`STS returned empty response`);
      throw Error("STS returned empty response");
    } catch (error) {
      core.error(`STS assume role failed`);
      throw error;
    }
  }

  async runInstances(params: RunInstancesRequest) {
    const client = await this.getEc2Client();

    try {
      return (await client.runInstances(params).promise()).Instances;
    } catch (error) {
      core.error(`Failed to create instance(s)`);
      throw error;
    }
  }

  async getSubnetAz() {
    const client = await this.getEc2Client();
    try {
      const subnets = (
        await client
          .describeSubnets({
            SubnetIds: [this.config.ec2SubnetId],
          })
          .promise()
      ).Subnets;
      return subnets?.at(0)?.AvailabilityZone;
    } catch (error) {
      core.error(`Failed to lookup subnet az`);
      throw error;
    }
  }

  getHashOfStringArray(strings: string[]): string {
    const hash = crypto.createHash("sha256");
    hash.update(strings.join("")); // Concatenate all strings in the array
    return hash.digest("hex");
  }

  async getLaunchTemplate(): Promise<string> {
    const client = await this.getEc2Client();

    const ec2InstanceTypeHash = this.getHashOfStringArray(
      this.config.ec2InstanceType
    );
    const launchTemplateName =
      "aztec-packages-spot-runner-" + ec2InstanceTypeHash;

    const launchTemplateParams: CreateLaunchTemplateRequest = {
      LaunchTemplateName: launchTemplateName,
      LaunchTemplateData: {
        InstanceRequirements: {
          // We do not know what the instance types correspond to
          // just let the user send a list of allowed instance types
          VCpuCount: { Min: 0 },
          MemoryMiB: { Min: 0 },
          AllowedInstanceTypes: this.config.ec2InstanceType,
        },
      },
    };
    const arr =
      (
        await client
          .describeLaunchTemplates({
            LaunchTemplateNames: [launchTemplateName],
          })
          .promise()
      ).LaunchTemplates || [];
    if (arr.length <= 0) {
      await client.createLaunchTemplate(launchTemplateParams).promise();
    }
    return launchTemplateName;
  }

  async getInstanceConfiguration(
    ec2SpotInstanceStrategy: string
  ): Promise<RunInstancesRequest> {
    const userData = new UserData(this.config);

    const params: RunInstancesRequest = {
      ImageId: this.config.ec2AmiId,
      InstanceInitiatedShutdownBehavior: "terminate",
      InstanceMarketOptions: {},
      LaunchTemplate: { LaunchTemplateName: await this.getLaunchTemplate() },
      MaxCount: 1,
      MinCount: 1,
      SecurityGroupIds: [this.config.ec2SecurityGroupId],
      SubnetId: this.config.ec2SubnetId,
      KeyName: this.config.ec2KeyName,
      Placement: {
        AvailabilityZone: await this.getSubnetAz(),
      },
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: this.tags,
        },
      ],
      // <aztec>parity with build-system
      BlockDeviceMappings: [
        {
          DeviceName: "/dev/sda1",
          Ebs: {
            VolumeSize: 32,
          },
        },
      ],
      // parity with build-system</aztec>
      UserData: await userData.getUserData(),
    };

    switch (ec2SpotInstanceStrategy.toLowerCase()) {
      case "besteffort":
      case "spotonly": {
        params.InstanceMarketOptions = {
          MarketType: "spot",
          SpotOptions: {
            InstanceInterruptionBehavior: "terminate",
            SpotInstanceType: "one-time",
          },
        };
        break;
      }
      case "none": {
        params.InstanceMarketOptions = {};
        break;
      }
      default: {
        throw new TypeError("Invalid value for ec2_spot_instance_strategy");
      }
    }

    return params;
  }

  async getInstanceStatus(instanceId: string) {
    const client = await this.getEc2Client();
    try {
      const instanceList = (
        await client
          .describeInstanceStatus({ InstanceIds: [instanceId] })
          .promise()
      ).InstanceStatuses;
      return instanceList?.at(0);
    } catch (error) {
      core.error(`Failed to lookup status for instance ${instanceId}`);
      throw error;
    }
  }

  async getInstancesForTags(): Promise<AWS.EC2.Instance[]> {
    const client = await this.getEc2Client();
    const filters: FilterInterface[] = [
      {
        Name: "tag:Name",
        Values: [`${this.config.githubRepo}-${this.config.githubJobId}`],
      },
    ];
    try {
      var params = {
        Filters: filters,
        MaxResults: 99,
      };

      let instances: AWS.EC2.Instance[] = [];
      for (const reservation of (
        await client.describeInstances(params).promise()
      ).Reservations || []) {
        instances = instances.concat(reservation.Instances || []);
      }
      return instances;
    } catch (error) {
      core.error(
        `Failed to lookup status for instance for tags ${JSON.stringify(
          filters,
          null,
          2
        )}`
      );
      throw error;
    }
  }

  async waitForInstanceRunningStatus(instanceId: string) {
    const client = await this.getEc2Client();
    try {
      await client
        .waitFor("instanceRunning", { InstanceIds: [instanceId] })
        .promise();
      core.info(`AWS EC2 instance ${instanceId} is up and running`);
      return;
    } catch (error) {
      core.error(`AWS EC2 instance ${instanceId} init error`);
      throw error;
    }
  }

  async terminateInstances(instanceIds: string[]) {
    if (instanceIds.length === 0) {
      return;
    }
    const client = await this.getEc2Client();
    try {
      await client.terminateInstances({ InstanceIds: instanceIds }).promise();
      core.info(`AWS EC2 instances ${instanceIds.join(", ")} are terminated`);
      return;
    } catch (error) {
      core.info(`Failed to terminate instances ${instanceIds.join(", ")}`);
      throw error;
    }
  }
}

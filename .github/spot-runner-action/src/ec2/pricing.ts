import AWS from "aws-sdk";
import { ConfigInterface } from "../config/config";
import { findValuesHelper } from "../utils/utils";
import * as core from "@actions/core";

export class Ec2Pricing {
  config: ConfigInterface;
  client: AWS.Pricing;
  assumedRole: boolean = false;

  credentials: AWS.Credentials;

  constructor(config: ConfigInterface) {
    this.config = config;
    this.credentials = new AWS.Credentials({
      accessKeyId: this.config.awsAccessKeyId,
      secretAccessKey: this.config.awsSecretAccessKey,
    });

    this.client = new AWS.Pricing({
      credentials: this.credentials,
      region: "us-east-1",
    });
  }

  async getEc2Client() {
    if (!this.assumedRole && this.config.awsAssumeRole) {
      this.assumedRole = !this.assumedRole;
      const credentials = await this.getCrossAccountCredentials();
      this.client = new AWS.Pricing({
        credentials: credentials,
        region: "us-east-1",
      });
    }
    return this.client;
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

  async getPriceForInstanceTypeUSD(instanceType: string) {
    const client = await this.getEc2Client();

    var params = {
      Filters: [
        {
          Type: "TERM_MATCH",
          Field: "ServiceCode",
          Value: "AmazonEC2",
        },
        {
          Type: "TERM_MATCH",
          Field: "regionCode",
          Value: this.config.awsRegion,
        },
        {
          Type: "TERM_MATCH",
          Field: "marketoption",
          Value: "OnDemand",
        },
        {
          Type: "TERM_MATCH",
          Field: "instanceType",
          Value: instanceType,
        },
        {
          Type: "TERM_MATCH",
          Field: "operatingSystem",
          Value: "Linux",
        },
        {
          Type: "TERM_MATCH",
          Field: "licenseModel",
          Value: "No License required",
        },
        {
          Type: "TERM_MATCH",
          Field: "preInstalledSw",
          Value: "NA",
        },
      ],
      FormatVersion: "aws_v1",
      MaxResults: 99,
      ServiceCode: "AmazonEC2",
    };

    return new Promise<number>((resolve, reject) => {
      client.getProducts(params, (err, data) => {
        if (err) {
          return reject(err);
        }

        if (data.PriceList) {
          let searchResult = findValuesHelper(
            data.PriceList[0]["terms"]["OnDemand"],
            "USD"
          );
          resolve(Number(searchResult[0]));
        } else resolve(0);
      });
    });
  }
}

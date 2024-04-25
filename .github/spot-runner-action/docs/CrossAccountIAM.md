# Cross-Account IAM User/Role
## Setup IAM role
1. Note the username and ARM of your automation IAM user in your root account
2. Update `"ec2:ResourceTag/Owner":` with the username from step 1  
    1. Note the user ARN
3. Create an IAM role with the updated policy under your **target** account where EC2 instances will run and note the **Role ARN**

**IAM role policy**
```JSON
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": [
                "ec2:StartInstances",
                "ec2:RunInstances",
                "ec2:DescribeInstances",
                "ec2:DescribeInstanceStatus",
                "ec2:DescribeInstanceTypes",
                "ec2:DescribeSubnets",
                "ec2:describeSpotPriceHistory",
                "pricing:GetProducts",
                "pricing:GetAttributeValues"
            ],
            "Resource": "*",
            "Effect": "Allow"
        },
        {
            "Condition": {
                "StringEquals": {
                    "ec2:ResourceTag/Owner": "deploybot"
                }
            },
            "Action": [
                "ec2:StopInstances",
                "ec2:RebootInstances",
                "ec2:TerminateInstances"
            ],
            "Resource": "*",
            "Effect": "Allow"
        },
        {
            "Condition": {
                "StringEquals": {
                    "ec2:CreateAction": "RunInstances"
                }
            },
            "Action": "ec2:CreateTags",
            "Resource": "*",
            "Effect": "Allow"
        }
    ]
}
```
4. Replace `ROOT_ACCOUNT_ID` with ID of your Root AWS account and update the trust policy for your newly created role
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::ROOT_ACCOUNT_ID:root"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```
5. Replace `ROLE_ARN` with arn value from step 3 and attach this policy to your automation user (or group)
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": "sts:AssumeRole",
            "Resource": "ROLE_ARN",
            "Effect": "Allow"
        }
    ]
}
```

## Configure workflow
Use the **Advanced** example in our main [README](../README.md) file with the role ARN from above

**Important Note:** Make sure the `Owner` EC2 tags is set to the name of your automation user 

Example: 
```json
[
  {"Key": "Owner", "Value": "JohnDone"}
]
```

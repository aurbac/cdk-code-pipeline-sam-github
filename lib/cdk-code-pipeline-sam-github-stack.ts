import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';

import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';

export class CdkCodePipelineSamGithubStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const gitHubSecretName = new cdk.CfnParameter(this, "GitHubSecretName", {
      type: "String",
      description: ""});
      
    const gitHubRepo = new cdk.CfnParameter(this, "GitHubRepo", {
      type: "String",
      description: ""});
      
    const gitHubOwner = new cdk.CfnParameter(this, "GitHubOwner", {
      type: "String",
      description: ""});
      
    const gitHubBranch = new cdk.CfnParameter(this, "GitHubBranch", {
      type: "String",
      description: ""});
      
    const myStackName = new cdk.CfnParameter(this, "MyStackName", {
      type: "String",
      description: ""});
    
    const oauth = cdk.SecretValue.secretsManager(gitHubSecretName.valueAsString);

    const artifactsBucket = new s3.Bucket(this, "ArtifactsBucket");
    
    // Pipeline creation starts
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      artifactBucket: artifactsBucket
    });
    
    // Declare source code as an artifact
    const sourceOutput = new codepipeline.Artifact();


    const githubRepo = new codepipeline_actions.GitHubSourceAction({ 
      actionName: "checkout",
      repo: gitHubRepo.valueAsString, 
      output: sourceOutput, 
      oauthToken: oauth, 
      branch: gitHubBranch.valueAsString, 
      trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
      owner: gitHubOwner.valueAsString
    });

    // Add source stage to pipeline
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        githubRepo
      ],
    });

    // Declare build output as artifacts
    const buildOutput = new codepipeline.Artifact();


    // Declare a new CodeBuild project
    const buildProject = new codebuild.PipelineProject(this, 'Build', {
      environment: { buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_2 },
      environmentVariables: {
        'PACKAGE_BUCKET': {
          value: artifactsBucket.bucketName
        }
      }
    });

    const buildRolePolicy =  new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
              "ssm:GetParameter",
              "ssm:GetParameters"
            ]
    });
    buildProject.addToRolePolicy(buildRolePolicy);

    // Add the build stage to our pipeline
    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build',
          project: buildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });
    
    /*
    const userPoolId = ssm.StringParameter.valueForStringParameter(
      this, props.myStackName+'-user-pool-id');
    const clientId = ssm.StringParameter.valueForStringParameter(
      this, props.myStackName+'-client-id');
    const allowOrigin = ssm.StringParameter.valueForStringParameter(
        this, props.myStackName+'-allow-origin');
    const site = ssm.StringParameter.valueForStringParameter(
      this, props.myStackName+'-site');
    */

    // Deploy stage
    pipeline.addStage({
      stageName: 'Dev',
      actions: [
        new codepipeline_actions.CloudFormationCreateReplaceChangeSetAction({
          actionName: 'CreateChangeSet',
          templatePath: buildOutput.atPath("packaged.yaml"),
          stackName: myStackName.valueAsString,
          adminPermissions: true,
          changeSetName: myStackName.valueAsString+'-changeset',
          runOrder: 1,
          /*parameterOverrides: {
            'UserPoolId': userPoolId,
            'Audience': clientId,
            'AllowOrigin': allowOrigin,
            'Site': site,
          }*/
        }),
        new codepipeline_actions.CloudFormationExecuteChangeSetAction({
          actionName: 'Deploy',
          stackName: myStackName.valueAsString,
          changeSetName: myStackName.valueAsString+'-changeset',
          runOrder: 2
        }),
      ],
    });


    // The code that defines your stack goes here
    
    // example resource
    // const queue = new sqs.Queue(this, 'CdkCodePipelineSamGithubQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
  
}

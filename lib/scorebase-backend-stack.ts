import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/**
 * ScoreBase Backend Stack
 * 
 * This stack defines the infrastructure for the ScoreBase Backend API:
 * - VPC with 2 AZs and NAT gateway
 * - RDS PostgreSQL (Multi-AZ, encrypted)
 * - DynamoDB event store with TTL and GSI
 * - S3 bucket for event archives
 * - Cognito User Pool for authentication
 * - Lambda function for API logic
 * - API Gateway with Cognito authorizer
 * - CloudWatch alarms for monitoring
 */
export class ScorebaseBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Environment detection (default to 'dev' if not specified)
    const environment = this.node.tryGetContext('environment') || 'dev';

    // ========================================
    // VPC with 2 AZs and 1 NAT Gateway
    // ========================================
    const vpc = new ec2.Vpc(this, 'ScoreBaseVPC', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // Task 15.2: Add resource tags
    cdk.Tags.of(vpc).add('Environment', environment);
    cdk.Tags.of(vpc).add('Feature', 'networking');

    // ========================================
    // RDS PostgreSQL Instance
    // Task 13.2: Encryption at rest enabled via storageEncrypted: true
    // Task 13.2: Credentials stored in AWS Secrets Manager
    // Task 14.1: Automated daily backups with 7-day retention
    // ========================================
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      description: 'Security group for RDS PostgreSQL instance',
      allowAllOutbound: false,
    });

    // Task 15.2: Add resource tags
    cdk.Tags.of(dbSecurityGroup).add('Environment', environment);
    cdk.Tags.of(dbSecurityGroup).add('Feature', 'database');

    // Generate database credentials and store in Secrets Manager
    const dbCredentials = new secretsmanager.Secret(this, 'DBCredentials', {
      secretName: 'scorebase/db/credentials',
      description: 'RDS PostgreSQL credentials for ScoreBase',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'scorebase_admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
      },
    });

    const database = new rds.DatabaseInstance(this, 'ScoreBaseDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      multiAz: true,
      allocatedStorage: 100,
      maxAllocatedStorage: 500,
      storageEncrypted: true,
      credentials: rds.Credentials.fromSecret(dbCredentials),
      databaseName: 'scorebase',
      // Task 14.1: Automated daily backups with 7-day retention
      backupRetention: cdk.Duration.days(7),
      preferredBackupWindow: '03:00-04:00', // Daily backup at 3 AM UTC
      deleteAutomatedBackups: false,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: true,
      enablePerformanceInsights: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
    });

    // Task 15.2: Add resource tags
    cdk.Tags.of(database).add('Environment', environment);
    cdk.Tags.of(database).add('Feature', 'database');

    // ========================================
    // DynamoDB Event Store
    // Task 13.2: Encryption at rest enabled via AWS_MANAGED encryption
    // Task 14.1: Point-in-time recovery enabled (35-day retention)
    // Task 15.1: On-demand billing mode for cost optimization
    // ========================================
    const eventTable = new dynamodb.Table(this, 'GameEventsTable', {
      tableName: 'scorebase-game-events',
      partitionKey: {
        name: 'game_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'occurred_at#event_id',
        type: dynamodb.AttributeType.STRING,
      },
      // Task 15.1: On-demand billing for cost optimization
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      // Task 14.1: Point-in-time recovery with 35-day retention
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Task 15.2: Add resource tags
    cdk.Tags.of(eventTable).add('Environment', environment);
    cdk.Tags.of(eventTable).add('Feature', 'event-store');

    // Add GSI for tenant queries
    eventTable.addGlobalSecondaryIndex({
      indexName: 'tenant-events-index',
      partitionKey: {
        name: 'tenant_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'occurred_at#event_id',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========================================
    // S3 Bucket for Event Archives
    // Task 13.2: Encryption at rest enabled via S3_MANAGED encryption
    // Task 14.1: Versioning enabled for backup and recovery
    // Task 15.1: Lifecycle policy to transition to Glacier after 365 days
    // ========================================
    const eventArchiveBucket = new s3.Bucket(this, 'EventArchiveBucket', {
      bucketName: `scorebase-event-archives-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // Task 14.1: Enable versioning for backup and recovery
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'TransitionToGlacier',
          enabled: true,
          // Task 15.1: Transition to Glacier after 365 days for cost optimization
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
        },
      ],
    });

    // Task 15.2: Add resource tags
    cdk.Tags.of(eventArchiveBucket).add('Environment', environment);
    cdk.Tags.of(eventArchiveBucket).add('Feature', 'event-archive');

    // ========================================
    // Cognito User Pool
    // ========================================
    const userPool = new cognito.UserPool(this, 'ScoreBaseUserPool', {
      userPoolName: 'scorebase-users',
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      customAttributes: {
        tenant_id: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 256,
          mutable: false,
        }),
      },
    });

    // Task 15.2: Add resource tags
    cdk.Tags.of(userPool).add('Environment', environment);
    cdk.Tags.of(userPool).add('Feature', 'authentication');

    const userPoolClient = new cognito.UserPoolClient(this, 'ScoreBaseUserPoolClient', {
      userPool,
      userPoolClientName: 'scorebase-api-client',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // ========================================
    // Lambda Function
    // ========================================
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc,
      description: 'Security group for Lambda function',
      allowAllOutbound: true,
    });

    // Allow Lambda to connect to RDS
    dbSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to RDS'
    );

    const apiFunction = new lambda.Function(this, 'ScoreBaseAPIFunction', {
      functionName: 'scorebase-api',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handlers/api-handler.handler',
      code: lambda.Code.fromAsset('lambda-package'),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      // Task 15.1: CloudWatch Logs retention set to 30 days
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        NODE_ENV: 'production',
        DB_HOST: database.dbInstanceEndpointAddress,
        DB_PORT: database.dbInstanceEndpointPort,
        DB_NAME: 'scorebase',
        DB_SECRET_ARN: dbCredentials.secretArn,
        DYNAMODB_TABLE_NAME: eventTable.tableName,
        DYNAMODB_GSI_NAME: 'tenant-events-index',
        S3_ARCHIVE_BUCKET: eventArchiveBucket.bucketName,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      },
    });

    // Task 15.1: Configure provisioned concurrency for production environment only
    if (environment === 'production') {
      const version = apiFunction.currentVersion;
      const alias = new lambda.Alias(this, 'ScoreBaseAPIAlias', {
        aliasName: 'live',
        version,
        provisionedConcurrentExecutions: 5,
      });

      // Task 15.2: Add resource tags
      cdk.Tags.of(alias).add('Environment', environment);
      cdk.Tags.of(alias).add('Feature', 'api');
    }

    // Task 15.2: Add resource tags
    cdk.Tags.of(apiFunction).add('Environment', environment);
    cdk.Tags.of(apiFunction).add('Feature', 'api');

    // Grant Lambda permissions
    dbCredentials.grantRead(apiFunction);
    eventTable.grantReadWriteData(apiFunction);
    eventArchiveBucket.grantReadWrite(apiFunction);

    // ========================================
    // VPC Endpoints for AWS Services (Task 13.3)
    // ========================================
    // VPC Endpoint for DynamoDB
    vpc.addGatewayEndpoint('DynamoDBEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [
        {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // VPC Endpoint for S3
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // VPC Endpoint for Secrets Manager
    vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      privateDnsEnabled: true,
    });

    // ========================================
    // API Gateway
    // ========================================
    const api = new apigateway.RestApi(this, 'ScoreBaseAPI', {
      restApiName: 'ScoreBase API',
      description: 'Multi-tenant REST API for sports league management',
      deployOptions: {
        stageName: 'v1',
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
      },
    });

    // Task 15.2: Add resource tags
    cdk.Tags.of(api).add('Environment', environment);
    cdk.Tags.of(api).add('Feature', 'api-gateway');

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'ScoreBaseCognitoAuthorizer',
      identitySource: 'method.request.header.Authorization',
    });

    // ========================================
    // Request Validators (Task 13.1)
    // ========================================
    
    // Request validator for body and parameters
    // Note: Currently using Lambda proxy integration which handles validation in code.
    // These validators are defined for future use when implementing non-proxy integrations.
    const requestValidator = new apigateway.RequestValidator(this, 'RequestValidator', {
      restApi: api,
      requestValidatorName: 'body-and-params-validator',
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    // JSON Schema models for request validation
    
    // Event creation request model
    // This model can be referenced in method options when moving to non-proxy integration
    const eventRequestModel = new apigateway.Model(this, 'EventRequestModel', {
      restApi: api,
      modelName: 'EventRequest',
      contentType: 'application/json',
      description: 'Schema for game event creation',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        required: ['event_type', 'payload'],
        properties: {
          event_type: {
            type: apigateway.JsonSchemaType.STRING,
            enum: [
              'GAME_STARTED',
              'GOAL_SCORED',
              'PENALTY_ASSESSED',
              'PERIOD_ENDED',
              'GAME_FINALIZED',
              'GAME_CANCELLED',
              'SCORE_CORRECTED',
            ],
            description: 'Type of game event',
          },
          payload: {
            type: apigateway.JsonSchemaType.OBJECT,
            description: 'Event-specific payload data',
          },
          metadata: {
            type: apigateway.JsonSchemaType.OBJECT,
            properties: {
              source: {
                type: apigateway.JsonSchemaType.STRING,
                maxLength: 256,
              },
              ip_address: {
                type: apigateway.JsonSchemaType.STRING,
                maxLength: 45,
              },
            },
          },
        },
        additionalProperties: false,
      },
    });

    // Suppress unused variable warnings - these are created for infrastructure documentation
    // and future use when migrating from proxy to non-proxy integration
    void requestValidator;
    void eventRequestModel;

    // ========================================
    // Documentation Lambda Function (Task 17.2)
    // ========================================
    const docsFunction = new lambda.Function(this, 'ScoreBaseDocsFunction', {
      functionName: 'scorebase-api-docs',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handlers/docs-handler.handler',
      code: lambda.Code.fromAsset('lambda-package'),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        NODE_ENV: 'production',
      },
    });

    // Task 15.2: Add resource tags
    cdk.Tags.of(docsFunction).add('Environment', environment);
    cdk.Tags.of(docsFunction).add('Feature', 'api-docs');

    // Lambda Integration for main API
    const lambdaIntegration = new apigateway.LambdaIntegration(apiFunction, {
      proxy: true,
      allowTestInvoke: true,
    });

    // Lambda Integration for documentation (no auth required)
    const docsIntegration = new apigateway.LambdaIntegration(docsFunction, {
      proxy: true,
      allowTestInvoke: true,
    });

    // Add /api-docs resource (public, no authentication)
    const apiDocsResource = api.root.addResource('api-docs');
    apiDocsResource.addMethod('GET', docsIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
    });

    // Add proxy under /api-docs for serving static files
    apiDocsResource.addProxy({
      defaultIntegration: docsIntegration,
      anyMethod: false,
      defaultMethodOptions: {
        authorizationType: apigateway.AuthorizationType.NONE,
      },
    });

    // Add proxy resource to handle all API routes (with auth)
    api.root.addProxy({
      defaultIntegration: lambdaIntegration,
      anyMethod: true,
      defaultMethodOptions: {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    });

    // ========================================
    // CloudWatch Alarms
    // ========================================
    
    // Lambda Error Rate Alarm
    new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      alarmName: 'scorebase-lambda-errors',
      alarmDescription: 'Alert when Lambda error rate exceeds threshold',
      metric: apiFunction.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Lambda Duration Alarm
    new cloudwatch.Alarm(this, 'LambdaDurationAlarm', {
      alarmName: 'scorebase-lambda-duration',
      alarmDescription: 'Alert when Lambda duration exceeds threshold',
      metric: apiFunction.metricDuration({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 3000,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // RDS Connection Count Alarm
    new cloudwatch.Alarm(this, 'RDSConnectionAlarm', {
      alarmName: 'scorebase-rds-connections',
      alarmDescription: 'Alert when RDS connection count is high',
      metric: database.metricDatabaseConnections({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // API Gateway 5xx Error Alarm
    new cloudwatch.Alarm(this, 'API5xxErrorAlarm', {
      alarmName: 'scorebase-api-5xx-errors',
      alarmDescription: 'Alert when API Gateway 5xx error rate is high',
      metric: api.metricServerError({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ========================================
    // Task 15.2: Cost Monitoring Dashboard
    // ========================================
    const costDashboard = new cloudwatch.Dashboard(this, 'CostMonitoringDashboard', {
      dashboardName: `scorebase-cost-metrics-${environment}`,
    });

    // Lambda invocations and duration (cost drivers)
    costDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: [apiFunction.metricInvocations({ statistic: 'Sum', period: cdk.Duration.hours(1) })],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration (GB-seconds)',
        left: [apiFunction.metricDuration({ statistic: 'Average', period: cdk.Duration.hours(1) })],
        width: 12,
      })
    );

    // DynamoDB consumed capacity
    costDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Read Capacity',
        left: [
          eventTable.metricConsumedReadCapacityUnits({
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Write Capacity',
        left: [
          eventTable.metricConsumedWriteCapacityUnits({
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
        ],
        width: 12,
      })
    );

    // RDS connections and CPU (cost indicators)
    costDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'RDS Database Connections',
        left: [
          database.metricDatabaseConnections({
            statistic: 'Average',
            period: cdk.Duration.hours(1),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'RDS CPU Utilization',
        left: [
          database.metricCPUUtilization({
            statistic: 'Average',
            period: cdk.Duration.hours(1),
          }),
        ],
        width: 12,
      })
    );

    // API Gateway requests (cost driver)
    costDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Requests',
        left: [api.metricCount({ statistic: 'Sum', period: cdk.Duration.hours(1) })],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway Latency',
        left: [api.metricLatency({ statistic: 'Average', period: cdk.Duration.hours(1) })],
        width: 12,
      })
    );

    // ========================================
    // Stack Outputs
    // ========================================
    new cdk.CfnOutput(this, 'APIEndpoint', {
      value: api.url,
      description: 'API Gateway endpoint URL',
      exportName: 'ScoreBaseAPIEndpoint',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'ScoreBaseUserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'ScoreBaseUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: database.dbInstanceEndpointAddress,
      description: 'RDS PostgreSQL endpoint',
      exportName: 'ScoreBaseDatabaseEndpoint',
    });

    new cdk.CfnOutput(this, 'EventTableName', {
      value: eventTable.tableName,
      description: 'DynamoDB event table name',
      exportName: 'ScoreBaseEventTableName',
    });

    new cdk.CfnOutput(this, 'EventArchiveBucketName', {
      value: eventArchiveBucket.bucketName,
      description: 'S3 event archive bucket name',
      exportName: 'ScoreBaseEventArchiveBucketName',
    });
  }
}

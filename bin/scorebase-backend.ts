#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ScorebaseBackendStack } from '../lib/scorebase-backend-stack';

const app = new cdk.App();

new ScorebaseBackendStack(app, 'ScorebaseBackendStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: 'ScoreBase Backend API - Multi-tenant, event-driven REST API for sports league management',
});

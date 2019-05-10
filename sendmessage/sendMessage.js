// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk'); // aws-sdk v2.290.0 provided by AWS

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });
require('./patch.js');

const { TABLE_NAME } = process.env;

exports.handler = async (event, context) => {
  let connectionData;
  console.log(`Called for ${event.requestContext.domainName}/${event.requestContext.stage}`);
  try {
    connectionData = await ddb.scan({ TableName: TABLE_NAME, ProjectionExpression: 'connectionId' }).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }
  
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });
  
  const postData = JSON.parse(event.body).data;
  console.log(`with data [${postData}]`);

  const postCalls = connectionData.Items.map(async ({ connectionId }) => {
    try {
      console.log(`sending client with connectionId [${connectionId}] data [${postData}]`);
      await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: postData }).promise();
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        await ddb.delete({ TableName: TABLE_NAME, Key: { connectionId } }).promise();
      } else {
        throw e;
      }
    }
  });
  
  try {
    await Promise.all(postCalls);
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  return { statusCode: 200, body: 'Data sent.' };
};

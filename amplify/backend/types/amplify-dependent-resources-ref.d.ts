export type AmplifyDependentResourcesAttributes = {
  "api": {
    "allocationApi": {
      "ApiId": "string",
      "ApiName": "string",
      "RootUrl": "string"
    }
  },
  "function": {
    "dataReader": {
      "Arn": "string",
      "LambdaExecutionRole": "string",
      "LambdaExecutionRoleArn": "string",
      "Name": "string",
      "Region": "string"
    },
    "jiraFetcher": {
      "Arn": "string",
      "BoardRefreshQueueArn": "string",
      "BoardRefreshQueueUrl": "string",
      "LambdaExecutionRole": "string",
      "LambdaExecutionRoleArn": "string",
      "Name": "string",
      "Region": "string"
    }
  }
}
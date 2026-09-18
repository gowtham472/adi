# Demonstration script

The three minute video, in order. Each step names what is on screen and the point it makes.
Timings are targets, not limits.

## Before recording

- Both stacks are deployed and healthy. `npm run demo:load` has been running against the
  demonstration application for at least fifteen minutes, so the verification baseline has
  data.
- Scenario 01 has been analyzed, deployed and verified once already, well before recording.
  Verification needs five or more minutes after the deployment, which does not fit in three
  minutes of video, so the recording shows that earlier analysis for the verification step.
  It is a real result from the same pipeline, and the video says so.
- The baseline has been restored with `npm run deploy:demo` after that run, and traffic is
  flowing normally again.

## Script

**0:00 to 0:20. The problem.** Show the ALB to ECS to RDS application answering requests.
A developer edits one number in the database security group: 5432 becomes 5433. Show the
CloudFormation change set for that edit: one modified resource, no warnings. Line: "The
change set tells you what CloudFormation will touch. It does not tell you what will break."

**0:20 to 0:50. The analysis.** In the dashboard, load the "Database port typo" example,
choose Deployed stack `adi-demo`, and analyze. The impact graph appears with
`DatabaseSecurityGroup` marked as changed and the causal path traced to `Service`.

**0:50 to 1:30. The evidence.** Open the finding. Walk the evidence by source: the diff shows
5432 is no longer allowed and 5433 does not cover it; the graph shows the database is
protected by the group and the task definition reads the database endpoint; the AWS
documentation shows that security groups do not cut existing connections, so the failure
appears as connections recycle, not at `UPDATE_COMPLETE`. Line: "Every sentence here is a
fact with a source. The severity comes from a rule, not from a model."

**1:30 to 1:55. The explanation.** Show the explanation from Claude on Amazon Bedrock, and
the label that says it was generated from the evidence below. Line: "Bedrock explains the
finding. It does not produce it, and if it is unavailable the analysis still stands."

**1:55 to 2:35. Verification.** Open the verified analysis from before recording. Show the
stack update ADI found in CloudFormation's events and the two predicted signals:
`DatabaseConnections` fell and `HTTPCode_Target_5XX_Count` rose. Status: Matched. Then show
the memory reduction scenario verified as Unconfirmed. Line: "When the evidence does not
support the prediction, ADI says so."

**2:35 to 3:00. Built on AWS.** One slide of the architecture: API Gateway, Lambda,
DynamoDB, Amazon Bedrock, CloudWatch, CloudFormation and Amplify Hosting, with the
analyzer role limited to reading one stack. Close on the question the project answers:
what will this change affect?

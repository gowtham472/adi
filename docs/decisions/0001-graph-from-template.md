# 0001. Build the dependency graph from the template

## Decision

The dependency graph comes from references in the CloudFormation template: `Ref`,
`Fn::GetAtt`, `Fn::Sub` tokens and `DependsOn`. The live account is read only to fetch the
deployed template, to map logical IDs to physical IDs for verification, and to read stack
events.

## Why

A change is proposed as a template, so the template is where its reach can be traced before
anything is deployed. Template references are explicit and exact, and every edge can be
cited with the property path it came from. Discovering relationships through `Describe`
calls would add many API calls and IAM permissions while the build window is short, and the
demonstration stack's dependencies are fully expressed in its template.

## Consequences

Dependencies that exist only at runtime, such as an endpoint hardcoded as a string, are not
visible. The engine reports what the template shows and does not guess beyond it.

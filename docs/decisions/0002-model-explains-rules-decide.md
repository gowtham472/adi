# 0002. Rules decide, the model explains

## Decision

Findings, severities, causal paths and verification signals are produced by deterministic
rules. Claude on Amazon Bedrock receives the finished findings and writes an explanation of
each. Its response is rejected unless it explains every finding exactly once and names only
resources that the finding's evidence mentions.

## Why

A finding a developer acts on must be reproducible and traceable to evidence. The same
inputs always produce the same findings, the engine can be tested without an AWS account,
and a model outage or refusal cannot change or remove a finding. The model's value is in
turning a chain of facts into a paragraph an engineer reads once, which is where language
models are strong and where a mistake is visible against the evidence shown beside it.

## Consequences

The Bedrock Messages API endpoint does not support structured outputs, so the response is
requested as JSON and validated strictly instead. An explanation that fails validation is
recorded as unavailable with the reason, and the dashboard shows the findings unchanged.

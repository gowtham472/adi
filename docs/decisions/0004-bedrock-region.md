# 0004. Request explanations from a region that serves the model

## Decision

The platform runs in `ap-south-1`, but the explanation function calls the Bedrock Messages
API endpoint in a separate region, set by the `BedrockRegion` parameter and defaulting to
`us-east-1`.

## Why

The Messages API endpoint (`bedrock-mantle`) exists in `ap-south-1`, but Claude Opus 5 and
Opus 4.8 are not offered on it there, and the endpoint does not route requests across
regions. As of September 2026, Opus 5 is offered on it in `us-east-1`, `eu-north-1`,
`eu-west-1` and `ap-southeast-4`. Calling the endpoint in the platform's own region would
fail every explanation.

The alternative, the Runtime endpoint with a global cross-region inference profile, would
keep the call in `ap-south-1`, but accounts on the AWS Free plan may not be able to use
global inference profiles.

## Consequences

Redacted findings leave the platform's region for the explanation call. Nothing else does:
templates, analyses and metrics stay in `ap-south-1`. The call gains cross-region latency,
which is small next to the model's own time, and runs asynchronously in any case (decision
0003). Deploying the platform to a region that does serve the model means setting
`BedrockRegion` to that region.

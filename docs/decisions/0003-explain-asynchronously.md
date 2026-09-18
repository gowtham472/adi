# 0003. Generate explanations asynchronously

## Decision

The API function stores the analysis and returns it immediately, then invokes a separate
explanation function asynchronously. The dashboard polls until the explanation is ready or
has failed.

## Why

API Gateway integrations time out after about 30 seconds, and a model call with adaptive
thinking can take longer. Running the explanation inside the request would make the whole
analysis fail when the model is slow, even though the deterministic result was ready in
milliseconds.

## Consequences

The explanation function has one retry and ignores analyses that are no longer pending, so a
retry cannot overwrite a stored result. If it times out entirely, the record stays pending;
the dashboard treats an explanation still pending after six minutes as unavailable.

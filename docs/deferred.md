# Deferred

Ideas that came up during the build and were deliberately not built, with the reason. Each
is a scope change under `AGENTS.md` section 2 if it is picked up.

| Idea | Why it was deferred |
|---|---|
| Collect log pattern signals from CloudWatch Logs | Only IAM task role findings declare them, and those are outside the primary scenario. Verification reports them as not collected rather than skipping them silently. |
| Discover relationships from the live account through `Describe` calls | The template already yields the graph the demonstration needs. Listed as out of scope in `README.md` section 3.2. |
| Infer edges from literal names, such as a log group name hardcoded in a task definition | Would catch dependencies the template does not express as references, but every such edge is a guess and would need its own confidence level. |
| Store large analyses in S3 | DynamoDB's item limit is ample for the demonstration stack. Oversized analyses are rejected with a clear 413 instead. |
| Authentication for the API and dashboard | Out of scope. Route throttling bounds what an anonymous caller can trigger. |
| Client side refusal fallback for the Bedrock call | A refusal is recorded as an unavailable explanation, and the deterministic findings are the fallback by design. The client side middleware also depends on a beta header whose support on the Bedrock endpoint was not confirmed. |
| Code splitting the dashboard bundle | 172 KB gzipped, mostly React Flow and the bundled example templates. Acceptable for a single page tool. |

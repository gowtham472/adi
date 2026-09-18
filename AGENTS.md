# Engineering Instructions

These rules apply to every contributor, human or agent, working in this repository. They are
not style suggestions. A change that violates them is not ready to merge.

Read `README.md` first. This file assumes you know what the project is.

---

## 1. Prime directive

The goal is a working end to end pipeline for the primary scenario in `README.md` section 6,
deployed and demonstrable, by 20 September 2026.

Every task is judged against that goal. Before starting any piece of work, answer:

1. Does this appear in the demonstration, or is it required by something that does?
2. Is it in scope per `README.md` section 3.1?

If the answer to either is no, do not build it. Write it down in `docs/deferred.md` and move
on.

A repository full of well structured code that does not run end to end is a failure. A
narrower system that runs reliably is not.

## 2. Scope discipline

The scope in `README.md` section 3 is fixed. It was set deliberately against a hard deadline.

- Do not add AWS services beyond the six listed.
- Do not add a seventh rule.
- Do not add abstraction for a use case that is listed as out of scope.
- Do not refactor working code toward a future requirement that does not exist yet.

If you believe scope must change, stop, state the case in one paragraph, and get agreement
before writing code. Silent scope growth is the single most likely cause of failure on this
timeline.

When behind schedule, cut optional work. Never defer the current day's objective.

## 3. Verification before every commit

Nothing is committed without evidence that it works and that it broke nothing.

Run, in order, and require all four to pass:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Beyond the gate, the following applies per change type:

| Change touches | Additional requirement |
|---|---|
| `engine/src/core` | Unit tests cover the new behavior and every existing scenario test still asserts its expected findings. |
| A rule | A fixture pair exists in `scenarios/` and a scenario test asserts the exact expected finding, including severity and causal path. |
| `engine/src/aws` | Exercised against a real response, either live or a captured fixture. Not assumed from documentation. |
| `engine/src/api` | The endpoint is invoked and the response shape checked against the declared contract. |
| `web` | Rendered and clicked through locally. A screenshot is not proof that the data path works. |
| `infrastructure` | Deployed to the real account with `sam deploy` or `aws cloudformation deploy`, and the stack reaches a stable state. |

If a test cannot be written for a change, that is information about the design, not a reason
to skip the test.

Never commit code you have not run. Never claim a task is done based on the code looking
correct.

## 4. Code standards

**TypeScript, strict mode, Node 22.** `any` is not permitted. If a type is genuinely unknown,
use `unknown` and narrow it explicitly. Parsed CloudFormation is the main place this matters:
narrow it at the parser boundary and pass typed domain objects inward, rather than threading
loose structures through the engine.

**The stack is fixed.** TypeScript, React with Vite and React Flow, AWS SAM for the platform
stack, plain CloudFormation for the demo stack, Vitest, npm workspaces. Introducing another
language, framework, test runner or package manager is a scope change and follows section 2.

**Core stays pure.** `engine/src/core` must not import the AWS SDK, read environment variables, or
perform IO. It receives normalized domain objects and returns domain objects. This is what
makes the engine testable without an AWS account.

**Errors are handled where they can be answered.** Do not swallow an error to make a test
pass. Do not catch and re-log without adding information. If the analysis cannot complete,
the API returns a clear failure, not a partial result presented as complete.

**No dead code.** No commented out blocks, no unused exports, no files kept in case they are
needed later. Delete it. Version control remembers.

**No speculative abstraction.** Two concrete implementations before you extract an interface.
The adapter pattern in this codebase exists because there are real adapters, not because
there might be.

**Naming is literal.** `buildDependencyGraph`, not `processData`. `ChangedResource`, not
`Item`. A reader should not have to open a function to learn what it returns.

## 5. Comments

Comments explain reasoning that the code cannot express. They do not narrate the code.

Write comments for:

- Why a non-obvious approach was chosen over the obvious one.
- AWS behavior that is surprising and that the code has to work around, with a link to the
  documentation.
- Assumptions about input that the type system does not enforce.
- The boundary of a deliberate simplification, so the next reader knows it was a decision.

Do not write:

- Restatements of the line below them.
- Section banners made of punctuation.
- Emoji.
- Enthusiasm. No "magic happens here", no "this is the clever bit", no exclamation marks.
- `TODO` without a name and a concrete condition. `// TODO: handle Fn::ImportValue once
  cross stack references are in scope` is acceptable. `// TODO: improve this` is not.
- Any reference to how the code was produced, including references to AI assistance.

Acceptable:

```ts
// CloudFormation resolves Fn::Sub references at deploy time, so the template text alone
// does not show the dependency. We parse the ${Resource} tokens to recover the edge.
```

Not acceptable:

```ts
// Loop through the resources and add them to the graph
```

## 6. Commit messages

Commits are read by reviewers and by judges. Write them accordingly.

Format: Conventional Commits, imperative mood, lower case subject, no trailing period, at
most 72 characters in the subject.

```
feat(core): resolve Fn::GetAtt references into graph edges

fix(rules): treat an empty ingress list as full removal rather than no change

test(scenarios): assert causal path ordering for NET-SG-001
```

Scopes in use: `core`, `aws`, `api`, `web`, `infra`, `scenarios`, `docs`.

The body is required when the change is not self evident. Explain why the change was made and
what alternative was rejected. Do not restate the diff.

Rules:

- One logical change per commit. A commit that touches the rule engine and the dashboard
  layout is two commits.
- Every commit must build and pass tests on its own.
- No `wip`, `fix`, `update`, `changes`, `misc` or `stuff` as a subject.
- No emoji.
- No reference in the message body to how the code was produced. Standard trailers such as
  `Co-Authored-By` are fine, and belong at the end as trailers, not in the prose.

## 7. AWS and security

- The analyzer role is read only. `Describe*`, `Get*`, `List*` and `cloudwatch:GetMetricData`
  only. No `Create`, `Update`, `Delete` or `Put` against analyzed infrastructure.
- Nothing in this repository contains an access key, a secret key, a session token, a
  database password or an account number outside of the demo stack parameters. Check before
  every commit.
- The frontend receives no AWS credentials. It talks to API Gateway and nothing else.
- Sanitize before Bedrock. Strip environment variable values, connection strings, parameter
  values marked `NoEcho`, and anything matching a secret pattern, before any template content
  reaches the model.
- The Bedrock prompt instructs the model to use only supplied evidence and to distinguish
  fact from inference. If the model returns a resource name that is not in the evidence set,
  the response is rejected rather than displayed.

## 8. Honesty in output

This project claims to be evidence based. That claim is only worth making if it is true.

- Never hardcode a finding, a metric value, a graph edge or a verification result to make a
  demonstration work.
- Never present a mocked value in the dashboard without labeling it as fixture data.
- If the verification pass cannot determine whether the prediction held, it reports
  `UNCONFIRMED`. It does not report `MATCHED`.
- If Bedrock is unavailable, the dashboard shows the deterministic findings and states that
  the explanation is unavailable. It does not substitute a canned paragraph.
- Do not report a task as complete when part of it was skipped. Say which part and why.

## 9. When blocked

Do not invent an AWS API response, a metric name, a template property or a service behavior.
Check the documentation or call the API and observe the real response.

If a decision materially changes the work and cannot be resolved from the repository, stop
and ask. Do not guess and build for an hour in the wrong direction.

If a piece of work is taking longer than planned, say so immediately rather than at the end
of the day. On this timeline the cost of a late warning compounds.

## 10. Definition of done

A task is done when all of the following hold:

1. The behavior works when run, not when read.
2. Tests cover it and the full suite passes.
3. Typecheck, lint and build pass.
4. No existing scenario test regressed.
5. No secret, credential or account identifier was introduced.
6. The commit message explains the change to someone who was not present.
7. It is in scope.

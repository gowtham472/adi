# 0005. Verify automatically after each stack update

## Decision

Verification runs by itself after every update of the analyzed stack. CloudFormation
publishes stack status changes to the EventBridge default event bus. A rule matching
`UPDATE_COMPLETE` and `UPDATE_ROLLBACK_COMPLETE` for the analyzed stack starts a Step
Functions workflow. The workflow waits six minutes, then invokes a function that verifies
every analysis of that stack from the last day that has findings and no verification yet.
Choosing Verify deployment in the dashboard still works, and results record which of the
two produced them.

## Why

A prediction that is only checked when someone remembers to come back is rarely checked.
Verification needs no human judgement to start: the deployment it measures is already in
CloudFormation's events, and the signals are already declared in the findings.

The wait matters. Verification compares whole minutes of CloudWatch data after the update,
and a run straight after `UPDATE_COMPLETE` would find none. Six minutes gives five complete
minutes of observation, which the live runs in `docs/live-verification.md` showed to be
enough for a clear verdict.

A Step Functions Wait state was chosen over the alternatives:

- A function that sleeps would be billed for six idle minutes per update and would sit close
  to its timeout.
- An EventBridge Scheduler one-time schedule would need a function to create it, and leaves
  schedules to clean up.
- A Wait state costs nothing while it waits, and each run appears in the console with its
  input, timing and output, which makes an automatic verification easy to inspect.

## Consequences

- The workflow reads the analyzed stack's events, resources, metrics and logs through a role
  with the same read only scope as the API. It cannot change the stack.
- Analyses are found by scanning the stored summaries. That is adequate for one stack's
  recent history; many stacks or a long history would call for an index by stack name.
- An analysis whose deployment has not started or finished is skipped, with the reason in
  the workflow's output, and is picked up by a later update.
- Every update starts a workflow, including a rollback or a restore to a healthy baseline.
  Analyses that are already verified are left alone, so a restore does not overwrite a
  result.

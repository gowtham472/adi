# Live verification record

Every prediction ADI makes carries signals that should move if the prediction is right.
This record documents the runs made against the live demonstration stack: what was
deployed, what ADI predicted, what CloudWatch measured, and the verdict. All values below
were read back from the stored verification records through the API, not transcribed from
notes.

## Method

| Item | Setting |
|---|---|
| Environment | Stack `adi-demo` in `ap-south-1`: Application Load Balancer, two ECS Fargate tasks, RDS PostgreSQL `db.t4g.micro` (see `infrastructure/demo/baseline.yaml`) |
| Traffic | `npm run demo:load` at 5 requests per second, running for at least 15 minutes before each deployment |
| Procedure | Analyze against the deployed stack, deploy the scenario's template, wait at least five minutes, verify, restore the baseline with `npm run deploy:demo` |
| Baseline window | The 15 minutes before the stack update started |
| Observed window | From update completion for up to 15 minutes, ending early at the time of verification or at the start of the next stack update |
| Aggregation | One minute datapoints, whole minutes only. Counts use `Sum` with missing minutes as zero; log patterns are matching lines per minute |
| Movement threshold | A change counts only if it exceeds both 25% of the larger value and an absolute floor (1 for counts, maximums and minimums; 0.5 for averages) |
| Verdicts | `MATCHED` when every signal with data moved as predicted; `CONTRADICTED` when any moved against it; `UNCONFIRMED` otherwise |

## Results

Final values, re-verified on 19 September 2026 at 09:36 UTC with the code as of commit
`fix(core): end the observation window at the next stack update`. CloudWatch retains the
original datapoints, so re-verification re-reads the same measurements.

| Scenario | Analysis | Input | Stack update (UTC) | Rule and severity | Signal | Before | After | Movement | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 01 Database port typo | `95390798` | Proposed template | 18 Sep 14:17:32 to 14:17:44 | NET-SG-001, HIGH | RDS `DatabaseConnections` (average) | 2 | 0 | Fell, as predicted | **MATCHED** |
| | | | | | ALB target 5XX per minute | 0 | 290.3 | Rose, as predicted | |
| 01 Database port typo | `e02ea13d` | Change set `scenario-01` | 18 Sep 14:45:20 to 14:45:31 | NET-SG-001, HIGH | RDS `DatabaseConnections` (average) | 2 | 0 | Fell, as predicted | **MATCHED** |
| | | | | | ALB target 5XX per minute | 0 | 290.8 | Rose, as predicted | |
| | | | | | Connection errors in container logs per minute | 0 | 246.4 | Rose, as predicted | |
| 02 Secret permission removed | `ed20b6d9` | Proposed template | 19 Sep 05:07:22 to 05:07:46 | IAM-POL-001, HIGH | ALB `HealthyHostCount` (minimum) | 2 | 2 | No movement | **UNCONFIRMED** |
| 04 Task memory halved | `9e9e600b` | Proposed template | 18 Sep 17:26:20 to 17:29:53 | ECS-RES-001, MEDIUM | ECS `MemoryUtilization` (maximum, %) | 2.68 | 3.74 | Rose, as predicted | **MATCHED** |

What the results show:

- **Scenario 01** fails exactly as predicted. Requests from the load generator switched
  from 200 to 500 within about 20 seconds of the update completing, as pooled connections
  recycled. That is the delay the finding's documentation evidence describes. The run
  through a change set shows ADI reading the change before it was executed; the log
  signal adds an independent confirmation from the application's own output.
- **Scenario 02** stays unconfirmed, and correctly so. Running tasks already hold the
  secret, so nothing fails until a task restarts. No restart happened during the
  observation window, so the signal did not move, and ADI did not treat silence as
  confirmation.
- **Scenario 04** matches, but only in the narrow sense its signal claims: utilization
  rose against the halved allocation. The application stayed far from its new limit. A
  match confirms that a predicted signal moved, not that the change was harmful, which is
  why the finding is MEDIUM.

Scenarios 03, 05 and 06 have not been run live. Their findings are covered by the scenario
tests in `tests/scenarios`, which assert the exact expected output of every scenario.

## Earlier readings and what they exposed

The first verification of each run, made at the time, gave these readings. The
differences from the final values come from three defects the live runs exposed, all
since fixed.

| Run | First verified (UTC) | First reading | Final reading | Cause of the difference |
|---|---|---|---|---|
| 01, template | 18 Sep 14:24 | MATCHED; 5XX 3.1 to 285.2 a minute | MATCHED; 5XX 0 to 290.3 a minute | The minute the update started in, which already held errors, was counted in the baseline. Fixed by comparing whole minutes only |
| 01, change set | 18 Sep 14:51 | MATCHED; 5XX 0 to 232.8, logs 0 to 253.5 a minute | MATCHED; 5XX 0 to 290.8, logs 0 to 246.4 a minute | Verified six minutes after the update, so the observed window was shorter. Both readings are correct for their windows |
| 04 | 18 Sep 17:36 | MATCHED; memory 2.68% to 3.71% | MATCHED; memory 2.68% to 3.74% | A re-verification on 19 Sep at 06:46 read UNCONFIRMED (3.23%), because its window ran past the 17:37 rollback to the baseline. Fixed by ending observation at the next stack update |
| 02 | 19 Sep 05:14 | UNCONFIRMED; 2 to 2 | UNCONFIRMED; 2 to 2 | None |

A third defect was found before any verification ran: the explanation function called
Claude on the Bedrock Messages API in `ap-south-1`, where the model is not offered. See
[decision 0004](decisions/0004-bedrock-region.md).

## Reproducing a run

With the stacks deployed (see the README, section 9):

1. Start traffic and leave it running for 15 minutes:
   `npm run demo:load -- <ApplicationUrl>`
2. Analyze the scenario against stack `adi-demo` in the dashboard, or through the API.
3. Deploy the scenario's template:
   `aws cloudformation deploy --template-file scenarios/<scenario>/after.yaml --stack-name adi-demo --capabilities CAPABILITY_IAM --region ap-south-1`
4. Wait at least five minutes, then choose Verify deployment.
5. Restore the baseline with `npm run deploy:demo`.

Results vary with traffic and timing, but the direction of each signal, and so the
verdict, should repeat.

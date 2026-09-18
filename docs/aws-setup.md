# Setting up AWS for ADI

This guide assumes no AWS experience. It goes from a new AWS account to a deployed platform
and demonstration stack on Windows. Expect about an hour of work, plus 15 to 20 minutes of
waiting while the database is created.

Console screens change over time. If a button has moved, search for the page name in the
search bar at the top of the AWS console.

## 1. What it costs

| What | When it costs | Estimate |
|---|---|---|
| Demonstration stack: load balancer, two Fargate tasks, a PostgreSQL database, public IP addresses | Every hour it exists, even with no traffic | About US$0.10 an hour, roughly US$2.50 a day |
| ADI platform: Lambda, API Gateway, DynamoDB, Amplify Hosting | Per request | Cents for the whole hackathon |
| Claude on Amazon Bedrock | Per analysis with findings | A few cents per analysis |

These are estimates from the published `ap-south-1` prices, not quotes. The demonstration
stack is the only thing that costs money while idle, so delete it when you are not using
it (section 9). Deploy it again when you need it.

A new AWS account comes with US$100 of credit, and up to US$100 more for trying out
services (section 2). That covers this project several times over, **with or without the
hackathon credit**.

## 2. Your account plan and the hackathon credit

New AWS accounts choose between two plans:

| | Free plan | Paid plan |
|---|---|---|
| Sign up credit | US$100, plus up to US$100 for activities | The same |
| When credits run out or after 6 months | The account closes. Data is kept 90 days, then deleted | Usage is charged to your card |
| Some services and features | Restricted | All available |

**The hackathon credit.** AWS's billing documentation says Free plan accounts are not
eligible for promotional credits. In practice, the hackathon's US$100 code redeemed on a
Free plan account in September 2026, so try it before upgrading. In the console, go to
**Billing and Cost Management → Credits** and choose **Redeem credit**. Promotional credits
do not cover AWS Marketplace charges, which may include Claude on Bedrock.

### What to do

1. Check your credit balance. Open the console, search for **Billing and Cost Management**,
   and choose **Credits** in the left menu. You should see the sign up credit.
2. **Stay on the Free plan for now.** The sign up credit is enough for this project.
3. Do the check in section 6. If Claude answers, you do not need to change anything.
4. Upgrade only if section 6 fails because of your plan, or if a promotional code is refused.
   On the console home page, or at **Billing and Cost Management → Free Tier**, choose
   **Upgrade plan**. Your remaining credit carries over to the Paid plan. The upgrade cannot
   be undone, and anything the credit does not cover is charged to your card, so set up the
   alert in section 3 first.

### Earning the extra credit

The **Explore AWS** panel on the console home page lists five activities worth US$20
each. Two of them are part of this guide anyway:

- Setting up a budget alert (section 3).
- Sending a prompt in the Amazon Bedrock playground (section 6).

## 3. Set up a cost alert

Do this before deploying anything.

1. In the console search bar, open **Billing and Cost Management**, then **Budgets**.
2. Choose **Create budget**.
3. Choose **Use a template (simplified)**, then **Zero spend budget**.
4. Enter your email address and choose **Create budget**.

AWS will email you when the account starts accruing charges. Check the **Credits** page to
see whether your credit covered them.

## 4. Create an administrator user

The email and password you signed up with are the **root user**. It can do anything,
including closing the account, so it should not be used day to day.

1. Protect the root user. Open **IAM** from the search bar. The dashboard recommends adding
   MFA for the root user. Choose **Add MFA** and follow the steps with an authenticator app
   on your phone.
2. In IAM, choose **Users**, then **Create user**.
3. User name: `adi-admin`. Tick **Provide user access to the AWS Management Console**.
   Choose **I want to create an IAM user**, set a custom password, and untick
   **Users must create a new password at next sign-in**. Choose **Next**.
4. Choose **Attach policies directly**, search for `AdministratorAccess`, tick it, choose
   **Next**, then **Create user**.
5. Copy the **Console sign-in URL** shown on the last page, then sign out.
6. Open that URL and sign in as `adi-admin`. Use this user from now on.

`AdministratorAccess` is broad. It is acceptable for a personal account used for one
project. Do not create one like this in an account shared with others.

## 5. Install the tools and sign in from the terminal

You already have Node.js and Git. Two more tools are needed.

1. **AWS CLI.** Download and run <https://awscli.amazonaws.com/AWSCLIV2.msi>.
2. **AWS SAM CLI.** Download and run
   <https://github.com/aws/aws-sam-cli/releases/latest/download/AWS_SAM_CLI_64_PY3.msi>.
   SAM does not need Docker for this project.
3. **Open a new terminal.** Terminals that were already open do not see newly installed
   tools. Check both tools:

   ```bash
   aws --version
   ```

   ```bash
   sam --version
   ```

   The AWS CLI must be version 2.32.0 or later for the next step.

4. **Sign in.** This opens your browser. Sign in as `adi-admin` and approve the request.
   If the terminal asks for a region, enter `ap-south-1`.

   ```bash
   aws login --profile adi-login
   ```

5. **Let every tool use that sign in.** The AWS CLI understands `aws login` directly, but
   SAM and some SDKs may not yet. These two commands make the default profile borrow
   credentials from the signed in profile, so every tool works the same way:

   ```bash
   aws configure set region ap-south-1
   ```

   ```bash
   aws configure set credential_process "aws configure export-credentials --profile adi-login --format process"
   ```

6. **Check it.** The output should show your account number and `user/adi-admin`.

   ```bash
   aws sts get-caller-identity
   ```

The sign in lasts up to 12 hours. When commands start failing with `ExpiredToken` or
`Unable to locate credentials`, run `aws login --profile adi-login` again. No other step
needs repeating.

## 6. Check that Claude is available on Bedrock

ADI calls Claude in the US East (N. Virginia) region, because Claude Opus 5 is not offered
on the Bedrock Messages API in Mumbai. See
[decision 0004](decisions/0004-bedrock-region.md) for the details.

1. In the console, open the region menu at the top right and choose
   **US East (N. Virginia) us-east-1**.
2. Open **Amazon Bedrock** from the search bar, then choose **Playground**, or **Chat**
   under Playgrounds.
3. Choose the model **Anthropic → Claude Opus 5**. If the console asks for use case details,
   describe the project honestly, for example: personal hackathon project that explains
   the risk of infrastructure changes.
4. Send a short message, such as `Hello`.

What the result means:

| Result | Meaning | What to do |
|---|---|---|
| Claude answers | Your account can use the model. The first use also subscribed your account to it, so the platform can call it too | Continue to section 7 |
| Opus 5 is not in the list | The model is not offered to your account | Try Claude Opus 4.8, and deploy with the override in section 7 |
| An error mentioning AWS Marketplace, a payment method or your account plan | The Free plan is blocking third party models | Upgrade the plan (section 2), then try again |

Switch the region menu back to **Asia Pacific (Mumbai) ap-south-1** afterwards. Everything
else in this project lives there.

## 7. Deploy

Run these from the project folder. They use the credentials from section 5.

1. **Install and check the project.** This runs the same checks as CI.

   ```bash
   npm ci
   ```

   ```bash
   npm run verify
   ```

2. **Deploy the demonstration stack.** This is the slowest step, 15 to 20 minutes, mostly
   the database.

   ```bash
   npm run deploy:demo
   ```

3. **Deploy the ADI platform.**

   ```bash
   npm run deploy:platform
   ```

   If section 6 only worked with Opus 4.8, use this instead:

   ```bash
   npm run deploy:platform -- --parameter-overrides BedrockModelId=anthropic.claude-opus-4-8
   ```

4. **Publish the dashboard.** The last line printed is the dashboard URL.

   ```bash
   npm run deploy:dashboard
   ```

5. **Find the demonstration application's URL.** Look for `ApplicationUrl` in the output.

   ```bash
   aws cloudformation describe-stacks --stack-name adi-demo --query "Stacks[0].Outputs" --output table
   ```

6. **Start traffic** against it and leave it running during the demonstration. Replace the
   URL with yours.

   ```bash
   npm run demo:load -- http://your-application-url
   ```

From here, follow steps 5 and 6 of the README's deployment section, or
[docs/demo-script.md](demo-script.md) for the full recorded sequence.

## 8. When something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `aws` or `sam` is not recognized | The terminal was open before the install | Open a new terminal |
| `ExpiredToken` or `Unable to locate credentials` | The 12 hour sign in ended | `aws login --profile adi-login` |
| A stack is in `ROLLBACK_COMPLETE` | Its first deployment failed, and CloudFormation cannot update it | Read the error in the stack's **Events** tab in the CloudFormation console, fix it, delete the stack, and deploy again |
| `No changes to deploy` | The stack already matches the template | Nothing is wrong |
| The dashboard shows the explanation as unavailable | The Bedrock call failed | Check section 6. Then read the function's log: `sam logs --stack-name adi-platform --name ExplainFunction --region ap-south-1` |
| Verification finds no deployment | The update ran against a different stack or region | Deploy with `--stack-name adi-demo --region ap-south-1`, as the README shows |

## 9. Stop paying when you are done

Delete the demonstration stack whenever you are not using it. It deletes the database with
it, and nothing in it needs keeping.

```bash
aws cloudformation delete-stack --stack-name adi-demo --region ap-south-1
```

After the hackathon, delete the platform as well:

```bash
aws cloudformation delete-stack --stack-name adi-platform --region ap-south-1
```

Deleting takes a few minutes. The stacks disappear from the CloudFormation console when it
is complete. SAM also leaves behind a stack named `aws-sam-cli-managed-default`, which holds
an almost empty storage bucket and costs close to nothing. To remove it, empty the bucket in
the S3 console first, then delete the stack.

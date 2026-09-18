/**
 * Builds the dashboard against the deployed API and publishes it to Amplify Hosting.
 *
 * Reads the API URL and Amplify app ID from the platform stack outputs, builds with
 * VITE_API_URL set, zips the build in process so the script behaves the same on Windows,
 * macOS and Linux, then runs a manual Amplify deployment and waits for it to finish.
 *
 * Usage: node infrastructure/platform/deploy-dashboard.mjs
 * Environment: PLATFORM_STACK (default adi-platform), AWS_REGION (default ap-south-1)
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stackName = process.env.PLATFORM_STACK ?? 'adi-platform';
const region = process.env.AWS_REGION ?? 'ap-south-1';
const branch = 'main';

function aws(args) {
  const output = execFileSync('aws', [...args, '--region', region, '--output', 'json'], { encoding: 'utf8' });
  return JSON.parse(output);
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const stack = aws(['cloudformation', 'describe-stacks', '--stack-name', stackName]).Stacks[0];
const outputs = Object.fromEntries(stack.Outputs.map((o) => [o.OutputKey, o.OutputValue]));
for (const key of ['ApiUrl', 'DashboardAppId', 'DashboardUrl']) {
  if (outputs[key] === undefined) {
    throw new Error(`Stack ${stackName} has no ${key} output; deploy the platform stack first`);
  }
}

console.log(`Building the dashboard against ${outputs.ApiUrl}`);
execFileSync('npm', ['run', 'build', '--workspace', '@adi/web'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_API_URL: outputs.ApiUrl },
  shell: process.platform === 'win32',
});

const dist = join(root, 'web', 'dist');
const archive = zipSync(
  Object.fromEntries(filesUnder(dist).map((path) => [relative(dist, path).split('\\').join('/'), readFileSync(path)])),
);

const appId = outputs.DashboardAppId;
const { jobId, zipUploadUrl } = aws(['amplify', 'create-deployment', '--app-id', appId, '--branch-name', branch]);
const upload = await fetch(zipUploadUrl, { method: 'PUT', body: archive, headers: { 'content-type': 'application/zip' } });
if (!upload.ok) {
  throw new Error(`Uploading the build failed with status ${upload.status}`);
}
aws(['amplify', 'start-deployment', '--app-id', appId, '--branch-name', branch, '--job-id', jobId]);

const TERMINAL = new Set(['SUCCEED', 'FAILED', 'CANCELLED']);
let status = 'PENDING';
while (!TERMINAL.has(status)) {
  await new Promise((done) => setTimeout(done, 5000));
  status = aws(['amplify', 'get-job', '--app-id', appId, '--branch-name', branch, '--job-id', jobId]).job.summary.status;
  console.log(`Deployment ${jobId}: ${status}`);
}
if (status !== 'SUCCEED') {
  throw new Error(`Amplify deployment ${jobId} ended with status ${status}`);
}
console.log(`Dashboard published at ${outputs.DashboardUrl}`);

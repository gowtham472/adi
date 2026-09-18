/**
 * Sends steady traffic to the demonstration application so CloudWatch has signals to
 * compare. Load balancer metrics are only published while requests flow, and the database
 * connection count only reflects open pool connections, so verification needs this running
 * from before the deployment until after it.
 *
 * Usage: node infrastructure/demo/generate-load.mjs <application url> [requests per second]
 * The application URL is the ApplicationUrl output of the demonstration stack.
 */
const [url, rateArgument = '5'] = process.argv.slice(2);
if (url === undefined) {
  console.error('Usage: node infrastructure/demo/generate-load.mjs <application url> [requests per second]');
  process.exit(1);
}
const rate = Number(rateArgument);
if (!Number.isFinite(rate) || rate <= 0 || rate > 50) {
  console.error('Requests per second must be between 0 and 50');
  process.exit(1);
}

const counts = new Map();
function record(outcome) {
  counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
}

async function send() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    record(String(response.status));
    await response.arrayBuffer();
  } catch {
    record('error');
  }
}

setInterval(() => void send(), 1000 / rate);
setInterval(() => {
  const summary = [...counts.entries()].map(([outcome, count]) => `${outcome}: ${count}`).join('  ');
  console.log(`${new Date().toISOString()}  ${summary || 'waiting for responses'}`);
  counts.clear();
}, 10000);

console.log(`Sending ${rate} requests per second to ${url}. Press Ctrl+C to stop.`);

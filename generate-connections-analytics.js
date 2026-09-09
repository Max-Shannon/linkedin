const fs = require('fs');
const path = require('path');
const { loadConnectionsCsv } = require('./lib/connections-csv');
const { snapshotAll, writeProtectedFile } = require('./lib/rolling-backup');
const { computeConnectionsAnalytics } = require('./lib/connections-analytics');
const { renderConnectionsAnalyticsHtml } = require('./lib/render-connections-analytics-html');

const DEFAULT_INPUT = path.join(__dirname, 'connections.csv');
const DEFAULT_OUTPUT = path.join(__dirname, 'connections-analytics.html');

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    open: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--open') {
      args.open = true;
      continue;
    }
    if (arg === '--input' && argv[i + 1]) {
      args.input = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--output' && argv[i + 1]) {
      args.output = path.resolve(argv[i + 1]);
      i += 1;
    }
  }

  return args;
}

async function maybeOpenInBrowser(filePath) {
  const { execFile } = require('child_process');
  const platform = process.platform;
  let command;
  let commandArgs;

  if (platform === 'darwin') {
    command = 'open';
    commandArgs = [filePath];
  } else if (platform === 'win32') {
    command = 'cmd';
    commandArgs = ['/c', 'start', '', filePath];
  } else {
    command = 'xdg-open';
    commandArgs = [filePath];
  }

  await new Promise((resolve, reject) => {
    execFile(command, commandArgs, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.input)) {
    console.error(`Input CSV not found: ${args.input}`);
    console.error('Run npm run connections:download first.');
    process.exit(1);
  }

  const connections = loadConnectionsCsv(args.input);
  if (connections.length === 0) {
    console.error(`No connections found in ${args.input}`);
    process.exit(1);
  }

  snapshotAll();
  const analytics = computeConnectionsAnalytics(connections);
  const html = renderConnectionsAnalyticsHtml(analytics);
  writeProtectedFile(args.output, html);

  console.log(`Analysed ${connections.length} connection(s).`);
  console.log(`Analytics page written to: ${args.output}`);

  if (args.open) {
    await maybeOpenInBrowser(args.output);
    console.log('Opened in your default browser.');
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});

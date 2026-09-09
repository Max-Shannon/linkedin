const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'linkedin-backup-'));
process.env.LINKEDIN_BACKUP_ROOT = tmp;

const {
  snapshotFile,
  snapshotAll,
  writeProtectedFile,
  removeProtectedFile,
  listBackups,
  isProtectedPath,
} = require('../lib/rolling-backup');
const { writeConnectionsCsv, loadConnectionsCsv } = require('../lib/connections-csv');

const csvPath = path.join(tmp, 'connections.csv');
fs.writeFileSync(csvPath, `${'name,title\n'}${'x,'.repeat(1)}big\n`.repeat(4000), 'utf8');
const largeSize = fs.statSync(csvPath).size;

const first = snapshotFile(csvPath, { force: true });
assert.ok(first);
assert.ok(fs.existsSync(first));
assert.strictEqual(fs.statSync(first).size, largeSize);

writeProtectedFile(csvPath, 'name,title,profile_url,vanity_name,connected_on,disconnected,disconnected_on\nAda,Engineer,https://www.linkedin.com/in/ada/,ada,,,\n');
assert.ok(fs.statSync(csvPath).size < largeSize);

const backups = listBackups().filter((row) => row.name === 'connections.csv');
assert.ok(backups.some((row) => row.size === largeSize), 'largest copy must survive a shrink');

const outside = path.join(os.tmpdir(), `outside-connections-${Date.now()}.csv`);
writeConnectionsCsv(
  [
    {
      name: 'Ada',
      title: 'Engineer',
      profileUrl: 'https://www.linkedin.com/in/ada/',
      vanityName: 'ada',
      connectedOn: '',
      disconnected: false,
      disconnectedOn: '',
    },
  ],
  outside
);
assert.strictEqual(isProtectedPath(outside), false);
assert.strictEqual(snapshotFile(outside, { force: true }), null);
assert.strictEqual(loadConnectionsCsv(outside).length, 1);

fs.writeFileSync(path.join(tmp, 'remove-connections-state.json'), '{"removed":{"ada":{}}}\n');
const copied = snapshotAll();
assert.ok(copied.length >= 1);

removeProtectedFile(csvPath);
assert.strictEqual(fs.existsSync(csvPath), false);
assert.ok(listBackups().some((row) => row.name === 'connections.csv' && row.size === largeSize));

fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(outside, { force: true });
console.log('rolling-backup tests passed');

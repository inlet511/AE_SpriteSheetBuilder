const {readdirSync} = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tests = readdirSync(path.join(root, 'tests'))
    .filter(name => name.endsWith('.test.cjs')).sort();
if (!tests.length) throw new Error('No test suites found.');
for (const name of tests) {
    console.log(`\n${name}`);
    const result = spawnSync(process.execPath, [path.join(root, 'tests', name)], {
        cwd: root, stdio: 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`\nPASS: ${tests.length} suites. AE rendering requires manual verification.`);

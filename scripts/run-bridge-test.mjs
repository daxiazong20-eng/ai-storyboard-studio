import { spawnSync } from 'node:child_process';

const candidates = process.platform === 'win32'
  ? [['python', []], ['py', ['-3']]]
  : [['python3', []], ['python', []]];

for (const [command, prefix] of candidates) {
  const result = spawnSync(command, [...prefix, 'scripts/verify_bridge_requests.py'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.error?.code === 'ENOENT') continue;
  process.exit(result.status ?? 1);
}

console.error('Python 3 was not found. Install Python 3.11–3.13 and retry.');
process.exit(1);

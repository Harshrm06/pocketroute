import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const vitestArgs = ['run'];

function mapFilter(target) {
  if (target === '@pocketroute/api' || target === 'api') return 'apps/api';
  if (target === '@pocketroute/web' || target === 'web') return 'apps/web';
  return target.replace(/^@pocketroute\//, 'packages/');
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (!arg) continue;

  if (arg === '--filter' && i + 1 < args.length) {
    const target = args[++i];
    if (target) {
      vitestArgs.push(mapFilter(target));
    }
  } else if (arg.startsWith('--filter=')) {
    const target = arg.slice('--filter='.length);
    vitestArgs.push(mapFilter(target));
  } else {
    vitestArgs.push(arg);
  }
}

const vitestBin = path.resolve('node_modules/vitest/vitest.mjs');

const child = spawn(process.execPath, [vitestBin, ...vitestArgs], {
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

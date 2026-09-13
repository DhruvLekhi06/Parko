import { spawn } from 'node:child_process';

const procs = [
  spawn('node', ['--watch', 'server/index.js'], { stdio: 'inherit' }),
  spawn('npx', ['vite', '--config', 'client/vite.config.js', '--host'], { stdio: 'inherit' }),
];

const stop = () => { procs.forEach((p) => p.kill()); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

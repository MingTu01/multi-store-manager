const { spawn } = require('child_process');
const serverDir = 'C:\\Users\\Administrator\\Documents\\6666\\apps\\server';

// First kill existing node
const { execSync } = require('child_process');
try { execSync('taskkill /F /IM node.exe /T', { stdio: 'ignore' }); } catch {}

setTimeout(() => {
  console.log('Starting server...');
  const child = spawn('node', ['--import', 'tsx', 'src/index.ts'], {
    detached: true,
    stdio: 'ignore',
    cwd: serverDir
  });
  child.unref();
  console.log('Server started, PID:', child.pid);
  process.exit(0);
}, 3000);

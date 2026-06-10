const { spawn } = require('child_process');
const child = spawn('node', ['--version'], { stdio: 'inherit' });
child.on('exit', (code) => {
  console.log('node --version exited with code:', code);
  process.exit(0);
});

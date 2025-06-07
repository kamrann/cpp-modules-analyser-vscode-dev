
import { execSync } from 'child_process';

const platform = process.platform;
if (platform === 'win32') {
  execSync('npm run build:windows', { stdio: 'inherit' });
} else if (platform === 'linux') {
  execSync('npm run build:linux', { stdio: 'inherit' });
} else {
  console.error(`Unsupported platform: ${platform}`);
}

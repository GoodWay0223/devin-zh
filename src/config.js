'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Environment wins over an ignored machine-local setting.
function appRoot({env = process.env, projectDir = path.resolve(__dirname, '..'), platform = process.platform} = {}) {
  if (env.DEVIN_APP) return path.resolve(env.DEVIN_APP);
  const file = path.join(projectDir, '.devin-zh.local.json');
  if (fs.existsSync(file)) {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!config || typeof config.appRoot !== 'string' || !path.isAbsolute(config.appRoot)) {
      throw new Error('.devin-zh.local.json requires an absolute appRoot path');
    }
    return path.resolve(config.appRoot);
  }
  if (platform === 'darwin') return '/Applications/Devin.app/Contents/Resources/app';
  const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'Programs', 'Devin', 'resources', 'app');
}

module.exports = {appRoot};

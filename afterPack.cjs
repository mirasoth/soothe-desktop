const { join } = require('path');
const { chmodSync, existsSync, readdirSync, statSync } = require('fs');

exports.default = async function afterPack(context) {
  const resourcesDir = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources');
  const daemonDir = join(resourcesDir, 'daemon');

  if (!existsSync(daemonDir)) {
    console.warn('[afterPack] daemon directory not found, skipping chmod');
    return;
  }

  // Make the main binary executable
  const daemonBin = join(daemonDir, 'soothed');
  if (existsSync(daemonBin)) {
    chmodSync(daemonBin, 0o755);
    console.log('[afterPack] chmod +x daemon/soothed');
  }

  // Also fix permissions on any .so/.dylib in _internal/
  const internalDir = join(daemonDir, '_internal');
  if (existsSync(internalDir)) {
    fixPermissions(internalDir);
  }
};

function fixPermissions(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      fixPermissions(full);
    } else if (entry.endsWith('.so') || entry.endsWith('.dylib')) {
      chmodSync(full, 0o755);
    }
  }
}

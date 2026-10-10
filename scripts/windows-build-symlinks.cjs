// Process-local workaround for Next/OpenNext build tracing on Windows.
// Junctions do not require symlink privileges; these links are only build inputs.
if (process.platform === "win32") {
  const fs = require("node:fs");
  const path = require("node:path");
  const { syncBuiltinESMExports } = require("node:module");
  const symlink = fs.promises.symlink.bind(fs.promises);
  const symlinkSync = fs.symlinkSync.bind(fs);

  function relocateBuildTarget(target, link) {
    if (typeof target !== "string" || typeof link !== "string" || !path.isAbsolute(target)) {
      return target;
    }
    // pnpm's Windows junctions contain absolute paths. Next and OpenNext copy
    // their targets into the build output; the link must use that copied tree.
    const output = path.resolve(link).match(/^(.*?)([\\/](?:\.next[\\/]standalone|\.open-next[\\/]server-functions[\\/][^\\/]+)[\\/]node_modules)[\\/]/);
    if (!output) return target;
    const sourceRoot = path.join(output[1], "node_modules");
    const standaloneRoot = path.join(output[1], ".next/standalone/node_modules");
    const standaloneRelative = path.relative(standaloneRoot, target);
    const fromStandalone = standaloneRelative !== ".." &&
      !standaloneRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(standaloneRelative);
    const relative = fromStandalone ? standaloneRelative : path.relative(sourceRoot, target);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return target;
    }
    return path.join(output[1] + output[2], relative);
  }

  function fallbackTarget(error, target, link) {
    if (error.code !== "EPERM" || typeof target !== "string" || typeof link !== "string") {
      throw error;
    }
    return path.resolve(path.dirname(link), target);
  }

  fs.promises.symlink = async (target, link, type) => {
    const buildTarget = relocateBuildTarget(target, link);
    try {
      return await symlink(buildTarget, link, type);
    } catch (error) {
      const absoluteTarget = fallbackTarget(error, target, link);
      if ((await fs.promises.stat(absoluteTarget)).isDirectory()) {
        return symlink(path.resolve(path.dirname(link), buildTarget), link, "junction");
      }
      return fs.promises.copyFile(absoluteTarget, link, fs.constants.COPYFILE_EXCL);
    }
  };

  fs.symlinkSync = (target, link, type) => {
    const buildTarget = relocateBuildTarget(target, link);
    try {
      return symlinkSync(buildTarget, link, type);
    } catch (error) {
      const absoluteTarget = fallbackTarget(error, target, link);
      if (fs.statSync(absoluteTarget).isDirectory()) {
        return symlinkSync(path.resolve(path.dirname(link), buildTarget), link, "junction");
      }
      return fs.copyFileSync(absoluteTarget, link, fs.constants.COPYFILE_EXCL);
    }
  };

  syncBuiltinESMExports();
}

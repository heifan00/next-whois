import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const env = { ...process.env };
if (process.platform === "win32") {
  const preload = fileURLToPath(new URL("./windows-build-symlinks.cjs", import.meta.url)).replaceAll("\\", "/");
  env.NODE_OPTIONS = `${env.NODE_OPTIONS || ""} --require "${preload}"`.trim();
}

const cli = fileURLToPath(new URL("../node_modules/@opennextjs/cloudflare/dist/cli/index.js", import.meta.url));
const result = spawnSync(process.execPath, [cli, "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

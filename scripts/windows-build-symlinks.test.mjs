import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function fixture(t) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "next-whois-link-test-"));
  const source = path.join(root, "source");
  await fs.promises.mkdir(source);
  await fs.promises.writeFile(path.join(source, "value.txt"), "test-data");
  t.after(async () => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.promises.rm(root, { recursive: true, force: true });
  });
  return { root, source };
}

test("standalone tracing can link a directory without Windows symlink privileges", async (t) => {
  const { root, source } = await fixture(t);
  const link = path.join(root, "linked");
  await fs.promises.symlink(source, link);
  assert.equal(await fs.promises.readFile(path.join(link, "value.txt"), "utf8"), "test-data");
});

test("relative directory targets remain relative to the link location", async (t) => {
  const { root } = await fixture(t);
  const link = path.join(root, "relative");
  fs.symlinkSync("source", link);
  assert.equal(fs.readFileSync(path.join(link, "value.txt"), "utf8"), "test-data");
});

test("a traced file remains readable when Windows cannot create file symlinks", async (t) => {
  const { root, source } = await fixture(t);
  const link = path.join(root, "file.txt");
  await fs.promises.symlink(path.join(source, "value.txt"), link);
  assert.equal(await fs.promises.readFile(link, "utf8"), "test-data");
});

for (const [buildDir, sourceDir] of [
  [".next/standalone", ""],
  [".open-next/server-functions/default", ""],
  [".open-next/server-functions/default", ".next/standalone"],
]) {
  test(`absolute pnpm junctions use copied dependencies in ${buildDir}`, {
    skip: process.platform !== "win32",
  }, async (t) => {
    const { root } = await fixture(t);
    const relativePackage = ".pnpm/example/node_modules/example";
    const original = path.join(root, sourceDir, "node_modules", relativePackage);
    const outputModules = path.join(root, buildDir, "node_modules");
    const copied = path.join(outputModules, relativePackage);
    await fs.promises.mkdir(original, { recursive: true });
    await fs.promises.mkdir(copied, { recursive: true });
    await fs.promises.writeFile(path.join(original, "value.txt"), "original");
    await fs.promises.writeFile(path.join(copied, "value.txt"), "patched-copy");
    const link = path.join(outputModules, "example");
    if (buildDir.startsWith(".next")) await fs.promises.symlink(original, link);
    else fs.symlinkSync(original, link);
    assert.equal(await fs.promises.readFile(path.join(link, "value.txt"), "utf8"), "patched-copy");
    assert.equal(await fs.promises.readFile(path.join(original, "value.txt"), "utf8"), "original");
  });
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const manifest = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const project = await manifest("package.json");
assert.equal(
  typeof project.version,
  "string",
  "Root project version is required",
);
assert.ok(project.version.length > 0, "Root project version cannot be empty");
assert.equal(project.private, true, "The project must remain private");
for (const path of [
  "apps/api/package.json",
  "apps/web/package.json",
  "packages/types/package.json",
]) {
  const workspace = await manifest(path);
  assert.equal(
    workspace.version,
    project.version,
    `${path} must match the root version`,
  );
  assert.equal(workspace.private, true, `${path} must remain private`);
}
const changelog = await readFile(new URL("CHANGELOG.md", root), "utf8");
assert.ok(
  changelog.includes(`## [${project.version}] - `),
  "Current project version must have a dated changelog entry",
);
console.log(`Project and private workspace versions agree: ${project.version}`);

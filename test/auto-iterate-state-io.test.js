const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  readJsonFile,
  readJsonFileWithError,
  writeJsonFileAtomic,
} = require("../dist/src/auto-iterate/stateIO");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

async function withTempDir(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-cli-state-io-"));
  try {
    return await fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test("writeJsonFileAtomic writes pretty JSON with trailing newline", async () => {
  await withTempDir(async (tmpDir) => {
    const filePath = path.join(tmpDir, "state.json");

    await writeJsonFileAtomic(filePath, { ok: true, items: [1, 2] });

    assert.deepStrictEqual(await readJsonFile(filePath), { ok: true, items: [1, 2] });
    assert.strictEqual(fs.readFileSync(filePath, "utf8"), '{\n  "ok": true,\n  "items": [\n    1,\n    2\n  ]\n}\n');
  });
});

test("writeJsonFileAtomic does not leave same-file tmp artifacts after success", async () => {
  await withTempDir(async (tmpDir) => {
    const filePath = path.join(tmpDir, "state.json");

    await writeJsonFileAtomic(filePath, { revision: 1 });

    const tmpArtifacts = fs.readdirSync(tmpDir).filter((name) => name.startsWith("state.json.") && name.endsWith(".tmp"));
    assert.deepStrictEqual(tmpArtifacts, []);
  });
});

test("readJsonFile returns null for missing or invalid JSON", async () => {
  await withTempDir(async (tmpDir) => {
    const missingPath = path.join(tmpDir, "missing.json");
    const invalidPath = path.join(tmpDir, "invalid.json");
    fs.writeFileSync(invalidPath, "{not-json", "utf8");

    assert.strictEqual(await readJsonFile(missingPath), null);
    assert.strictEqual(await readJsonFile(invalidPath), null);
  });
});

test("readJsonFileWithError keeps parse error for diagnostics", async () => {
  await withTempDir(async (tmpDir) => {
    const invalidPath = path.join(tmpDir, "invalid.json");
    fs.writeFileSync(invalidPath, "{not-json", "utf8");

    const result = await readJsonFileWithError(invalidPath);

    assert.strictEqual(result.data, null);
    assert(result.error instanceof Error);
  });
});

(async () => {
  let passed = 0;
  for (const item of cases) {
    await item.fn();
    passed += 1;
    console.log(`✓ ${item.name}`);
  }

  console.log(`\n${passed} test(s) passed.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

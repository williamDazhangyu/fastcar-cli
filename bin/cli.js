#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const compiledEntry = path.join(__dirname, "..", "dist", "cli.js");

if (!fs.existsSync(compiledEntry)) {
  console.error("fastcar-cli has not been built. Run `npm run build` before executing bin/cli.js.");
  process.exit(1);
}

const { run } = require(compiledEntry);

run(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});

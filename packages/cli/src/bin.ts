#!/usr/bin/env node
import { runCli } from './cli.js';

async function main() {
  const result = await runCli(process.argv.slice(2));
  if (result.output) {
    if (result.exitCode === 0) {
      console.log(result.output);
    } else {
      console.error(result.output);
    }
  }
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});

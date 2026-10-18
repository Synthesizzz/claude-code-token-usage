// Type-checks the hooks and the tests against the declarations the engine
// writes into .claude-plugin/types/ when a session loads the mod from this
// folder. That folder is git-ignored, so a fresh clone has none: the check
// is skipped with a note rather than run without the engine's types.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

if (!existsSync(`${root}.claude-plugin/types/tsconfig.json`)) {
  console.log(
    "typecheck skipped: .claude-plugin/types/ is missing. Start a Claude Code " +
      "session with the mod loaded from this folder (claude --plugin-dir .) " +
      "to have the engine write it, then run npm run typecheck again.",
  );
  process.exit(0);
}

const tsc = spawnSync("tsc -p .", { cwd: root, stdio: "inherit", shell: true });
process.exit(tsc.status ?? 1);

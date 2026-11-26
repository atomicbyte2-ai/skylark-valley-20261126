// SPDX-License-Identifier: MIT
// Skylark Valley hand-in (Node 22, standard library only).
// Copies game/ and screenshots/ from beside this file into the output directory and writes
// dossier.json there with the vendored make.fun library. Nothing is ever written next to this file.
//
//   MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts      (defaults to /output)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyFolder(name: string): void {
  const from = join(repoDir, name);
  if (!existsSync(from)) throw new Error(`missing ${name}/ beside main.ts (${from})`);
  cpSync(from, join(outputDir, name), { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyFolder('game');
copyFolder('screenshots');

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`dossier.json written to ${outputDir} (${dossier.byteLength} bytes)`);

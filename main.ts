// SPDX-License-Identifier: MIT
// Skylark Valley hand-in (Node 22, standard library only).
// Copies game/ and screenshots/ from beside this file into the output directory and writes
// dossier.json there with the vendored make.fun library. Nothing is ever written next to this file.
//
//   MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts      (defaults to /output)

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const SCREENSHOT_MAX_BYTES = 262144;

function copyFolder(name: string): void {
  const from = join(repoDir, name);
  if (!existsSync(from)) throw new Error(`missing ${name}/ beside main.ts (${from})`);
  cpSync(from, join(outputDir, name), { recursive: true });
}

/** Refuse to hand in unless there are 3-4 screenshots, each a JPEG/PNG under the size cap. */
function checkScreenshots(): void {
  const dir = join(repoDir, 'screenshots');
  const shots = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort() : [];
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`screenshots/ must hold 3 or 4 JPEG/PNG files, found ${shots.length}: ${shots.join(', ') || 'none'}`);
  }
  for (const name of shots) {
    const size = statSync(join(dir, name)).size;
    if (size > SCREENSHOT_MAX_BYTES) throw new Error(`screenshots/${name} is ${size} bytes, over the ${SCREENSHOT_MAX_BYTES}-byte cap`);
  }
}

try {
  checkScreenshots();
  mkdirSync(outputDir, { recursive: true });
  copyFolder('game');
  copyFolder('screenshots');
  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: SCREENSHOT_MAX_BYTES },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  console.log(`dossier.json written to ${outputDir} (${dossier.byteLength} bytes)`);
} catch (error) {
  console.error(`hand-in failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

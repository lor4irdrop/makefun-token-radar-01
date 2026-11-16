// main.ts — token-radar-01 v4 (radar-5).
// Reads the sealed snapshot, ranks pre-token protocols by the comps curve,
// writes board.json, data.js, the dashboard, screenshots and dossier.json.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { parseSnapshot, buildBoard, dataScript, boardIssue } from './lib/model.ts';

const BASE_DIR = dirname(fileURLToPath(import.meta.url));

function argValue(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

function fail(message: string, code: number): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(code);
}

function main(): void {
  const argv = process.argv.slice(2);
  const inputArg = argValue(argv, '--input') ?? '/input';
  const inputPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(inputPath)) fail(`input snapshot not found: ${inputPath}`, 2);
  const outputDir = argValue(argv, '--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

  let snapshot;
  try {
    snapshot = parseSnapshot(JSON.parse(readFileSync(inputPath, 'utf8')));
  } catch (err) {
    fail(`invalid snapshot: ${err instanceof Error ? err.message : String(err)}`, 1);
  }

  const built = buildBoard(snapshot);
  const issue = boardIssue(built.rows, snapshot.watchlist);
  if (issue) fail(`board validation failed: ${issue}`, 1);

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });

  const boardText = JSON.stringify({ rows: built.rows }) + '\n';
  if (Buffer.byteLength(boardText, 'utf8') > 8_388_608) fail('board.json would exceed 8,388,608 bytes', 1);
  writeFileSync(join(outputDir, 'board.json'), boardText, 'utf8');

  writeFileSync(join(outputDir, 'data.js'), dataScript(built.radar), 'utf8');

  const nameRe = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
  for (const sub of ['dashboard', 'screenshots'] as const) {
    const srcDir = join(BASE_DIR, sub);
    const files = readdirSync(srcDir).filter((f) => {
      if (f.startsWith('.')) return false;
      return statSync(join(srcDir, f)).isFile();
    });
    if (sub === 'screenshots' && files.length < 3) fail(`need at least 3 screenshots, found ${files.length}`, 1);
    for (const f of files) {
      if (!nameRe.test(f)) fail(`bad file name in ${sub}: ${f}`, 1);
      copyFileSync(join(srcDir, f), join(outputDir, sub, f));
    }
  }

  const dossier = buildDossier(outputDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  writeFileSync(join(outputDir, 'dossier.json'), dossier, 'utf8');

  const top3 = built.rows.slice(0, 3);
  const money = (n: number) => `$${n.toLocaleString('en-US')}`;
  const wlSet = new Set(snapshot.watchlist);
  const early = built.rows.filter((r) => !wlSet.has(r.slug)).length;
  process.stdout.write(
    `${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} watchlist, ${built.rows.length} board rows (${early} early, ${built.live.length} live set aside) — model radar-5\n` +
    top3.map((r) => `#${r.rank} ${r.name} — ${money(r.implied_value_usd)}`).join(' | ') + '\n' +
    `wrote: board.json, data.js, dashboard/, screenshots/, dossier.json\n`,
  );
}

main();

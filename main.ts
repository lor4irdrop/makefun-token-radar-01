// Entrypoint token-radar-01 v3 (model radar-4).
// Membaca snapshot, membangun board + data dashboard, menulis output deterministik.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot, buildRadar, boardIssue, dataScript, SnapshotError } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ENTRY_DIR = dirname(fileURLToPath(import.meta.url));

function fail(message: string, code: number): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(code);
}

function argValue(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  if (i === -1 || i + 1 >= argv.length) return null;
  return argv[i + 1];
}

function main(): void {
  const argv = process.argv.slice(2);
  const inputArg = argValue(argv, '--input') ?? '/input';
  const inputPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(inputPath)) {
    fail(`input snapshot not found: ${inputPath}`, 2);
  }
  const outputDir = argValue(argv, '--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

  let snapshot;
  try {
    snapshot = parseSnapshot(JSON.parse(readFileSync(inputPath, 'utf8')));
  } catch (err) {
    if (err instanceof SnapshotError) fail(`invalid snapshot: ${err.message}`, 1);
    throw err;
  }

  const { radar, rows } = buildRadar(snapshot);
  const issue = boardIssue(rows, snapshot.watchlist);
  if (issue !== null) fail(`board validation failed: ${issue}`, 1);

  mkdirSync(outputDir, { recursive: true });
  const written: string[] = [];

  const boardText = JSON.stringify({ rows }) + '\n';
  if (Buffer.byteLength(boardText, 'utf8') > 8_388_608) {
    fail('board.json would exceed 8,388,608 bytes', 1);
  }
  writeFileSync(join(outputDir, 'board.json'), boardText);
  written.push('board.json');

  writeFileSync(join(outputDir, 'data.js'), dataScript(radar));
  written.push('data.js');

  const dashOut = join(outputDir, 'dashboard');
  mkdirSync(dashOut, { recursive: true });
  for (const name of readdirSync(join(ENTRY_DIR, 'dashboard')).sort()) {
    if (name.startsWith('.')) continue;
    const src = join(ENTRY_DIR, 'dashboard', name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(dashOut, name));
    written.push(`dashboard/${name}`);
  }

  const shotsOut = join(outputDir, 'screenshots');
  mkdirSync(shotsOut, { recursive: true });
  const shotNames = readdirSync(join(ENTRY_DIR, 'screenshots'))
    .filter((n) => !n.startsWith('.'))
    .sort();
  const shotPattern = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
  for (const name of shotNames) {
    if (!shotPattern.test(name)) fail(`invalid screenshot name: ${name}`, 1);
    const src = join(ENTRY_DIR, 'screenshots', name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(shotsOut, name));
    written.push(`screenshots/${name}`);
  }
  if (shotNames.length < 3) fail(`need at least 3 screenshots, found ${shotNames.length}`, 1);

  const dossier = buildDossier(outputDir, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  written.push('dossier.json');

  const fmt = new Intl.NumberFormat('en-US');
  const top3 = rows.slice(0, 3).map((r) => `#${r.rank} ${r.name} $${fmt.format(r.implied_value_usd)}`).join(', ');
  const oos = radar.oos as { time_split: { model_rmse: number; naive_rmse: number } };
  process.stdout.write(
    `Protocols: ${snapshot.protocols.length} | Watchlist: ${snapshot.watchlist.length} | Board rows: ${rows.length} (${(radar.early_size as number)} early, ${(radar.live_size as number)} live set aside) | OOS time-split model RMSE ${oos.time_split.model_rmse} vs naive ${oos.time_split.naive_rmse}\n` +
    `Top 3: ${top3}\n` +
    `Files written: ${written.join(', ')}\n`,
  );
}

main();

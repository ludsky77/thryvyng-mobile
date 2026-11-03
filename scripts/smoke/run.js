#!/usr/bin/env node
/**
 * THE LOGIC SMOKE — `npm run smoke`.
 *
 * WHY THIS IS IN THE REPO NOW. It was not, and that cost real work: the first
 * club-announcements pass left its 38 assertions in a session scratchpad that
 * no longer exists, so the second pass had to rebuild them from the prose in
 * `docs/recon/club-announcements-v1-mobile.md` § 6 before it could add
 * anything. Lu approved giving it a home (that file's § 7 RECOMMEND, approved
 * 2026-11-03). "Re-run the smoke" is now a command instead of a reconstruction.
 *
 * WHAT IT IS, EXACTLY. Plain node, no new dependency: it runs on the
 * `typescript` and `node` this repo already installs. It transpiles the REAL
 * source files — unchanged, with `--strict`, by the project's own `tsc` — into
 * a temporary directory, writes a stub over the transpiled supabase module,
 * and asserts against what the modules then do. The sources are never copied
 * or edited, so the smoke cannot drift from the code it is testing.
 *
 * WHAT IT IS NOT, and this matters more than what it is:
 *   * It is NOT a device test. Nothing is rendered and nothing is tapped.
 *   * It is NOT a schema test. The stub records what the code SENT; it cannot
 *     tell you that column exists. Every column list asserted here is sourced
 *     to a human read of the live table, cited at the assertion.
 *   * It is NOT a network test. Nothing leaves the process, by construction,
 *     and the run asserts that `@supabase/supabase-js` was never required.
 *
 * ADDING TO IT: write `<name>.smoke.js` next to this file, export
 * `{ title, run(t, env) }`, and add it to `SUITES` below. `t` carries the
 * assertions; `env` carries the transpiled modules and the stub factory.
 */
/* eslint-disable no-console -- this is a CLI reporter: printing IS its output.
   The rule exists to keep stray logging out of the shipped app; nothing in
   `scripts/` is bundled (Metro's entry is `index.ts`). */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');

/**
 * The real source files under test, repo-relative. tsc follows their imports,
 * so `src/lib/supabase.ts` is transpiled too — and then overwritten by the
 * stub shim before anything is required.
 */
const SOURCES = [
  'src/lib/clubAnnouncementCards.ts',
  'src/lib/surveyShare.ts',
  'src/constants/announceCardKey.ts',
];

/** The suites, in run order. */
const SUITES = ['./announcements.smoke.js', './surveyShare.smoke.js'];

/* ───────────────────────────── assertions ──────────────────────────────── */

let passed = 0;
const failures = [];
let currentGroup = '(none)';

const t = {
  group(name) {
    currentGroup = name;
  },
  ok(condition, label) {
    if (condition) {
      passed += 1;
      return;
    }
    failures.push(`${currentGroup} — ${label}`);
  },
  eq(actual, expected, label) {
    if (actual === expected) {
      passed += 1;
      return;
    }
    failures.push(
      `${currentGroup} — ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`
    );
  },
  deepEq(actual, expected, label) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
      passed += 1;
      return;
    }
    failures.push(
      `${currentGroup} — ${label}\n      expected: ${e}\n      actual:   ${a}`
    );
  },
};

/* ───────────────────────────── transpile ───────────────────────────────── */

/**
 * Transpile the sources into a fresh temp directory.
 *
 * The flags are the ones the earlier passes used by hand (recorded in
 * `docs/recon/chat-info-club-chats.md` § "Re-run the smoke"), plus
 * `--rootDir src` so the output tree is `lib/` + `constants/` no matter which
 * files are listed. `tsc` emits even when it reports diagnostics, so the exit
 * code is deliberately not the gate — instead, a diagnostic that names one of
 * OUR files is a smoke failure, while one in a file we only pull in as an
 * import (and then stub out) is printed and ignored.
 */
function transpile() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thryvyng-smoke-'));
  let tscOutput = '';
  try {
    tscOutput = execFileSync(
      process.execPath,
      [
        TSC,
        ...SOURCES,
        '--outDir',
        outDir,
        '--rootDir',
        'src',
        '--module',
        'commonjs',
        '--target',
        'es2020',
        '--moduleResolution',
        'node',
        '--skipLibCheck',
        '--strict',
        '--esModuleInterop',
      ],
      { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (err) {
    tscOutput = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }

  const ours = tscOutput
    .split('\n')
    .filter((line) => SOURCES.some((src) => line.startsWith(src)))
    .filter(Boolean);

  return { outDir, tscOutput: tscOutput.trim(), ours };
}

/**
 * Write the stub shim over the transpiled supabase module.
 *
 * It is a GETTER, not a value: the transpiled modules read
 * `supabase_1.supabase` at call time, so each suite can swap in its own
 * recording client between calls without re-requiring anything.
 */
function installStubShim(outDir) {
  const target = path.join(outDir, 'lib', 'supabase.js');
  const stubPath = path.join(__dirname, 'stubClient.js');
  fs.writeFileSync(
    target,
    [
      '"use strict";',
      'Object.defineProperty(exports, "__esModule", { value: true });',
      `const holder = require(${JSON.stringify(stubPath)});`,
      'Object.defineProperty(exports, "supabase", {',
      '  enumerable: true,',
      '  get: () => holder.current(),',
      '});',
      '',
    ].join('\n')
  );
  return target;
}

/* ─────────────────────────────── the run ───────────────────────────────── */

function main() {
  const { outDir, tscOutput, ours } = transpile();

  const emitted = [
    'lib/clubAnnouncementCards.js',
    'lib/surveyShare.js',
    'constants/announceCardKey.js',
    'lib/supabase.js',
  ].map((rel) => path.join(outDir, rel));

  const missing = emitted.filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    console.error('SMOKE ABORTED — tsc did not emit:');
    missing.forEach((file) => console.error(`  ${path.relative(outDir, file)}`));
    if (tscOutput) console.error(tscOutput);
    process.exit(2);
  }

  if (ours.length > 0) {
    console.error('SMOKE ABORTED — tsc reported errors in the files under test:');
    ours.forEach((line) => console.error(`  ${line}`));
    process.exit(2);
  }
  if (tscOutput) {
    console.log('tsc diagnostics in imported-but-stubbed files (ignored):');
    tscOutput.split('\n').forEach((line) => console.log(`  ${line}`));
    console.log('');
  }

  installStubShim(outDir);

  const stub = require('./stubClient');
  const env = {
    outDir,
    stub,
    announcements: require(path.join(outDir, 'lib', 'clubAnnouncementCards.js')),
    surveyShare: require(path.join(outDir, 'lib', 'surveyShare.js')),
    cardKey: require(path.join(outDir, 'constants', 'announceCardKey.js')),
  };

  return (async () => {
    for (const name of SUITES) {
      const suite = require(name);
      console.log(`── ${suite.title}`);
      await suite.run(t, env);
    }

    // Proof the stub really did stand in for the client: the real driver was
    // never even loaded, so nothing could have opened a socket.
    t.group('isolation');
    t.ok(
      !Object.keys(require.cache).some((key) =>
        key.includes(`node_modules${path.sep}@supabase`)
      ),
      '@supabase/supabase-js was never required'
    );

    fs.rmSync(outDir, { recursive: true, force: true });

    console.log('');
    if (failures.length === 0) {
      console.log(`SMOKE: ALL PASS — ${passed} assertions, 0 failures`);
      process.exit(0);
    }
    console.log(`SMOKE: FAIL — ${passed} passed, ${failures.length} failed`);
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exit(1);
  })();
}

main().catch((err) => {
  console.error('SMOKE CRASHED');
  console.error(err);
  process.exit(3);
});

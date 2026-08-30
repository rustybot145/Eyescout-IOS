// Guards account deletion — App Store guideline 5.1.1(v), and a button Apple
// tests during review.
//
// The bug (found 2026-08-30, broken in production): migration 007 made
// `delete from storage.objects` the FIRST statement of delete_my_account().
// Supabase has since blocked direct writes to the storage tables, so that
// statement raised 42501 and aborted the whole function — no files, no rows, no
// login deleted. The button did nothing, every time, for every user. The app
// then mapped 42501 to "Please sign in again", so people re-authenticated into
// the identical failure.
//
// Storage cleanup now happens client-side through the Storage API, which is the
// only route Supabase still permits. These checks are structural because the
// failure was an absent step and a wrong order, and both are what a refactor
// quietly reintroduces.
//
//   node src/lib/__tests__/delete-account.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '../../..');
const account = fs.readFileSync(path.join(ROOT, 'src/lib/account.ts'), 'utf8');

const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const latestDeleteMigration = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => /delete_account/.test(f))
  .sort()
  .pop();
const sql = fs.readFileSync(path.join(MIGRATIONS, latestDeleteMigration), 'utf8');
// Comments discuss the removed statement by name, so only executable SQL counts.
const sqlCode = sql.replace(/--[^\n]*/g, '');

// ── 1. The SQL must not write to storage ────────────────────────────────────
// This is the whole bug. Supabase raises 42501 on it and the function aborts.
assert.ok(
  !/delete\s+from\s+storage\.objects/i.test(sqlCode),
  `${latestDeleteMigration} must not DELETE from storage.objects — Supabase ` +
    'blocks it, and as the first statement it aborted the entire function, ' +
    'making account deletion fail 100% of the time',
);

// ── 2. The client must clear the files instead ──────────────────────────────
assert.ok(
  /\.storage\.from\([^)]*\)\.remove\(/.test(account),
  'account.ts must delete the user\'s files via the Storage API — with the SQL ' +
    'path blocked, nothing else removes a minor\'s uploaded photos',
);

// ── 3. Files BEFORE the account, and verified gone ──────────────────────────
// Deleting the account first would leave photos of a minor reachable by public
// URL forever — the regression migration 007 was written to fix.
// Quote-agnostic on purpose: an earlier version of this check only matched
// single quotes, and a double-quoted rpc() call moved above the cleanup slipped
// straight through it.
const filesAt = account.search(/await\s+deleteOwnFiles\s*\(/);
const rpcAt = account.search(/rpc\(\s*['"`]delete_my_account['"`]\s*\)/);
assert.ok(filesAt > 0 && rpcAt > 0, 'both the storage cleanup and the RPC call must exist');
assert.ok(
  filesAt < rpcAt,
  'files must be deleted BEFORE the account row — failing the other way around ' +
    'orphans a minor\'s photos in public storage with no owner left to clean them',
);
assert.ok(
  /const left = await listOwnFiles\(/.test(account) && /throw new Error\(`\$\{left\.length\}/.test(account),
  'deleteOwnFiles must RE-LIST and throw if anything survived — remove() reports ' +
    'no error for a partial delete, so trusting it can silently leave files behind',
);

// ── 4. Pagination — a missed page is a file left behind ─────────────────────
assert.ok(
  /offset/.test(account) && /limit: 100/.test(account),
  'listOwnFiles must paginate; a user with over 100 uploads would otherwise ' +
    'keep everything past the first page',
);

// ── 5. 42501 must not tell people to sign in again ──────────────────────────
// It never was an auth problem, and re-authenticating led straight back here.
const msgFn = account.slice(account.indexOf('function deleteErrorMessage'), account.indexOf('export async function deleteAccountFlow'));
assert.ok(
  !/42501[\s\S]{0,120}sign in again/i.test(msgFn),
  'deleteErrorMessage must not map 42501 to "sign in again" — that sent people ' +
    'to re-authenticate into the exact same failure forever',
);

console.log('delete-account: 5 checks passed');

/**
 * Live attendance smoke -- prompt 4 of chunk 1.
 *
 * Signs in to prod as the ZZ Test Team 0826 coach (+zztest6) and secondary
 * parent (+zztest7), drives the one-source attendance surfaces through the
 * same call shapes the app uses, and asserts the SQL + client merge together
 * produce the verdicts the ledger claims.
 *
 * Writes ONLY to ZZ Test Team 0826 and cleans up every event it creates.
 * Credentials come from ZZ_COACH_PW / ZZ_PARENT_PW -- never from a flag or
 * file -- and are never printed.
 *
 * Run:  ZZ_COACH_PW=... ZZ_PARENT_PW=... \
 *       node --experimental-strip-types scripts/smoke/attendance-live.mjs
 *
 * Exits non-zero on any FAIL.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

// Pull Supabase URL + anon key out of the app's own client config, by regex,
// so the smoke cannot drift from what the app ships.
const supabaseSrc = readFileSync(
  resolve(repoRoot, 'src/lib/supabase.ts'),
  'utf8'
);
const url = supabaseSrc.match(/supabaseUrl\s*=\s*'([^']+)'/)?.[1];
const anon = supabaseSrc.match(/supabaseAnonKey\s*=\s*'([^']+)'/)?.[1];
if (!url || !anon) throw new Error('could not parse supabase url/anon key');

const COACH_EMAIL = 'ludwig.snchz+zztest6@gmail.com';
const PARENT_EMAIL = 'ludwig.snchz+zztest7@gmail.com';
const TEAM_NAME = 'ZZ Test Team 0826';

// Each persona gets its own client with no persistence -- no cross-contamination.
function makeClient() {
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const results = [];
function record(step, pass, extra = '') {
  results.push({ step, pass, extra });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${step}${extra ? ' · ' + extra : ''}`);
}

async function signIn(client, email, pwEnv) {
  const password = process.env[pwEnv];
  if (!password) throw new Error(`${pwEnv} not set`);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.user) throw new Error(`sign-in ${pwEnv} failed: ${error?.message || 'no user'}`);
  return data.user.id;
}

function statusOf(rows, playerId) {
  return rows.find((r) => r.player_id === playerId);
}

// --- Dynamic import of the pure resolver so the merge path under test is
// --- literally the app's code, not a copy.
const resolver = await import(resolve(repoRoot, 'src/utils/attendanceResolver.ts'));
const { mergeOwnReasons, loadEventAttendance } = resolver;

async function main() {
  const coach = makeClient();
  const parent = makeClient();

  const coachId = await signIn(coach, COACH_EMAIL, 'ZZ_COACH_PW');
  const parentId = await signIn(parent, PARENT_EMAIL, 'ZZ_PARENT_PW');

  // Resolve team + its club, and the active roster.
  const { data: team, error: teamErr } = await coach
    .from('teams')
    .select('id, club_id')
    .eq('name', TEAM_NAME)
    .single();
  if (teamErr || !team) throw new Error(`team lookup failed: ${teamErr?.message}`);

  const { data: roster, error: rosterErr } = await coach
    .from('players')
    .select('id, first_name, is_active')
    .eq('team_id', team.id)
    .eq('is_active', true);
  if (rosterErr) throw new Error(`roster read: ${rosterErr.message}`);
  if (!roster || roster.length !== 5) {
    throw new Error(`expected 5 active players, got ${roster?.length ?? 0}`);
  }
  const zack = roster.find((p) => p.first_name === 'Zack');
  if (!zack) throw new Error('Zack not found on roster');

  // --- A1: create smoke game event as coach --------------------------------
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const eventDate = tomorrow.toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const title = `ZZ ATTENDANCE SMOKE ${stamp}`;

  const { data: ev, error: evErr } = await coach
    .from('cal_events')
    .insert({
      team_id: team.id,
      club_id: team.club_id ?? null,
      created_by: coachId,
      title,
      event_type: 'game',
      event_date: eventDate,
      start_time: '18:00:00',
      is_all_day: false,
    })
    .select('id')
    .single();
  if (evErr || !ev?.id) throw new Error(`event create failed: ${evErr?.message}`);
  const eventId = ev.id;
  const idPrefix = eventId.slice(0, 8);
  record('A1 event create', true, `id-prefix ${idPrefix}`);

  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      const { data: delRows } = await coach
        .from('cal_events')
        .delete()
        .eq('id', eventId)
        .select('id');
      const { data: leftEvt } = await coach
        .from('cal_events')
        .select('id')
        .eq('id', eventId);
      const { data: leftRsvp } = await coach
        .from('cal_event_rsvps')
        .select('id')
        .eq('event_id', eventId);
      const okDel = !!delRows && delRows.length === 1;
      const okEmpty = (leftEvt?.length ?? -1) === 0 && (leftRsvp?.length ?? -1) === 0;
      record('A8 cleanup', okDel && okEmpty, `evt 0=${okEmpty ? 'Y' : 'N'} rsvps 0=${(leftRsvp?.length ?? -1) === 0 ? 'Y' : 'N'}`);
    } catch (err) {
      record('A8 cleanup', false, String(err?.message || err));
    }
  };
  process.on('exit', () => {
    if (!cleanedUp) console.log('FAIL A8 cleanup · never ran');
  });

  try {
    // --- A2: parent upserts yes for Zack -----------------------------------
    {
      const { data, error } = await parent
        .from('cal_event_rsvps')
        .upsert(
          {
            event_id: eventId,
            user_id: parentId,
            player_id: zack.id,
            status: 'yes',
            decline_reason: null,
            responded_at: new Date().toISOString(),
          },
          { onConflict: 'event_id,user_id,player_id' }
        )
        .select('id');
      if (error || !data?.length) throw new Error(`A2 rsvp upsert: ${error?.message}`);

      const { data: rows, error: readErr } = await parent.rpc('get_event_attendance', {
        p_event_id: eventId,
      });
      if (readErr) throw new Error(`A2 fn read: ${readErr.message}`);
      const z = statusOf(rows ?? [], zack.id);
      const privateAllNull = (rows ?? []).every(
        (r) => r.marked_by_name == null && r.decline_reason == null
      );
      const { data: counts, error: cErr } = await parent.rpc('get_events_attendance_counts', {
        p_event_ids: [eventId],
      });
      if (cErr) throw new Error(`A2 counts: ${cErr.message}`);
      const c = (counts ?? []).find((x) => x.event_id === eventId);
      const pass =
        (rows?.length ?? 0) === 5 &&
        z?.status === 'going' &&
        z?.source === 'parent' &&
        privateAllNull &&
        c?.roster === 5 &&
        c?.going === 1 &&
        c?.cant_go === 0 &&
        c?.no_reply === 4;
      record(
        'A2 parent read',
        pass,
        `rows ${rows?.length} · Zack ${z?.status}/${z?.source} · privNull${privateAllNull ? 'Y' : 'N'} · counts ${c?.roster}/${c?.going}/${c?.cant_go}/${c?.no_reply}`
      );
    }

    // --- A3: coach marks Zack absent ---------------------------------------
    {
      const { data, error } = await coach
        .from('event_attendance')
        .upsert(
          { event_id: eventId, player_id: zack.id, status: 'absent', marked_by: coachId },
          { onConflict: 'event_id,player_id' }
        )
        .select('id');
      if (error || !data?.length) throw new Error(`A3 coach mark: ${error?.message}`);

      const { data: cRows, error: cErr } = await coach.rpc('get_event_attendance', {
        p_event_id: eventId,
      });
      if (cErr) throw new Error(`A3 coach read: ${cErr.message}`);
      const cz = statusOf(cRows ?? [], zack.id);
      const coachSees =
        cz?.status === 'cant_go' && cz?.source === 'coach' && !!cz?.marked_by_name;

      const { data: pRows, error: pErr } = await parent.rpc('get_event_attendance', {
        p_event_id: eventId,
      });
      if (pErr) throw new Error(`A3 parent read: ${pErr.message}`);
      const pz = statusOf(pRows ?? [], zack.id);
      const parentSees =
        pz?.status === 'cant_go' &&
        pz?.source === 'coach' &&
        pz?.marked_by_name == null &&
        pz?.decline_reason == null;

      record(
        'A3 coach mark',
        coachSees && parentSees,
        `coach ${cz?.status}/${cz?.source}/by${cz?.marked_by_name ? 'Y' : 'N'} · parent ${pz?.status}/${pz?.source}/privNull${pz?.marked_by_name == null && pz?.decline_reason == null ? 'Y' : 'N'}`
      );
    }

    // --- A4: parent "no" + reason, read through the hook's merge path ------
    {
      const { data, error } = await parent
        .from('cal_event_rsvps')
        .upsert(
          {
            event_id: eventId,
            user_id: parentId,
            player_id: zack.id,
            status: 'no',
            decline_reason: 'smoke reason',
            responded_at: new Date().toISOString(),
          },
          { onConflict: 'event_id,user_id,player_id' }
        )
        .select('id');
      if (error || !data?.length) throw new Error(`A4 rsvp no: ${error?.message}`);

      // Hook's merge path: fn rows + viewer's own cal_event_rsvps + merge.
      const { data: rows, error: readErr } = await parent.rpc('get_event_attendance', {
        p_event_id: eventId,
      });
      if (readErr) throw new Error(`A4 fn: ${readErr.message}`);
      const { data: own, error: ownErr } = await parent
        .from('cal_event_rsvps')
        .select('player_id, status, decline_reason, updated_at, responded_at')
        .eq('event_id', eventId)
        .eq('user_id', parentId);
      if (ownErr) throw new Error(`A4 own: ${ownErr.message}`);

      const merged = mergeOwnReasons(rows ?? [], own ?? [], [zack.id]);
      const mz = statusOf(merged, zack.id);

      const { data: cRows, error: cErr } = await coach.rpc('get_event_attendance', {
        p_event_id: eventId,
      });
      if (cErr) throw new Error(`A4 coach fn: ${cErr.message}`);
      const cz = statusOf(cRows ?? [], zack.id);

      const { data: counts, error: countsErr } = await parent.rpc(
        'get_events_attendance_counts',
        { p_event_ids: [eventId] }
      );
      if (countsErr) throw new Error(`A4 counts: ${countsErr.message}`);
      const c = (counts ?? []).find((x) => x.event_id === eventId);

      const pass =
        mz?.status === 'cant_go' &&
        mz?.source === 'parent' &&
        mz?.decline_reason === 'smoke reason' &&
        cz?.decline_reason === 'smoke reason' &&
        c?.roster === 5 &&
        c?.going === 0 &&
        c?.cant_go === 1 &&
        c?.no_reply === 4;
      record(
        'A4 own reason',
        pass,
        `parent reason ${mz?.decline_reason ? 'Y' : 'N'} · coach reason ${cz?.decline_reason ? 'Y' : 'N'} · counts ${c?.roster}/${c?.going}/${c?.cant_go}/${c?.no_reply}`
      );
    }

    // --- A5: parent flips to yes -- latest wins ----------------------------
    {
      const { data, error } = await parent
        .from('cal_event_rsvps')
        .upsert(
          {
            event_id: eventId,
            user_id: parentId,
            player_id: zack.id,
            status: 'yes',
            decline_reason: null,
            responded_at: new Date().toISOString(),
          },
          { onConflict: 'event_id,user_id,player_id' }
        )
        .select('id');
      if (error || !data?.length) throw new Error(`A5 yes: ${error?.message}`);

      const { data: rows, error: readErr } = await parent.rpc('get_event_attendance', {
        p_event_id: eventId,
      });
      if (readErr) throw new Error(`A5 fn: ${readErr.message}`);
      const z = statusOf(rows ?? [], zack.id);
      record('A5 latest wins', z?.status === 'going' && z?.source === 'parent', `${z?.status}/${z?.source}`);
    }

    // --- A6: counts with [smoke id, bogus uuid] ----------------------------
    {
      const bogus = '00000000-0000-0000-0000-000000000000';
      const { data, error } = await parent.rpc('get_events_attendance_counts', {
        p_event_ids: [eventId, bogus],
      });
      const pass = !error && Array.isArray(data) && data.length === 1 && data[0].event_id === eventId;
      record('A6 bogus id', pass, `rows ${data?.length} err ${error ? 'Y' : 'N'}`);
    }

    // --- A7: 1 ms timeout -- hook settles to error/empty inside 5 s --------
    {
      const start = Date.now();
      let settled = false;
      const outer = new Promise((_, rej) => setTimeout(() => rej(new Error('outer 5s')), 5000));
      try {
        const result = await Promise.race([
          loadEventAttendance(
            (signal) =>
              parent.rpc('get_event_attendance', { p_event_id: eventId }).abortSignal(signal),
            1
          ),
          outer,
        ]);
        settled = true;
        const elapsed = Date.now() - start;
        // Either 'error' (timeout) or 'empty' (super-rare, call beat the 1 ms) is acceptable:
        // the contract is "settles, never hangs".
        const okState = result?.state === 'error' || result?.state === 'empty';
        const okRows = Array.isArray(result?.rows) && result.rows.length === 0 || result?.state === 'empty';
        record('A7 1ms timeout', okState && settled && elapsed < 5000, `state ${result?.state} in ${elapsed}ms`);
      } catch (err) {
        record('A7 1ms timeout', false, `threw: ${err?.message || err}`);
      }
    }
  } finally {
    // --- A8: cleanup -- even on failure ------------------------------------
    await cleanup();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) {
    console.log('FAILED:', failed.map((f) => f.step).join(', '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FAIL harness:', err?.message || err);
  process.exit(1);
});

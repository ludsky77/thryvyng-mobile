/**
 * The stub Supabase client the smoke runs against.
 *
 * NOTHING LEAVES THE PROCESS. The runner writes a six-line shim over the
 * transpiled `lib/supabase.js` before anything is required, and that shim
 * reads `current()` below — so the real `createClient` is never called, no URL
 * and no key are ever loaded, and `@supabase/supabase-js` is never even
 * required (the runner asserts that last part).
 *
 * WHAT IT IS FOR. The modules under test are the ones that build a WRITE: the
 * column names on an insert, the argument names on an RPC, the order of two
 * dependent writes and the rollback between them. None of that is a pure
 * function, and all of it is exactly what broke — mobile's survey share wrote
 * two columns that do not exist and omitted a NOT NULL one, and no typecheck
 * on earth was going to say so. So the stub RECORDS every call and REPLAYS a
 * planned answer, and the assertions read the recording.
 *
 * WHAT IT IS NOT. It is not a database and it does not know a real schema: it
 * cannot tell you that `team_id` exists, only that the code sent it. The
 * column list it is checked against comes from Lu's own read of the live table
 * (Q-05, 2026-11-03 12:41 MDT) and is written down in `surveyShare.smoke.js`.
 * A simulator run is still owed for everything that touches a real row.
 *
 * THE QUERY BUILDER is reproduced only as far as these modules use it: the
 * chainable filter methods return the builder, `single()`/`maybeSingle()`
 * resolve it, and `then` is defined so a bare `await` on the builder resolves
 * too (which is how `.insert(...)` with no `.select()` is awaited).
 */

/** The client the shim is currently handing out. */
let currentClient = null;

/** Read by the generated `lib/supabase.js` shim, on every property access. */
function current() {
  if (!currentClient) {
    throw new Error(
      'smoke: a module reached the supabase client before setClient() ran'
    );
  }
  return currentClient;
}

function setClient(client) {
  currentClient = client;
}

/** The chainable methods these modules use that are NOT terminal. */
const CHAIN_OPS = [
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
  'eq',
  'neq',
  'in',
  'is',
  'not',
  'order',
  'limit',
  'range',
];

/**
 * One stub client.
 *
 * `plan` maps a call key to the `{ data, error }` that call should answer
 * with. Keys are `<table>.<first write-or-read op>` — `comm_messages.insert`,
 * `sv_chat_shares.insert`, `comm_messages.select` — or `rpc.<function name>`.
 * An unplanned call answers `{ data: null, error: null }`, which is the
 * "nothing there, nothing wrong" case.
 */
function createStubClient(plan = {}) {
  /** Every call made, in order, with its full op chain. */
  const calls = [];

  /**
   * A call's plan key: the WRITE it makes, or `select` when it only reads.
   * Filters (`eq`, `in`, `limit`) never decide the key — two reads of the same
   * table differ by their filters, and both want the same planned answer.
   */
  const WRITES = ['insert', 'update', 'upsert', 'delete'];
  const keyFor = (call) => {
    const write = call.ops.find((o) => WRITES.includes(o.op));
    return `${call.table}.${write ? write.op : 'select'}`;
  };

  const answer = (call) => {
    const planned = plan[keyFor(call)];
    const result = planned ?? { data: null, error: null };
    call.answeredWith = result;
    return result;
  };

  function from(table) {
    const call = { kind: 'table', table, ops: [] };
    calls.push(call);

    const builder = {};
    for (const op of CHAIN_OPS) {
      builder[op] = (...args) => {
        call.ops.push({ op, args });
        return builder;
      };
    }
    const terminal = (op) => (...args) => {
      call.ops.push({ op, args });
      return Promise.resolve(answer(call));
    };
    builder.single = terminal('single');
    builder.maybeSingle = terminal('maybeSingle');
    // A bare `await` on the builder — `.insert({...})` with no `.select()`.
    builder.then = (onOk, onErr) =>
      Promise.resolve(answer(call)).then(onOk, onErr);
    return builder;
  }

  function rpc(name, args) {
    const call = { kind: 'rpc', name, args, ops: [] };
    calls.push(call);
    const planned = plan[`rpc.${name}`];
    const result = planned ?? { data: null, error: null };
    call.answeredWith = result;
    return Promise.resolve(result);
  }

  return {
    from,
    rpc,
    calls,
    /** Every call against one table, in order. */
    callsOn: (table) => calls.filter((c) => c.table === table),
    /** Every call of one RPC, in order. */
    rpcCalls: (name) => calls.filter((c) => c.kind === 'rpc' && c.name === name),
    /** The arguments one op was given, from the first call that used it. */
    firstArgsOf: (table, op) => {
      for (const call of calls) {
        if (call.table !== table) continue;
        const hit = call.ops.find((o) => o.op === op);
        if (hit) return hit.args[0];
      }
      return undefined;
    },
    /** The op names one table's call chain used, in order. */
    opsOn: (table) =>
      calls.filter((c) => c.table === table).map((c) => c.ops.map((o) => o.op)),
  };
}

module.exports = { current, setClient, createStubClient };

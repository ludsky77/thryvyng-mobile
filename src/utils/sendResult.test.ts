/**
 * Tests for the send-result mapper.
 *
 * node:test + node:assert/strict, same pattern as the other suites here.
 *   npx tsc src/utils/sendResult.ts src/utils/sendResult.test.ts \
 *     --outDir /tmp/sr --module commonjs --target es2020 --skipLibCheck \
 *     --strict --esModuleInterop
 *   node --test /tmp/sr/sendResult.test.js
 *
 * The case that matters is the one that caused the bug: an 'insert' failure
 * must NOT mention attachments.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEND_OK,
  sendFailure,
  sendFailureCopy,
  shouldAlertForResult,
  type SendFailureReason,
} from './sendResult';

const ALL_REASONS: SendFailureReason[] = [
  'validation',
  'attachment_upload',
  'insert',
  'auth',
  'unknown',
];

// --- the bug this module exists to prevent ---------------------------------

test('ONLY attachment_upload is allowed to mention an attachment', () => {
  for (const reason of ALL_REASONS) {
    const { title, body } = sendFailureCopy(reason);
    const mentionsAttachment = /attach/i.test(`${title} ${body}`);
    assert.equal(
      mentionsAttachment,
      reason === 'attachment_upload',
      `${reason} copy must${reason === 'attachment_upload' ? '' : ' not'} mention attachments: "${body}"`
    );
  }
});

test("a failed INSERT reads as the message not being sent, not as an upload problem", () => {
  // The exact device case: a text-only reply whose comm_messages insert was
  // refused used to say "Your attachment could not be uploaded."
  const copy = sendFailureCopy('insert');
  assert.equal(copy.title, "Message couldn't be sent");
  assert.ok(!/attach/i.test(copy.body), copy.body);
  assert.ok(!/upload/i.test(copy.body), copy.body);
});

test('unknown falls back to the same honest generic copy as insert', () => {
  assert.deepEqual(sendFailureCopy('unknown'), sendFailureCopy('insert'));
});

test('attachment_upload keeps the original attachment wording', () => {
  assert.equal(
    sendFailureCopy('attachment_upload').body,
    'Your attachment could not be uploaded. Please try again.'
  );
});

test('auth copy tells the user to sign in again', () => {
  assert.ok(/sign in/i.test(sendFailureCopy('auth').body));
});

test('every reason yields non-empty title and body', () => {
  for (const reason of ALL_REASONS) {
    const { title, body } = sendFailureCopy(reason);
    assert.ok(title.length > 0, reason);
    assert.ok(body.length > 0, reason);
  }
});

// --- shapes ----------------------------------------------------------------

test('sendFailure carries the reason, and detail only when given', () => {
  assert.deepEqual(sendFailure('insert'), { ok: false, reason: 'insert' });
  assert.deepEqual(sendFailure('insert', 'PGRST204'), {
    ok: false,
    reason: 'insert',
    detail: 'PGRST204',
  });
});

test('SEND_OK is a success result', () => {
  assert.equal(SEND_OK.ok, true);
});

// --- when to alert ---------------------------------------------------------

test('success never alerts', () => {
  assert.equal(shouldAlertForResult(SEND_OK), false);
});

test('a void result never alerts -- the caller opted out', () => {
  // The /survey slash command returns undefined: it handled itself, and the
  // old code showed no alert for it either.
  assert.equal(shouldAlertForResult(undefined), false);
});

test('validation never alerts -- nothing was attempted', () => {
  assert.equal(shouldAlertForResult(sendFailure('validation')), false);
});

test('every other failure alerts', () => {
  for (const reason of ALL_REASONS) {
    if (reason === 'validation') continue;
    assert.equal(
      shouldAlertForResult(sendFailure(reason)),
      true,
      `${reason} should alert`
    );
  }
});

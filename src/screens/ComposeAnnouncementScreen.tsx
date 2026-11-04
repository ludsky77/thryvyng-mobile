import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { isChannelStaff } from '../lib/channelStaff';
import { logError } from '../utils/logError';
import { CreatePollModal } from '../components/chat/CreatePollModal';
import { playbookVisible } from '../constants/playbookLaunch';
import { isAnnounceCardKey } from '../constants/announceCardKey';
import { clubAnnouncementsAudienceLine } from '../lib/clubAnnouncements';
import {
  ANNOUNCEMENTS_SETUP_PENDING_DETAIL,
  ANNOUNCEMENTS_SETUP_PENDING_MESSAGE,
  ANNOUNCEMENT_ACTION_LABELS,
  ANNOUNCEMENT_ACTION_LABEL_MAX,
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_MAX_ACTIONS,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_TITLE_MIN,
  POST_ANNOUNCEMENT_FAILED_MESSAGE,
  POST_ANNOUNCEMENT_REFUSED_MESSAGE,
  isSendableAction,
  postClubAnnouncement,
  type AnnouncementActionKind,
} from '../lib/clubAnnouncementCards';

/**
 * Compose one club announcement — ruling 2026-11-03 01:57.
 *
 * REPLACES the "Club-Wide Message" step in `ChatScreen`'s new-chat modal,
 * which was one line and one button and said so in its own comment ("THIS STEP
 * IS TEMPORARY. The card compose replaces it later in 1.0.20"). Before that it
 * was an age/gender/team audience picker whose team-id list nothing in the tree
 * ever read (recon §A1, PROVEN) — there is still exactly ONE audience, the
 * club's announcements channel, and the line at the top of this screen says so.
 *
 * THE DOOR IS THE SERVER'S ANSWER. `is_channel_staff` decides whether this
 * screen shows a form at all — the same predicate the `msg_insert` policy asks
 * (ruling FND-4d3), never a client-side role list. The tile that opens this
 * screen is additionally gated on `isClubAdmin` in `ChatScreen`, which is a
 * convenience: it keeps the tile out of a parent's modal, and it is NOT the
 * permission.
 *
 * ONE CALL. Title, body and buttons go to `post_club_announcement` together.
 * Three separate writes is what leaves a poll with options and no card when
 * the third is refused (recon §P-4) — here either the whole announcement
 * exists or none of it does.
 *
 * "ADD A POLL" IS A SECOND MESSAGE, DELIBERATELY. It opens the existing
 * `CreatePollModal` against this same channel, which posts its own
 * `message_type = 'poll'` row and renders through the existing `PollCard` in
 * the feed (recon §P-5). It is not folded into the RPC: a poll is already a
 * three-table write with its own error path, and announcement + poll in one
 * transaction is a server change nobody has ruled on.
 */

interface ComposeParams {
  channelId?: string;
  channelName?: string | null;
  clubName?: string | null;
}

/**
 * The narrow slice of React Navigation this screen uses.
 *
 * Spelled out rather than `any`: `RootStackParamList`
 * (src/navigation/linking.ts) is the DEEP-LINK list and does not carry the
 * chat stack, so there is nothing app-wide to borrow — the same reason
 * `ChannelPollsScreen` declares its own route type instead of reaching for
 * `useNavigation<any>()`.
 */
interface AnnouncementNavigation {
  navigate: (name: string, params?: object) => void;
  goBack: () => void;
  /**
   * React Navigation's own two, for the discard prompt
   * (RELEASE-1.0.20-FIXES). `beforeRemove` is the only hook that catches the
   * iOS swipe-back and the Android hardware back as well as the arrow, and
   * `dispatch` is how the original action is replayed once the person says
   * discard. Optional so the harness and the tests can still pass the two-key
   * object this interface started as.
   */
  addListener?: (
    event: 'beforeRemove',
    callback: (e: {
      preventDefault: () => void;
      data: { action: unknown };
    }) => void
  ) => () => void;
  dispatch?: (action: unknown) => void;
}


/** One button being built in the form. */
interface DraftAction {
  /** Local only, so a row can be edited and removed without index games. */
  id: string;
  kind: AnnouncementActionKind;
  label: string;
  /** The card key. Used by `playbook_card` and ignored by the other kinds. */
  target: string;
}

const KIND_NAMES: Record<AnnouncementActionKind, string> = {
  playbook: 'Playbook',
  playbook_card: 'Playbook card',
  courses: 'Courses',
};

let draftSeq = 0;
function newDraft(kind: AnnouncementActionKind): DraftAction {
  draftSeq += 1;
  return {
    id: `draft-${draftSeq}`,
    kind,
    label: ANNOUNCEMENT_ACTION_LABELS[kind],
    target: '',
  };
}

export default function ComposeAnnouncementScreen({
  route,
  navigation,
}: {
  route: { params?: ComposeParams };
  navigation: AnnouncementNavigation;
}) {
  const { channelId, channelName, clubName }: ComposeParams = route?.params ?? {};

  const [staffAnswer, setStaffAnswer] = useState<boolean | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [actions, setActions] = useState<DraftAction[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [setupPending, setSetupPending] = useState(false);
  const [pollVisible, setPollVisible] = useState(false);
  const [pollPosted, setPollPosted] = useState(false);

  // The one gate. `undefined` while in flight, and the form is not drawn until
  // the server answers — a form that appears and then disappears is worse than
  // a spinner.
  useEffect(() => {
    if (!channelId) {
      setStaffAnswer(false);
      return;
    }
    let cancelled = false;
    isChannelStaff(channelId).then((answer) => {
      if (!cancelled) setStaffAnswer(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const titleOverLong = trimmedTitle.length > ANNOUNCEMENT_TITLE_MAX;
  const bodyOverLong = trimmedBody.length > ANNOUNCEMENT_BODY_MAX;

  /**
   * A TITLE IS REQUIRED — Lu's ruling, 2026-11-03, and the RPC's own rule:
   * `p_title` NULL or blank raises P0073 `title_invalid` and nothing is
   * written. So the field is not optional-with-a-fallback; an empty one is a
   * send that cannot succeed, and Send stays down until it is filled.
   *
   * `titleMissing` is kept apart from `canSend` so the hint can be shown only
   * once someone has started the message — a form that opens already
   * complaining is worse than one that waits.
   */
  const titleMissing = trimmedTitle.length < ANNOUNCEMENT_TITLE_MIN;

  /** Which drafted buttons would actually be sent. */
  const sendableCount = useMemo(
    () => actions.filter((action) => isSendableAction(action)).length,
    [actions]
  );
  const incompleteActions = actions.length - sendableCount;

  /**
   * THE DISCARD PROMPT — RELEASE-1.0.20-FIXES (Lu, 2026-11-04), Round 1's S1.
   *
   * Leaving a filled form threw the draft away with nothing said. The LEAVE
   * itself is correct and was confirmed on screen (nothing is sent); what was
   * missing is the warning. Same shape as the one on
   * `SurveyResponseScreen.handleBack` — Alert, "Keep writing" cancel first,
   * destructive "Discard" second — because a second spelling of one question is
   * how two screens start asking it differently.
   *
   * DIRTY is anything typed or added. An untouched form, and a form whose
   * message has already gone, leave without a word.
   */
  const isDirty =
    trimmedTitle.length > 0 || trimmedBody.length > 0 || actions.length > 0;

  /**
   * Set the moment the person chooses Discard, so the `beforeRemove` listener
   * lets the replayed navigation through instead of asking a second time.
   */
  const discardingRef = useRef(false);

  const confirmDiscard = useCallback((leave: () => void) => {
    Alert.alert(
      'Discard this announcement?',
      'What you have written will not be saved, and nothing is sent.',
      [
        { text: 'Keep writing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            discardingRef.current = true;
            leave();
          },
        },
      ]
    );
  }, []);

  const handleBack = () => {
    if (!isDirty || sent) {
      navigation.goBack();
      return;
    }
    confirmDiscard(() => navigation.goBack());
  };

  /**
   * The swipe and the hardware button. The arrow above is handled directly
   * because it is this screen's own control; these two are the navigator's,
   * and `beforeRemove` is where they can be stopped.
   */
  useEffect(() => {
    const addListener = navigation.addListener;
    if (!addListener) return;
    return addListener('beforeRemove', (event) => {
      if (!isDirty || sent || discardingRef.current) return;
      event.preventDefault();
      confirmDiscard(() => navigation.dispatch?.(event.data.action));
    });
  }, [navigation, isDirty, sent, confirmDiscard]);

  const canSend =
    !!channelId &&
    !titleMissing &&
    !titleOverLong &&
    !!trimmedBody &&
    !bodyOverLong &&
    incompleteActions === 0 &&
    !sending;

  const addAction = (kind: AnnouncementActionKind) => {
    if (actions.length >= ANNOUNCEMENT_MAX_ACTIONS) return;
    setActions((prev) => [...prev, newDraft(kind)]);
  };

  const updateAction = (id: string, patch: Partial<DraftAction>) => {
    setActions((prev) =>
      prev.map((action) => (action.id === id ? { ...action, ...patch } : action))
    );
  };

  const removeAction = (id: string) => {
    setActions((prev) => prev.filter((action) => action.id !== id));
  };

  const send = async () => {
    if (!canSend || !channelId) return;
    setSending(true);
    setFailure(null);
    const result = await postClubAnnouncement({
      channelId,
      title: trimmedTitle,
      body: trimmedBody,
      actions,
    });
    setSending(false);

    if (result.status === 'ok') {
      setSent(true);
      return;
    }
    if (result.status === 'setup_pending') {
      // The RPC does not exist on this server yet. Not a failure of the
      // message — the specific missing-object codes, nothing else.
      setSetupPending(true);
      return;
    }
    if (result.status === 'refused') {
      setFailure(result.message);
      return;
    }
    logError('ComposeAnnouncement.post', result.error, { channelId });
    setFailure(POST_ANNOUNCEMENT_FAILED_MESSAGE);
  };

  /** Land on the feed, whichever door opened this screen. */
  const goToFeed = () => {
    if (!channelId) {
      navigation.goBack();
      return;
    }
    navigation.navigate('AnnouncementsFeed', {
      channelId,
      channelName: channelName ?? null,
      clubName: clubName ?? null,
    });
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={handleBack}
        accessibilityLabel="Back"
      >
        <Feather name="arrow-left" size={24} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>New announcement</Text>
      <View style={styles.headerButton} />
    </View>
  );

  if (staffAnswer === undefined) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  if (!staffAnswer) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <Feather name="lock" size={40} color="#475569" />
          <Text style={styles.stateTitle}>{POST_ANNOUNCEMENT_REFUSED_MESSAGE}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (setupPending) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <Feather name="tool" size={40} color="#475569" />
          <Text style={styles.stateTitle}>
            {ANNOUNCEMENTS_SETUP_PENDING_MESSAGE}
          </Text>
          <Text style={styles.stateBody}>{ANNOUNCEMENTS_SETUP_PENDING_DETAIL}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <Feather name="check-circle" size={44} color="#22c55e" />
          <Text style={styles.stateTitle}>Announcement sent</Text>
          <Text style={styles.stateBody}>
            {clubAnnouncementsAudienceLine(clubName)}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={goToFeed}>
            <Text style={styles.primaryButtonText}>Back to announcements</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          {/* ONE audience, said once — the same sentence the old step showed. */}
          <Text style={styles.audience}>{clubAnnouncementsAudienceLine(clubName)}</Text>

          {/* REQUIRED, and labelled as required. The RPC has no untitled
              branch (P0073 `title_invalid`), and the title is the whole card
              in the feed — a family scrolling the list sees this line and
              nothing else. */}
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            style={[styles.input, titleOverLong && styles.inputError]}
            value={title}
            onChangeText={setTitle}
            placeholder="Practice moved to 6pm Saturday"
            placeholderTextColor="#64748b"
            maxLength={ANNOUNCEMENT_TITLE_MAX}
          />
          {/* The hint waits for the message: an empty form that already
              complains reads as an error, not as guidance. Once there is
              something to send, the missing title is the thing in the way. */}
          {titleMissing && !!trimmedBody ? (
            <Text style={[styles.counter, styles.counterError]}>
              Add a title: it&rsquo;s what families see on the card.
            </Text>
          ) : (
            <Text style={[styles.counter, titleOverLong && styles.counterError]}>
              {trimmedTitle.length}/{ANNOUNCEMENT_TITLE_MAX}
            </Text>
          )}

          <Text style={styles.fieldLabel}>Message</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline, bodyOverLong && styles.inputError]}
            value={body}
            onChangeText={setBody}
            placeholder="What everyone needs to know"
            placeholderTextColor="#64748b"
            multiline
            textAlignVertical="top"
            maxLength={ANNOUNCEMENT_BODY_MAX}
          />
          {/* The count appears only near the ceiling. `p_body` is capped at
              4000 by the RPC (P0073 `body_invalid`) and almost no
              announcement comes close, so a permanent counter would be noise
              on every message to warn about a limit nobody reaches. */}
          {trimmedBody.length > ANNOUNCEMENT_BODY_MAX - 200 ? (
            <Text style={[styles.counter, bodyOverLong && styles.counterError]}>
              {trimmedBody.length}/{ANNOUNCEMENT_BODY_MAX}
            </Text>
          ) : null}

          {/* ── buttons ─────────────────────────────────────────────────── */}
          <Text style={styles.fieldLabel}>
            Buttons <Text style={styles.fieldHint}>(up to {ANNOUNCEMENT_MAX_ACTIONS})</Text>
          </Text>

          {actions.map((action) => {
            const keyBad =
              action.kind === 'playbook_card' && !isAnnounceCardKey(action.target.trim());
            return (
              <View key={action.id} style={styles.actionRow}>
                <View style={styles.actionRowTop}>
                  <Text style={styles.actionKind}>{KIND_NAMES[action.kind]}</Text>
                  <TouchableOpacity
                    onPress={() => removeAction(action.id)}
                    accessibilityLabel="Remove button"
                  >
                    <Feather name="x" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.inputSmall}
                  value={action.label}
                  onChangeText={(value) => updateAction(action.id, { label: value })}
                  placeholder="Button text"
                  placeholderTextColor="#64748b"
                  maxLength={ANNOUNCEMENT_ACTION_LABEL_MAX}
                />
                {action.kind === 'playbook_card' ? (
                  <>
                    <TextInput
                      style={[styles.inputSmall, keyBad && styles.inputError]}
                      value={action.target}
                      onChangeText={(value) =>
                        updateAction(action.id, { target: value })
                      }
                      placeholder="Card key, e.g. F3"
                      placeholderTextColor="#64748b"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={16}
                    />
                    <Text style={[styles.counter, keyBad && styles.counterError]}>
                      {keyBad
                        ? 'Letters, numbers, _ and - only, up to 16 characters'
                        : 'Opens the book on this card'}
                    </Text>
                  </>
                ) : null}
              </View>
            );
          })}

          {actions.length < ANNOUNCEMENT_MAX_ACTIONS ? (
            <View style={styles.addRow}>
              {/* The allow-list. The two Playbook kinds are hidden when the
                  launch switch is off, so a button is never visible-but-dead:
                  with `PLAYBOOK_LIVE = false` the `Playbook` route is not
                  registered at all. It is TRUE on this branch
                  (`src/constants/playbookLaunch.ts`, flipped 2026-11-01). */}
              {playbookVisible ? (
                <TouchableOpacity
                  style={styles.addChip}
                  onPress={() => addAction('playbook')}
                >
                  <Feather name="plus" size={14} color="#cbd5e1" />
                  <Text style={styles.addChipText}>Playbook</Text>
                </TouchableOpacity>
              ) : null}
              {playbookVisible ? (
                <TouchableOpacity
                  style={styles.addChip}
                  onPress={() => addAction('playbook_card')}
                >
                  <Feather name="plus" size={14} color="#cbd5e1" />
                  <Text style={styles.addChipText}>Playbook card</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.addChip}
                onPress={() => addAction('courses')}
              >
                <Feather name="plus" size={14} color="#cbd5e1" />
                <Text style={styles.addChipText}>Courses</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* ── optional poll ───────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.pollRow}
            onPress={() => setPollVisible(true)}
          >
            <Feather name="bar-chart-2" size={18} color="#cbd5e1" />
            <View style={styles.flex}>
              <Text style={styles.pollRowText}>Add a poll</Text>
              <Text style={styles.pollRowHint}>
                {pollPosted
                  ? 'Poll posted to this feed as its own card'
                  : 'Posted as its own card in this feed'}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color="#64748b" />
          </TouchableOpacity>

          {/* ── live preview ────────────────────────────────────────────── */}
          <Text style={styles.fieldLabel}>Preview</Text>
          <View style={styles.previewCard}>
            <Text style={styles.previewDate}>Today</Text>
            {/* THE TITLE, or the slot waiting for it — never the body. The
                card in the feed is the title and nothing else, and a title is
                required, so previewing the body as a headline would show a
                card that cannot be posted. */}
            <Text style={styles.previewTitle} numberOfLines={2}>
              {trimmedTitle || 'Your title goes here'}
            </Text>
            <Text style={styles.previewSender}>You · Staff</Text>
            {actions.map((action) => (
              <View key={`preview-${action.id}`} style={styles.previewButton}>
                <Text style={styles.previewButtonText}>
                  {action.label.trim() || KIND_NAMES[action.kind]}
                </Text>
                <Feather name="arrow-right" size={14} color="#fff" />
              </View>
            ))}
          </View>

          {failure ? <Text style={styles.failure}>{failure}</Text> : null}
          {incompleteActions > 0 ? (
            <Text style={styles.failure}>
              {incompleteActions === 1
                ? 'One button still needs its text or its card key.'
                : `${incompleteActions} buttons still need their text or card key.`}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, !canSend && styles.primaryButtonDisabled]}
            onPress={send}
            disabled={!canSend}
          >
            <Text style={styles.primaryButtonText}>
              {sending ? 'Sending…' : 'Send announcement'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <CreatePollModal
        visible={pollVisible}
        onClose={() => setPollVisible(false)}
        channelId={channelId ?? ''}
        onSuccess={() => setPollPosted(true)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  form: {
    padding: 20,
    paddingBottom: 48,
  },
  audience: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#64748b',
    marginTop: 18,
    marginBottom: 8,
  },
  fieldHint: {
    fontWeight: '500',
    textTransform: 'none',
    letterSpacing: 0,
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#f1f5f9',
  },
  inputSmall: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#f1f5f9',
    marginTop: 8,
  },
  inputMultiline: {
    minHeight: 120,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  counter: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 6,
    textAlign: 'right',
  },
  counterError: {
    color: '#ef4444',
    textAlign: 'left',
  },
  actionRow: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  actionRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionKind: {
    fontSize: 13,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  addRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addChipText: {
    fontSize: 13,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  pollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 20,
  },
  pollRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  pollRowHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  previewCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#C4976D',
  },
  previewDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 6,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
    lineHeight: 22,
  },
  previewSender: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 6,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  failure: {
    fontSize: 13,
    color: '#f87171',
    marginTop: 16,
    lineHeight: 19,
  },
  primaryButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryButtonDisabled: {
    backgroundColor: '#475569',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#e2e8f0',
    textAlign: 'center',
  },
  stateBody: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 19,
  },
});

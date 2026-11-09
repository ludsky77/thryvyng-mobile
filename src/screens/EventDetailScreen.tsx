import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { openInMaps } from '../lib/maps';
// expo-clipboard is already a project dependency and is how the rest of the app
// copies text (WelcomeScreen, JoinTeamScreen, InviteCoParentModal). No new dep.
import * as Clipboard from 'expo-clipboard';
import DateBadge, { accentAlpha } from '../components/calendar/DateBadge';
import EventTypeChip, {
  eventTitleBits,
  VsOpponent,
} from '../components/calendar/EventTypeChip';
import RsvpPill from '../components/calendar/RsvpPill';
import ResponsesBar from '../components/calendar/ResponsesBar';
import type { CalendarEvent } from '../types';
import { EditEventModal } from '../components/calendar/EditEventModal';
import { CantGoReasonModal } from '../components/calendar/CantGoReasonModal';
import { notifyTeamOfEvent } from '../services/eventNotifications';
import { confirmAndNotifyTeam, confirmAndNotifyTeamSeries } from '../lib/eventChangeNotify';
import PlayerAvatar from '../components/PlayerAvatar';
import { GameEntryButton } from '../components/game-stats/GameEntryButton';
import { isEventPast } from '../utils/calendar';
import {
  attributionLabel,
  myAnswerRows,
  pillStatusFor,
  type CoachStatus,
  type EffectiveStatus,
  type EventAttendanceRow,
} from '../utils/attendanceResolver';
import { useEventAttendance, withTimeout } from '../hooks/useEventAttendance';
import { upsertRsvp } from '../utils/rsvp';
import { resolveTeamColor } from '../constants/teamColors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function formatTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h || '0', 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m || '00'} ${ampm}`;
}

/**
 * Status vocabulary comes from get_event_attendance (via useEventAttendance),
 * the single source both the roster list and the Responses strip read. This
 * screen only renders what it is told.
 */
type DisplayStatus = EffectiveStatus;

const STATUS_CHIP: Record<DisplayStatus, { label: string; color: string }> = {
  going: { label: 'Going', color: '#22c55e' },
  cant_go: { label: "Can't go", color: '#ef4444' },
  no_reply: { label: 'No reply', color: '#64748b' },
};

/**
 * How a row's status is drawn on the Attendance tab.
 *
 * The product has exactly two stated answers plus silence -- there is no
 * middle option. The resolver has already folded the legacy coach marks
 * (late -> going, excused -> cant_go) and anything unrecognised into silence,
 * so there are only three kinds to draw here.
 */
type BadgeKind = 'going' | 'cant' | 'muted';

function statusBadge(status: DisplayStatus): { kind: BadgeKind; label: string } {
  if (status === 'going') return { kind: 'going', label: 'Going' };
  if (status === 'cant_go') return { kind: 'cant', label: "Can't go" };
  return { kind: 'muted', label: STATUS_CHIP[status]?.label ?? 'No reply' };
}

export default function EventDetailScreen({ route, navigation }: any) {
  const { event: eventParam, eventId, onRefetch } = route.params || {};
  const { user, currentRole } = useAuth();
  const [event, setEvent] = useState<CalendarEvent | null>(eventParam || null);
  const [loading, setLoading] = useState(!eventParam && !!eventId);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  /** The player whose "Can't go" reason sheet is open, or null when closed. */
  const [cantGoPlayerId, setCantGoPlayerId] = useState<string | null>(null);
  /** Brief "Address copied" confirmation under the location block. */
  const [addressCopied, setAddressCopied] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [nonResponders, setNonResponders] = useState<string[]>([]);
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);
  const [isStaffInTeam, setIsStaffInTeam] = useState(false);
  const [remindingTeam, setRemindingTeam] = useState(false);
  /** Raw coach marks, staff only -- which ✓/✗ is lit, not who is coming. */
  const [coachMarks, setCoachMarks] = useState<Map<string, CoachStatus>>(new Map());
  /** Active players on this team the viewer answers for (self, or each child). */
  const [myPlayerIds, setMyPlayerIds] = useState<string[]>([]);
  const [markingPlayerId, setMarkingPlayerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'attendance'>('details');
  const [lineup, setLineup] = useState<any | null>(null);
  const [language] = useState<'en' | 'es'>('en');

  useEffect(() => {
    const checkStaffPermission = async () => {
      if (!event?.team_id || !user?.id) {
        setIsStaffInTeam(false);
        return;
      }
      // Existence check, not a row fetch: a user can hold several team_staff
      // rows on one team (e.g. Head Coach + Team Manager), and maybeSingle()
      // errors on 2+ rows -- which silently stripped staff UI from exactly the
      // most senior staff.
      const { count, error } = await supabase
        .from('team_staff')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', event.team_id)
        .eq('user_id', user.id);
      if (error) {
        if (__DEV__) {
          console.warn('[EventDetail] staff check failed:', error);
        }
        setIsStaffInTeam(false);
        return;
      }
      setIsStaffInTeam((count ?? 0) > 0);
    };
    checkStaffPermission();
  }, [event?.team_id, user?.id]);

  const isManager = isStaffInTeam;
  const isStaff = isManager || (currentRole && ['club_admin', 'platform_admin'].includes(currentRole.role));
  /**
   * Who gets the coach ✓/✗ controls: a team_staff row on the event's team --
   * the same rule the prod event_attendance INSERT/UPDATE/DELETE policies use
   * (pg_policies read 2026-11-09, docs/recon/attendance-nov09.md Q6/S10). A
   * club or platform admin without that row is read-only here, so no button
   * is shown that the database would refuse.
   */
  const canMark = isStaffInTeam;

  // THE attendance read: one get_event_attendance call feeds the strip, the
  // list and the per-child controls.
  const attendance = useEventAttendance(event?.id, {
    userId: user?.id,
    myPlayerIds,
  });

  // silent = background refresh: keep whatever is on screen, never flip loading.
  const fetchEvent = useCallback(async (silent = false) => {
    if (!eventId && !eventParam) return;
    
    const id = eventId || eventParam?.id;
    if (!id) return;

    if (!silent) setLoading(true);
    try {
      const [eventRes, lineupRes] = await Promise.all([
        supabase
          .from('cal_events')
          .select(`*, team:teams(id, name, color)`)
          .eq('id', id)
          .single(),
        supabase
          .from('lineup_formations')
          .select(
            `id, name, formation_template, field_type, status, jersey_config, opponent_name, notes,
            players:lineup_players(id, player_id, guest_name, jersey_number, position_code, position_x, position_y, is_starter, is_captain, sort_order,
              player_profile:players(id, first_name, last_name)),
            plays:lineup_plays(id, name, name_es, category, subcategory, animation_data, coaching_points, coaching_points_es)`
          )
          .eq('event_id', id)
          .eq('status', 'published')
          .maybeSingle(),
      ]);

      const { data, error } = eventRes;
      if (error) throw error;

      if (data) {
        // No RSVP rows are read here any more: who is coming comes from
        // get_event_attendance (useEventAttendance), and nothing else.
        setEvent(data as CalendarEvent);
      }

      if (lineupRes.data) {
        setLineup(lineupRes.data);
      } else {
        setLineup(null);
      }
    } catch (err) {
      console.error('[EventDetail] Error fetching event:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [eventId, eventParam]);

  /**
   * Raw coach marks, for staff who can mark. They only decide which of the
   * ✓/✗ pair is lit -- a coach must still see their own mark after a parent
   * has overridden it -- and are never counted: status and counts come from
   * the function. A failed read keeps the marks already on screen.
   */
  const fetchCoachMarks = useCallback(async () => {
    if (!event?.id || !canMark) {
      setCoachMarks(new Map());
      return;
    }
    try {
      const { data, error } = await withTimeout((signal) =>
        supabase
          .from('event_attendance')
          .select('player_id, status')
          .eq('event_id', event.id)
          .abortSignal(signal)
      );
      if (error) throw error;
      const map = new Map<string, CoachStatus>();
      (data || []).forEach((r: any) => {
        if (r.player_id && r.status) map.set(r.player_id, r.status as CoachStatus);
      });
      setCoachMarks(map);
    } catch (err) {
      console.warn('[EventDetail] coach marks read failed; keeping previous:', err);
    }
  }, [event?.id, canMark]);

  /**
   * Which active players on this team the viewer answers for. Same link the
   * prod functions use (parent / secondary parent / the player's own email),
   * plus a player-role account's own player. Each one gets its own RSVP
   * control, and every write carries that player_id. Only players the
   * function returns are ever offered a control (myAnswerRows).
   */
  const fetchMyPlayers = useCallback(async () => {
    const email = user?.email || '';
    if (!event?.team_id || !user?.id) {
      setMyPlayerIds([]);
      return;
    }
    try {
      const [linked, roles] = await Promise.all([
        email
          ? withTimeout((signal) =>
              supabase
                .from('players')
                .select('id')
                .eq('team_id', event.team_id)
                .eq('status', 'active')
                .or(
                  `parent_email.eq.${email},secondary_parent_email.eq.${email},email.eq.${email}`
                )
                .abortSignal(signal)
            )
          : Promise.resolve({ data: [], error: null }),
        withTimeout((signal) =>
          supabase
            .from('user_roles')
            .select('entity_id')
            .eq('user_id', user.id)
            .eq('role', 'player')
            .abortSignal(signal)
        ),
      ]);
      if (linked.error && __DEV__) console.warn('[EventDetail] my-players read failed:', linked.error);
      if (roles.error && __DEV__) console.warn('[EventDetail] player-role read failed:', roles.error);
      const ids = new Set<string>();
      ((linked.data as any[]) || []).forEach((p: any) => p?.id && ids.add(p.id));
      ((roles.data as any[]) || []).forEach((r: any) => r?.entity_id && ids.add(String(r.entity_id)));
      setMyPlayerIds([...ids]);
    } catch (err) {
      console.warn('[EventDetail] my-players read failed:', err);
      setMyPlayerIds([]);
    }
  }, [event?.team_id, user?.id, user?.email]);

  const fetchNonResponders = useCallback(async () => {
    if (!event?.team_id || !event?.id) return;

    try {
      // Get team members: team_staff + parents of players (users who should RSVP)
      const { data: staffData } = await supabase
        .from('team_staff')
        .select('user_id')
        .eq('team_id', event.team_id);

      // Active roster only, like every other roster read on this screen.
      const { data: playersData } = await supabase
        .from('players')
        .select('id, parent_email, secondary_parent_email')
        .eq('team_id', event.team_id)
        .eq('status', 'active');

      const emails = new Set<string>();
      (playersData || []).forEach((p: any) => {
        if (p.parent_email) emails.add(p.parent_email);
        if (p.secondary_parent_email) emails.add(p.secondary_parent_email);
      });

      let parentUserIds: string[] = [];
      if (emails.size > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id')
          .in('email', Array.from(emails));
        parentUserIds = (profilesData || []).map((p: any) => p.id);
      }

      // Include player-role users themselves
      const playerIds = (playersData || []).map((p: any) => p.id);
      if (playerIds.length > 0) {
        const { data: playerRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'player')
          .in('entity_id', playerIds);
        const playerUserIds = (playerRoles || []).map((ur: any) => ur.user_id).filter(Boolean);
        parentUserIds = [...parentUserIds, ...playerUserIds];
      }

      const staffUserIds = (staffData || []).map((s: any) => s.user_id);
      const teamMemberIds = [...new Set([...staffUserIds, ...parentUserIds])];

      const { data: rsvps } = await supabase
        .from('cal_event_rsvps')
        .select('user_id')
        .eq('event_id', event.id);

      const respondedUserIds = new Set((rsvps || []).map((r: any) => r.user_id));
      const nonResponderIds = teamMemberIds.filter((id) => !respondedUserIds.has(id));

      setNonResponders(nonResponderIds);
    } catch (err) {
      console.error('[EventDetail] Error fetching non-responders:', err);
      setNonResponders([]);
    }
  }, [event?.id, event?.team_id]);

  useEffect(() => {
    // A navigated-in event object is a paint hint, NOT a substitute for the
    // fetch (it can be stale). Seed for an instant first paint, then always
    // fetch (silently, so nothing blanks). Attendance is read separately by
    // useEventAttendance.
    if (eventParam) {
      setEvent(eventParam);
      fetchEvent(true);
    } else {
      fetchEvent();
    }
  }, [eventParam, fetchEvent]);

  useEffect(() => {
    fetchCoachMarks();
  }, [fetchCoachMarks]);

  useEffect(() => {
    fetchMyPlayers();
  }, [fetchMyPlayers]);

  useEffect(() => {
    if (event?.id && event?.team_id && isStaff) {
      fetchNonResponders();
    }
  }, [event?.id, event?.team_id, isStaff, fetchNonResponders]);


  /** One row per player this viewer answers for -- one RSVP control each. */
  const myRows = useMemo(
    () => myAnswerRows(attendance.rows, myPlayerIds),
    [attendance.rows, myPlayerIds]
  );
  const headcount = attendance.headcount;

  /**
   * Answer for ONE player this viewer speaks for. Always carries that
   * player_id (ruling: no more NULL rows from this screen), always through the
   * single writer, and always followed by a re-read of the function -- the
   * row on screen is the database's verdict, not a local guess.
   */
  const handleRsvp = async (
    playerId: string,
    status: 'yes' | 'no' | 'pending',
    declineReason?: string | null
  ) => {
    if (!user || !event || !myPlayerIds.includes(playerId)) return;
    setRsvpLoading(true);

    try {
      // One writer for the whole app (src/utils/rsvp.ts). It upserts against
      // UNIQUE (event_id, user_id, player_id). ok:false covers a silent RLS
      // refusal too.
      const { ok, error } = await upsertRsvp({
        eventId: event.id,
        userId: user.id,
        playerId,
        status,
        declineReason,
      });

      if (!ok) {
        if (__DEV__) console.warn('[EventDetail] rsvp upsert failed:', error);
        Alert.alert('Error', 'Failed to save response. Please try again.');
        return;
      }

      setCantGoPlayerId(null);
      await attendance.refetch({ silent: true });
      if (isStaff) fetchNonResponders();
      onRefetch?.();
    } catch (err) {
      console.error('[EventDetail] RSVP error:', err);
      Alert.alert('Error', 'Failed to save response. Please try again.');
    } finally {
      setRsvpLoading(false);
    }
  };

  /**
   * "Going" on a row that is already going undoes the family's own answer
   * back to pending. When the going came from a COACH mark, the tap is a
   * confirmation instead -- it writes yes, never a pending that would wipe
   * the coach's present.
   */
  const handleGoingTap = (row: EventAttendanceRow) =>
    row.status === 'going' && row.source !== 'coach'
      ? handleRsvp(row.player_id, 'pending')
      : handleRsvp(row.player_id, 'yes');

  const handleCantGoSkip = () => {
    if (cantGoPlayerId) handleRsvp(cantGoPlayerId, 'no', null);
  };
  const handleCantGoSubmit = (reason: string) => {
    if (cantGoPlayerId) handleRsvp(cantGoPlayerId, 'no', reason.trim() || null);
  };

  const handleSendReminder = async () => {
    if (nonResponders.length === 0 || reminderSending || !event) return;

    setReminderSending(true);

    try {
      const dateStr = event.event_date
        ? new Date(event.event_date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
        : '';

      const { error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          user_ids: nonResponders,
          title: '📅 RSVP Needed',
          body: `${event.title} on ${dateStr} at ${formatTime(event.start_time)}. Please respond!`,
          type: 'event_reminder',
          data: {
            reference_type: 'event',
            reference_id: event.id,
          },
        },
      });

      if (error) throw error;

      setReminderSent(true);
      Alert.alert('Reminder Sent', `Notified ${nonResponders.length} team member(s)`);

      setTimeout(() => setReminderSent(false), 60 * 60 * 1000);
    } catch (err) {
      console.error('[EventDetail] Failed to send reminder:', err);
      Alert.alert('Error', 'Failed to send reminder. Please try again.');
    } finally {
      setReminderSending(false);
    }
  };

  // Whole-team reminder about the event itself. Distinct from handleSendReminder
  // above, which nudges only the members who have not RSVP'd yet.
  const handleRemindTeam = () => {
    if (!event || remindingTeam) return;

    Alert.alert(
      'Remind Team',
      'Send a reminder push to the team?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setRemindingTeam(true);
            try {
              await notifyTeamOfEvent({
                eventId: event.id,
                action: 'reminder',
              });
              Alert.alert('Reminder sent');
            } finally {
              setRemindingTeam(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelEvent = async () => {
    if (!event) return;
    
    Alert.prompt(
      'Cancel Event',
      'Add a reason for cancellation (optional):',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Cancel Event',
          style: 'destructive',
          onPress: async (reason?: string) => {
            try {
              const { error } = await supabase
                .from('cal_events')
                .update({
                  is_cancelled: true,
                  cancelled_reason: reason || null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', event.id);

              if (error) throw error;

              console.log('[Cancel] Event cancelled:', event.id);
              fetchEvent();
              onRefetch?.();

              // Ask before telling the team -- this used to fire on every
              // cancellation with no prompt. The cancel itself is already
              // committed above and is unaffected by the answer.
              await confirmAndNotifyTeam({
                event,
                eventId: event.id,
                action: 'cancelled',
              });
            } catch (err: any) {
              console.error('[Cancel] Error:', err);
              Alert.alert('Error', 'Failed to cancel event. Please try again.');
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const handleUncancelEvent = async () => {
    if (!event) return;
    
    try {
      const { error } = await supabase
        .from('cal_events')
        .update({
          is_cancelled: false,
          cancelled_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', event.id);

      if (error) throw error;

      // Notify team event is restored
      notifyTeamOfEvent({
        eventId: event.id,
        action: 'uncancelled',
      });
      console.log('[Uncancel] Event restored:', event.id);
      fetchEvent();
      onRefetch?.();
    } catch (err: any) {
      console.error('[Uncancel] Error:', err);
      Alert.alert('Error', 'Failed to restore event. Please try again.');
    }
  };

  const deleteSingleEvent = async () => {
    if (!event) return;
    try {
      // ⚠️ ORDER IS LOAD-BEARING: ask and send BEFORE deleting.
      // notify-team-event fetches the event row and returns 404 if it is
      // gone, and it has no 'deleted' action at all, so a post-delete
      // notification is impossible. The helper announces this as 'cancelled'
      // (what the team receives reads "Event Cancelled") while the dialog
      // says "deleted". Awaited so the push is out before the row goes; a
      // failed or declined push still falls through to the delete.
      await confirmAndNotifyTeam({
        event,
        eventId: event.id,
        action: 'deleted',
      });

      console.log('[Delete] Deleting single event:', event.id);
      
      const { error: rsvpError } = await supabase
        .from('cal_event_rsvps')
        .delete()
        .eq('event_id', event.id);
      
      if (rsvpError) {
        console.error('[Delete] RSVP delete error:', rsvpError);
      }

      const { error: eventError } = await supabase
        .from('cal_events')
        .delete()
        .eq('id', event.id);

      if (eventError) {
        console.error('[Delete] Event delete error:', eventError);
        throw eventError;
      }

      console.log('[Delete] Successfully deleted event');
      onRefetch?.();
      navigation.goBack();
    } catch (err: any) {
      console.error('[Delete] Error:', err);
      Alert.alert('Error', err.message || 'Failed to delete event. Please try again.');
    }
  };

  const deleteThisAndFutureEvents = async () => {
    if (!event?.recurrence_group_id) {
      console.log('[Delete] No recurrence_group_id, deleting single');
      return deleteSingleEvent();
    }

    try {
      console.log('[Delete] Fetching future events for group:', event.recurrence_group_id);
      
      const { data: futureEvents, error: fetchError } = await supabase
        .from('cal_events')
        .select('id')
        .eq('recurrence_group_id', event.recurrence_group_id)
        .gte('event_date', event.event_date);

      if (fetchError) {
        console.error('[Delete] Fetch error:', fetchError);
        throw fetchError;
      }

      console.log('[Delete] Found future events:', futureEvents?.length);

      if (futureEvents && futureEvents.length > 0) {
        const eventIds = futureEvents.map((e) => e.id);

        // ⚠️ ORDER IS LOAD-BEARING: ask and send BEFORE deleting, same as
        // deleteSingleEvent. notify-team-event re-reads the event row and
        // 404s if it is gone, and it resolves recipients off that row's
        // team_id -- so once these rows are deleted no series push is
        // possible at all. Awaited so the push is out before the rows go; a
        // declined or failed push still falls through to the delete below.
        //
        // series_count is eventIds.length -- the SAME array the delete runs
        // on, not a re-query -- so the number the team is told and the rows
        // actually removed cannot disagree.
        await confirmAndNotifyTeamSeries({
          event,
          eventId: event.id,
          seriesCount: eventIds.length,
          seriesFrom: event.event_date,
        });

        const { error: rsvpError } = await supabase
          .from('cal_event_rsvps')
          .delete()
          .in('event_id', eventIds);

        if (rsvpError) {
          console.error('[Delete] RSVP batch delete error:', rsvpError);
        }

        const { error: eventsError } = await supabase
          .from('cal_events')
          .delete()
          .in('id', eventIds);

        if (eventsError) {
          console.error('[Delete] Events batch delete error:', eventsError);
          throw eventsError;
        }

        console.log('[Delete] Successfully deleted', eventIds.length, 'events');
      }

      onRefetch?.();
      navigation.goBack();
    } catch (err: any) {
      console.error('[Delete] Error:', err);
      Alert.alert('Error', err.message || 'Failed to delete events. Please try again.');
    }
  };

  const handleDelete = () => {
    if (!event) return;
    const isRecurring = event.recurrence_group_id || event.is_recurring;

    if (isRecurring && event.recurrence_group_id) {
      Alert.alert(
        'Delete Recurring Event',
        'This event is part of a series. What would you like to delete?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'This Event Only', onPress: deleteSingleEvent },
          { text: 'This & Future Events', style: 'destructive', onPress: deleteThisAndFutureEvents },
        ]
      );
    } else {
      Alert.alert(
        'Delete Event',
        'Are you sure you want to delete this event?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: deleteSingleEvent },
        ]
      );
    }
  };

  const handleOpenMaps = () => {
    if (!event) return;
    openInMaps(event.location_address || '', event.location_name || undefined);
  };

  /**
   * Long-press the location block to copy it. Tap still opens Maps -- the two
   * gestures do not compete. Prefers the street address, since that is what is
   * useful in another app; falls back to the venue name when there is no
   * address on the event.
   */
  // Clear the confirmation on its own so it reads as a transient toast rather
  // than a permanent label. Cleanup covers unmounting mid-timer.
  useEffect(() => {
    if (!addressCopied) return;
    const t = setTimeout(() => setAddressCopied(false), 1800);
    return () => clearTimeout(t);
  }, [addressCopied]);

  const handleCopyAddress = async () => {
    const text = event?.location_address || event?.location_name || '';
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      setAddressCopied(true);
    } catch (err) {
      if (__DEV__) console.warn('[EventDetail] clipboard write failed:', err);
      Alert.alert('Could not copy', text);
    }
  };

  /**
   * Coach headcount tool. Writes ONLY to event_attendance -- never to
   * cal_event_rsvps, whose vocabulary is the family's. This is now the only
   * coach-facing writer in the app: the separate "take attendance" sheet,
   * which wrote the FAMILY's table under the coach's user_id and overwrote the
   * parent's own row, is deleted.
   *
   * The mark no longer outranks the family by position -- it competes on
   * recency through the resolver, so marking here overrides a parent's earlier
   * answer and a parent answering later overrides this. The family is never
   * locked out.
   */
  const markAttendance = async (playerId: string, status: CoachStatus) => {
    if (!event || !user?.id || !canMark) return;

    setMarkingPlayerId(playerId);
    try {
      const { data, error } = await supabase
        .from('event_attendance')
        .upsert(
          {
            event_id: event.id,
            player_id: playerId,
            status,
            marked_by: user.id,
          },
          { onConflict: 'event_id,player_id' }
        )
        .select('id');

      // Staff-only RLS filters a denied write out silently: no error, no rows.
      if (error || !data || data.length === 0) {
        if (__DEV__) console.warn('[EventDetail] attendance upsert failed:', error);
        Alert.alert('Error', 'Could not save attendance');
        return;
      }
      await Promise.all([fetchCoachMarks(), attendance.refetch({ silent: true })]);
    } finally {
      setMarkingPlayerId(null);
    }
  };

  const unmarkAttendance = async (playerId: string) => {
    if (!event || !canMark) return;

    setMarkingPlayerId(playerId);
    try {
      const { data, error } = await supabase
        .from('event_attendance')
        .delete()
        .eq('event_id', event.id)
        .eq('player_id', playerId)
        .select('id');

      if (error || !data || data.length === 0) {
        if (__DEV__) console.warn('[EventDetail] attendance delete failed:', error);
        Alert.alert('Error', 'Could not remove the mark');
        return;
      }
      await Promise.all([fetchCoachMarks(), attendance.refetch({ silent: true })]);
    } finally {
      setMarkingPlayerId(null);
    }
  };

  if (loading || !event) {
    return (
      <View style={[styles.container, styles.centered]}>
        {loading ? (
          <>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.loadingText}>Loading event...</Text>
          </>
        ) : (
          <Text style={styles.loadingText}>Event not found</Text>
        )}
      </View>
    );
  }

  /**
   * The event's own card. F1 (Lu, Oct 26): on the Details tab it carries
   * EVERYTHING about the event -- header, detail rows, then the RSVP pill, the
   * headcount and the staff reminders, handed in as `footer`. The Attendance
   * tab renders the SAME card with no footer, so the two tabs cannot drift
   * apart the way a separate banner did.
   */
  const renderEventCard = (footer: React.ReactNode = null) => {
    /**
     * Ruling R-J: the detail card speaks the LIST CARD's colour language --
     * leaf, 5pt strip and frame in the team's colour, the type as the same
     * grey chip. There is no event-type colour left on this screen: the
     * previous `eventAccent(event.event_type)` painted a game's leaf green
     * here while the list card beside it had just gone team-coloured, so
     * tapping a card changed its colour.
     *
     * `team` arrives on the route param from the calendar and is re-embedded
     * by this screen's own fetch; `team_id` is the fallback seed so the colour
     * is still the team's own on the very first frame from a screen that
     * navigated here without the embed.
     */
    const teamColor = resolveTeamColor(
      (event as any).team ?? { id: event.team_id }
    );
    // R-H'/R-K: the same helper the list card and the pills use, so one game
    // is named the same way on all three.
    const { opponent, title } = eventTitleBits(event);
    const teamName = (event as any).team?.name as string | undefined;

    return (
    <View style={[
      styles.eventCard,
      // F1 frame: a 2pt border at 50% so it reads as a frame, plus a
      // 5pt solid left strip in the same colour. Both are real borders,
      // so they follow the card's radius without any extra element.
      {
        borderColor: accentAlpha(teamColor, 0.5),
        borderLeftColor: teamColor,
      },
      event.is_cancelled && styles.mainCardCancelled
    ]}>
      {/* Header: the date leaf sits beside the title / team / chips
          only. It is a fixed-size tile, so it never stretches to
          whatever height the detail rows below add up to. The type
          lives in the chip beside the title, not in the leaf. */}
      <View style={styles.cardHeader}>
        <DateBadge
          date={new Date(event.event_date + 'T12:00:00')}
          variant="tag"
          // R-J: the team's colour, same as the list card's leaf. Its weekday
          // band is that colour darkened 12%, which DateBadge does itself.
          color={teamColor}
        />

        <View style={styles.headerContent}>
          {/* R-H' (device pass, Oct 26): the header reads in the same order
              as the list card it was opened from -- TEAM NAME as the headline,
              then "vs Rapids" (R-K) and/or the title, each only when it says
              something the chip below has not. It used to lead with the title,
              which for a game was the bare opponent string ("Rapids") sitting
              above the team in grey. */}
          <View style={styles.titleRow}>
            <View style={styles.titleAndTeam}>
              {teamName ? (
                <View style={styles.teamNameRow}>
                  <View style={[styles.teamDot, { backgroundColor: teamColor }]} />
                  <Text style={styles.teamNameText} numberOfLines={2}>
                    {teamName}
                  </Text>
                </View>
              ) : null}
              {opponent ? (
                <VsOpponent name={opponent} style={styles.eventOpponent} />
              ) : null}
              {title ? (
                <Text
                  style={[
                    styles.eventTitle,
                    event.is_cancelled && styles.eventTitleCancelled
                  ]}
                  numberOfLines={2}
                >
                  {title}
                </Text>
              ) : null}
            </View>
            {isManager && (
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setEditModalVisible(true)}
              >
                <Ionicons name="pencil" size={16} color="#8b5cf6" />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Badges */}
          <View style={styles.badgesRow}>
            {/* R-J: the SAME chip the list card and the pills render. It was
                a tinted badge in the event type's own colour -- the last
                event-type hue on this screen. */}
            <EventTypeChip eventType={event.event_type} />
            {(event.recurrence_group_id || event.is_recurring) && (
              <View style={styles.recurringBadge}>
                <Text style={styles.recurringBadgeText}>🔄 Recurring</Text>
              </View>
            )}
            {event.is_cancelled && (
              <View style={styles.cancelledBadge}>
                <Text style={styles.cancelledBadgeText}>❌ CANCELLED</Text>
              </View>
            )}
          </View>

          {/* Cancelled Reason */}
          {event.is_cancelled && event.cancelled_reason && (
            <View style={styles.cancelledReasonBox}>
              <Text style={styles.cancelledReasonText}>
                Reason: {event.cancelled_reason}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.cardDivider} />

      {/* Detail rows, full width -- no left gutter under the tag. */}
      <View style={styles.cardBody}>
        {/* Location */}
        {(event.location_name || event.location_address) && (
          <TouchableOpacity
            style={styles.infoRow}
            onPress={handleOpenMaps}
            onLongPress={handleCopyAddress}
            delayLongPress={350}
          >
            <Ionicons name="location-outline" size={18} color="#8b5cf6" />
            <View style={styles.infoContent}>
              {event.location_name && (
                <Text style={styles.infoTitle}>{event.location_name}</Text>
              )}
              {event.location_address && (
                <Text style={styles.infoSubtitle}>{event.location_address}</Text>
              )}
              {addressCopied ? (
                <Text style={styles.copiedHint}>✓ Address copied</Text>
              ) : (
                <Text style={styles.tapHint}>
                  Tap to open in Maps · hold to copy
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* ------------------------------------------------------------
            MAP PREVIEW PLACEHOLDER
            Reserved for the static/interactive map of location_address.
            Intentionally empty for now: no map dependency is installed
            and none is added by this change. Drop the map component in
            here; the surrounding layout already accounts for its height.
           ------------------------------------------------------------ */}
        {event.location_address ? (
          <View style={styles.mapPlaceholder} />
        ) : null}

        {/* Time -- arrival is the number that gets people there on time,
            so it leads and the start/end window sits under it. */}
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={18} color="#8b5cf6" />
          <View style={styles.infoContent}>
            {event.is_all_day ? (
              <Text style={styles.infoTitle}>All Day</Text>
            ) : event.arrival_time ? (
              <>
                <Text style={styles.arriveTitle}>
                  Arrive {formatTime(event.arrival_time)}
                </Text>
                <Text style={styles.infoSubtitle}>
                  {formatTime(event.start_time)}
                  {event.end_time ? ` to ${formatTime(event.end_time)}` : ''}
                </Text>
              </>
            ) : (
              <Text style={styles.infoTitle}>
                {formatTime(event.start_time)}
                {event.end_time ? ` to ${formatTime(event.end_time)}` : ''}
              </Text>
            )}
          </View>
        </View>

        {/* Venue (for games) */}
        {event.home_away && (
          <View style={styles.infoRow}>
            <Ionicons name="flag-outline" size={18} color="#8b5cf6" />
            <View style={styles.infoContent}>
              <View
                style={[
                  styles.venueBadge,
                  event.home_away === 'home' && { backgroundColor: '#5BA58C' },
                  event.home_away === 'away' && { backgroundColor: '#B57B7B' },
                  event.home_away === 'neutral' && { backgroundColor: '#6b7280' },
                ]}
              >
                <Text style={styles.venueBadgeText}>
                  {event.home_away.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Uniform */}
        {event.uniform && (
          <View style={styles.infoRow}>
            <Ionicons name="shirt-outline" size={18} color="#8b5cf6" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>{event.uniform}</Text>
            </View>
          </View>
        )}

        {/* Notes */}
        {event.notes && (
          <View style={styles.infoRow}>
            <Ionicons name="document-text-outline" size={18} color="#8b5cf6" />
            <View style={styles.infoContent}>
              <Text style={styles.infoSubtitle}>{event.notes}</Text>
            </View>
          </View>
        )}
      </View>

      {footer ? (
        <>
          <View style={styles.cardDivider} />
          {footer}
        </>
      ) : null}
    </View>
    );
  };

  /**
   * Details-tab-only half of the card: the answer control, the headcount and
   * the staff reminders. All three used to be separate cards stacked below the
   * event card; F1 moves them inside it. Same state, same single writer, same
   * visibility rules -- only the container changed.
   */
  /**
   * What to draw instead of the list / strip when there are no rows to show.
   * Null when the rows are ready. Loading is a line of text with a hard 12 s
   * ceiling (the hook's timeout), never a spinner; a failed read and an empty
   * result both offer Retry.
   */
  const renderAttendanceState = (): React.ReactNode | null => {
    if (attendance.state === 'ready') return null;
    if (attendance.state === 'loading') {
      return <Text style={styles.attStateText}>Loading responses…</Text>;
    }
    return (
      <View style={styles.attStateBox}>
        <Text style={styles.attStateText}>
          {attendance.state === 'error'
            ? "Couldn't load responses."
            : 'No roster to show for this event.'}
        </Text>
        <TouchableOpacity
          style={styles.attRetryBtn}
          onPress={() => attendance.refetch({ silent: false })}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.attRetryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const detailsCardFooter = (
    <View style={styles.cardFooter}>
      {/* Will you be there? -- one control per player this viewer answers
          for: their own row, or one per child for a multi-kid parent. Each
          calls handleRsvp(player_id, ...) -> upsertRsvp, always with that
          player_id. Staff / admins with no linked player get no control. */}
      {!isEventPast(event) && myRows.length > 0 && (
        <View style={styles.rsvpSection}>
          {myRows.map((row) => (
            <View key={row.player_id} style={styles.rsvpChild}>
              {/* Caption OVER the control, not beside it: the question at 16pt
                  bold on one line squeezed the pill into three wrapped lines. */}
              <Text style={styles.rsvpLabel} numberOfLines={1}>
                {myRows.length === 1
                  ? 'Will you be there?'
                  : `Is ${row.first_name || 'your player'} going?`}
              </Text>
              <RsvpPill
                stretch
                status={pillStatusFor(row.status)}
                disabled={rsvpLoading}
                onGoing={() => handleGoingTap(row)}
                onCantGo={() => setCantGoPlayerId(row.player_id)}
              />
              {row.status === 'cant_go' && row.decline_reason ? (
                <Text style={styles.myReasonText}>“{row.decline_reason}”</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {/* Headcount, from the same get_event_attendance rows the Attendance
          tab lists -- roster = rows returned, so no count can exceed it. */}
      {renderAttendanceState() ?? (
        <ResponsesBar
          rosterCount={headcount.roster}
          going={headcount.going}
          cant={headcount.cantGo}
          noReply={headcount.noReply}
          markedByCoach={headcount.markedByCoach}
        />
      )}

      {/* Staff reminders. Gate is unchanged: staff only, future
          events only -- the same `isStaff` + `!isEventPast` pair that
          guarded the two stacked buttons below. */}
      {isStaff && !isEventPast(event) && (
        <View style={styles.remindRow}>
          <TouchableOpacity
            style={[
              styles.remindPrimary,
              (nonResponders.length === 0 || reminderSent) &&
                styles.reminderButtonDisabled,
            ]}
            onPress={handleSendReminder}
            disabled={nonResponders.length === 0 || reminderSending || reminderSent}
          >
            {reminderSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.remindPrimaryText} numberOfLines={1}>
                {reminderSent
                  ? '🔔 Reminder sent'
                  : attendance.state === 'ready' && headcount.noReply === 0
                    ? '🔔 All responded'
                    : attendance.state === 'ready'
                      ? `🔔 Remind ${headcount.noReply}`
                      : '🔔 Remind'}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.remindOutline,
              remindingTeam && styles.reminderButtonDisabled,
            ]}
            onPress={handleRemindTeam}
            disabled={remindingTeam}
          >
            {remindingTeam ? (
              <ActivityIndicator size="small" color="#8b5cf6" />
            ) : (
              <Text style={styles.remindOutlineText} numberOfLines={1}>
                Remind team
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {event.title}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Everyone on the team sees both tabs: the Attendance list is the
          whole team's names + status, read-only unless you can mark. */}
      <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'details' && styles.tabActive]}
            onPress={() => setActiveTab('details')}
          >
            <Text style={[styles.tabText, activeTab === 'details' && styles.tabTextActive]}>
              Details
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'attendance' && styles.tabActive]}
            onPress={() => setActiveTab('attendance')}
          >
            <Text style={[styles.tabText, activeTab === 'attendance' && styles.tabTextActive]}>
              Attendance
            </Text>
          </TouchableOpacity>
        </View>

      {activeTab === 'attendance' ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* F1: the Attendance tab gets the SAME framed card as Details,
              header + detail rows only -- no answer control, no headcount, no
              reminders. It replaces the one-line `attBanner` strip, which
              repeated the date/type/time in its own format and could drift. */}
          {renderEventCard()}
          <Text style={styles.attHeading}>
            {canMark ? 'Mark who showed up' : 'Team responses'}
          </Text>
          {renderAttendanceState() ??
            attendance.rows.map((row) => {
              const busy = markingPlayerId === row.player_id;
              const badge = statusBadge(row.status);
              const coachStatus = coachMarks.get(row.player_id) ?? null;
              // Source on every marked row; the marker's name only when the
              // function returned it (staff / club admin callers).
              const attribution = attributionLabel(row);
              const isMine = myPlayerIds.includes(row.player_id);
              return (
                <View key={row.player_id} style={styles.attRow}>
                  <PlayerAvatar
                    firstName={row.first_name}
                    lastName={row.last_name}
                    size={40}
                    teamColor={(event as any).team?.color || '#5B7BB5'}
                  />
                  <View style={styles.attInfo}>
                    <Text style={styles.attName} numberOfLines={1}>
                      {row.first_name} {row.last_name}
                    </Text>
                    {/* NULL unless the caller may see it -- enforced in SQL. */}
                    {row.decline_reason ? (
                      <Text style={styles.attReason} numberOfLines={2}>
                        “{row.decline_reason}”
                      </Text>
                    ) : null}
                    {attribution ? (
                      <Text style={styles.attHint}>{attribution}</Text>
                    ) : null}
                  </View>

                  {/* The player's ONE status. Read-only for everyone. */}
                  <View
                    style={[
                      styles.attBadge,
                      badge.kind === 'going' && styles.attBadgeGoing,
                      badge.kind === 'cant' && styles.attBadgeCant,
                      badge.kind === 'muted' && styles.attBadgeMuted,
                    ]}
                  >
                    {badge.kind === 'going' ? (
                      <Ionicons name="checkmark" size={14} color="#22c55e" />
                    ) : badge.kind === 'cant' ? (
                      <Ionicons name="close" size={14} color="#ef4444" />
                    ) : (
                      <Text style={styles.attBadgeMutedText}>{badge.label}</Text>
                    )}
                  </View>

                  {canMark ? (
                    busy ? (
                      <View style={styles.attControls}>
                        <ActivityIndicator size="small" color="#8b5cf6" />
                      </View>
                    ) : (
                      <View style={styles.attControls}>
                        <TouchableOpacity
                          style={[
                            styles.attAbsentBtn,
                            coachStatus === 'absent' && styles.attAbsentBtnActive,
                          ]}
                          // Tapping the active mark clears it.
                          onPress={() =>
                            coachStatus === 'absent'
                              ? unmarkAttendance(row.player_id)
                              : markAttendance(row.player_id, 'absent')
                          }
                          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        >
                          <Text
                            style={[
                              styles.attBtnText,
                              coachStatus === 'absent' && styles.attBtnTextActive,
                            ]}
                          >
                            ✗
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.attPresentBtn,
                            coachStatus === 'present' && styles.attPresentBtnActive,
                          ]}
                          onPress={() =>
                            coachStatus === 'present'
                              ? unmarkAttendance(row.player_id)
                              : markAttendance(row.player_id, 'present')
                          }
                          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        >
                          <Text
                            style={[
                              styles.attPresentText,
                              coachStatus === 'present' && styles.attBtnTextActive,
                            ]}
                          >
                            ✓
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )
                  ) : isMine && !isEventPast(event) ? (
                    // Self-mark only: the viewer's own row (or each child's).
                    <RsvpPill
                      compact
                      style={styles.attOwnPill}
                      status={pillStatusFor(row.status)}
                      disabled={rsvpLoading}
                      onGoing={() => handleGoingTap(row)}
                      onCantGo={() => setCantGoPlayerId(row.player_id)}
                    />
                  ) : null}
                </View>
              );
            })}
          <View style={styles.bottomPadding} />
        </ScrollView>
      ) : (
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Main Event Card */}
          {renderEventCard(detailsCardFooter)}

          {/* Game entry -- whole team. Watch / View Match Summary are
              read-only and shown to everyone; Start Match Center and Stats
              Console are staff-only inside the component (canManage). */}
          {event.event_type === 'game' && event.team_id && (
            <View style={{ marginBottom: 16 }}>
              <GameEntryButton
                eventId={event.id}
                teamId={event.team_id}
                eventType={event.event_type}
                canManage={!!isStaff}
              />
            </View>
          )}

          {/* LINEUP Section - when published lineup linked to event */}
          {lineup && (
            <TouchableOpacity
              style={{
                backgroundColor: '#1e293b',
                borderWidth: 1,
                borderColor: '#334155',
                borderRadius: 12,
                padding: 16,
                marginHorizontal: 16,
                marginVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
              }}
              onPress={() =>
                navigation.navigate('LineupView', {
                  lineupId: lineup.id,
                  eventTitle: event?.title,
                })
              }
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>LINEUP</Text>
                  <View style={{ backgroundColor: '#334155', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, color: '#94a3b8' }}>{lineup.formation_template || '4-3-3'}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  {lineup.players?.filter((p: any) => p.is_starter).length || 0} starters · Tap to view
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color="#64748b" />
            </TouchableOpacity>
          )}

          {/* Past notice. The reason sheet now lives at screen level, so
              the Attendance tab's own-row pills can open it too. */}
          {isEventPast(event) ? (
            <View style={styles.pastEventNotice}>
              <Text style={styles.pastEventNoticeText}>This event has passed</Text>
            </View>
          ) : null}

        <View style={styles.bottomPadding} />
      </ScrollView>
      )}

      {!isEventPast(event) && (
        <CantGoReasonModal
          visible={cantGoPlayerId !== null}
          onClose={() => setCantGoPlayerId(null)}
          onSkip={handleCantGoSkip}
          onSubmit={handleCantGoSubmit}
          submitting={rsvpLoading}
        />
      )}

      {/* Edit Event Modal */}
      <EditEventModal
        visible={editModalVisible}
        event={event}
        onClose={() => setEditModalVisible(false)}
        onSuccess={() => {
          setEditModalVisible(false);
          fetchEvent();
          onRefetch?.();
        }}
        onDelete={handleDelete}
        onCancel={handleCancelEvent}
        onUncancel={handleUncancelEvent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#64748b',
    marginTop: 12,
    fontSize: 14,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  headerRight: {
    width: 40,
  },

  // Tabs

  // Main Card
  scroll: {
    flex: 1,
  },
  eventCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    // F1 frame; both colours come from the event type at the call site. No
    // `overflow: 'hidden'` any more -- it clipped the date badge's glow, and
    // nothing in the card reaches the corners now.
    borderWidth: 2,
    borderLeftWidth: 5,
    marginHorizontal: 16,
    marginTop: 16,
  },
  mainCardCancelled: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },
  headerContent: {
    flex: 1,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 16,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    // Round 3: +4pt of air above the footer hairline.
    paddingBottom: 8,
  },

  // Title Row
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleAndTeam: {
    flex: 1,
    marginRight: 8,
  },
  // Dot on the FIRST line: centring it put the dot between the two lines of a
  // team name that wraps.
  teamNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  teamDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginRight: 7,
    // (24pt line box - 9pt dot) / 2, so it sits on the headline's cap height.
    marginTop: 7,
  },
  // R-H': the headline. Was 14pt grey under a 20pt title; they have traded
  // places, matching the list card.
  teamNameText: {
    flexShrink: 1,
    minWidth: 0,
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  // R-K: "vs Rapids" under the headline, in the list card's voice.
  eventOpponent: {
    marginTop: 3,
    fontSize: 16,
  },
  eventTitle: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 3,
    marginRight: 8,
  },
  eventTitleCancelled: {
    textDecorationLine: 'line-through',
    color: '#64748b',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  editButtonText: {
    color: '#8b5cf6',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },

  // Badges
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // typeBadge / typeBadgeText deleted with the event-type hue they carried:
  // the type is EventTypeChip now (R-J).
  recurringBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  recurringBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#a78bfa',
  },
  cancelledBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  cancelledBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ef4444',
    letterSpacing: 0.5,
  },

  // Info Rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoContent: {
    flex: 1,
    marginLeft: 10,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  infoSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 2,
  },
  cancelledReasonBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  cancelledReasonText: {
    color: '#f87171',
    fontSize: 13,
    fontStyle: 'italic',
  },
  tapHint: {
    color: '#8b5cf6',
    fontSize: 12,
    marginTop: 4,
  },
  copiedHint: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  venueBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  venueBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Responses
  headcountItem: {
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
  },
  headcountCount: {
    color: '#8b5cf6',
  },
  // Loading / failed / empty in place of the strip or the list. Text, not a
  // spinner; Retry re-runs the one read.
  attStateBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  attStateText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 4,
  },
  attRetryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#3a4360',
  },
  attRetryText: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '700',
  },
  // A parent/player's own row on the Attendance tab: the compact RSVP pill
  // sits where staff see the ✓/✗ pair.
  attOwnPill: {
    flexShrink: 0,
    marginLeft: 8,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 8,
  },
  rosterInfo: {
    flex: 1,
  },
  rosterName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  rosterReason: {
    color: '#94a3b8',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  rosterSource: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  mapPlaceholder: {
    height: 0,
  },
  arriveTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#8b5cf6',
  },
  tabText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  // F1: the card's lower half. The three cards these replaced
  // (willCard / responsesCard / the two stacked reminder buttons) are gone,
  // and so are their styles.
  cardFooter: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 16,
  },
  rsvpSection: {
    gap: 14,
  },
  // One caption + pill per player the viewer answers for.
  rsvpChild: {
    gap: 8,
  },
  rsvpLabel: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  remindRow: {
    flexDirection: 'row',
    gap: 10,
  },
  remindPrimary: {
    flex: 1,
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remindPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  remindOutline: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#8b5cf6',
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remindOutlineText: {
    color: '#8b5cf6',
    fontSize: 13,
    fontWeight: '700',
  },
  // Purple accent family, matching the icon/accent colour used across the app.
  attReason: {
    color: '#94a3b8',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  attBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attBadgeGoing: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  attBadgeCant: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  attBadgeMuted: {
    borderColor: '#334155',
    backgroundColor: 'rgba(100, 116, 139, 0.15)',
  },
  attBadgeMutedText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  attHeading: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 12,
  },
  attInfo: {
    flex: 1,
  },
  attName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  attHint: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  attControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 76,
    justifyContent: 'flex-end',
  },
  attPresentBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attPresentBtnActive: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  attAbsentBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attAbsentBtnActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  attPresentText: {
    color: '#94a3b8',
    fontSize: 17,
    fontWeight: '700',
  },
  attBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
  },
  attBtnTextActive: {
    color: '#fff',
  },
  myReasonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 16,
  },

  // Lineup Section
  lineupCard: {
    backgroundColor: '#1e293b',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
  },
  lineupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  lineupSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  lineupPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lineupPill: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lineupPillText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  lineupOpponent: {
    fontSize: 13,
    color: '#94a3b8',
  },
  lineupListTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  lineupPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  lineupPlayerName: {
    fontSize: 14,
    color: '#e2e8f0',
  },
  lineupPlayerHighlight: {
    color: '#06b6d4',
    fontWeight: '700',
  },
  youBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  youBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#06b6d4',
  },
  lineupNotes: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  playCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
    overflow: 'hidden',
  },
  playCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  playCardName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  playCategoryBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  playCategoryText: {
    fontSize: 11,
    color: '#94a3b8',
  },

  // RSVP Buttons
  pastEventNotice: {
    backgroundColor: '#374151',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  pastEventNoticeText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  rsvpButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  rsvpButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  rsvpGoing: {
    backgroundColor: '#8B5CF6',
  },
  rsvpGoingSelected: {
    backgroundColor: '#7C3AED',
  },
  rsvpNo: {
    backgroundColor: '#4C1D95',
  },
  rsvpNoSelected: {
    backgroundColor: '#5B21B6',
  },
  rsvpButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  // F1 kept only the shared disabled tone; the two stacked reminder buttons
  // and their styles are gone, replaced by `remindPrimary` / `remindOutline`.
  reminderButtonDisabled: {
    backgroundColor: '#475569',
  },

  // Attendance
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  playerAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  bottomPadding: {
    height: 40,
  },
});

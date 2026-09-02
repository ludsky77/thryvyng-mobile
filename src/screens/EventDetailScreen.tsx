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
import { getEventTypeConfig } from '../types';
import type { CalendarEvent } from '../types';
import { EditEventModal } from '../components/calendar/EditEventModal';
import { CantGoReasonModal } from '../components/calendar/CantGoReasonModal';
import { notifyTeamOfEvent } from '../services/eventNotifications';
import PlayerAvatar from '../components/PlayerAvatar';
import { GameEntryButton } from '../components/game-stats/GameEntryButton';
import { isEventPast } from '../utils/calendar';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

function formatTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h || '0', 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m || '00'} ${ampm}`;
}

function formatDateParts(dateStr: string): { day: string; date: string; month: string } {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return {
    day: days[d.getDay()],
    date: String(d.getDate()),
    month: months[d.getMonth()],
  };
}

function getEventTypeLabel(eventType: string): string {
  switch (eventType?.toLowerCase()) {
    case 'game': return 'GAME';
    case 'practice': return 'PRACTICE';
    case 'tournament': return 'TOURNAMENT';
    case 'meeting': return 'MEETING';
    case 'party': return 'PARTY';
    case 'scrimmage': return 'SCRIMMAGE';
    case 'tryout': return 'TRYOUT';
    case 'camp': return 'CAMP';
    case 'other_event': return 'OTHER';
    case 'club_event': return 'CLUB';
    default: return 'EVENT';
  }
}

/** Coach-marked attendance vocabulary. Never crosses into RSVP status. */
type CoachStatus = 'present' | 'absent' | 'late' | 'excused';
/** Resolved per-player status shown on the Details roster. */
type DisplayStatus = 'going' | 'cant' | 'late' | 'excused' | 'no_reply';
/** Who supplied the resolved status. */
type StatusSource = 'coach' | 'parent' | 'player' | null;

const COACH_TO_DISPLAY: Record<CoachStatus, DisplayStatus> = {
  present: 'going',
  absent: 'cant',
  late: 'late',
  excused: 'excused',
};

const STATUS_CHIP: Record<DisplayStatus, { label: string; color: string }> = {
  going: { label: 'Going', color: '#22c55e' },
  cant: { label: "Can't go", color: '#ef4444' },
  late: { label: 'Late', color: '#f59e0b' },
  excused: { label: 'Excused', color: '#6b7280' },
  no_reply: { label: 'No reply', color: '#64748b' },
};

/** Fallbacks for when the responder's profile is not readable under RLS. */
const SOURCE_LABEL: Record<Exclude<StatusSource, null>, string> = {
  coach: 'coach-marked',
  parent: 'by parent',
  player: 'by player',
};

/** "Paula Quintero" -> "Paula Q."  Single-word names pass through. */
function shortName(full: string | null | undefined): string | null {
  if (!full) return null;
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

/** "TUE" -> "Tue". formatDateParts returns upper case for the date block. */
function titleCase(s: string): string {
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}

/** "4:00 PM" + "5:30 PM" -> "4:00–5:30 PM"; keeps both when they differ. */
function timeRangeLabel(start: string | null, end: string | null): string {
  const a = formatTime(start);
  if (!a) return '';
  const b = formatTime(end);
  if (!b) return a;
  const ma = a.slice(-2);
  return ma === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** Small line under the name on the Attendance tab, before any coach mark. */
function rsvpHint(status: DisplayStatus, reason: string | null): string {
  if (status === 'going') return 'said going';
  if (status === 'cant') return reason ? `said can't — ${reason}` : "said can't";
  if (status === 'late') return 'marked late';
  if (status === 'excused') return 'marked excused';
  return 'no reply';
}

function firstName(full: string | null | undefined): string | null {
  if (!full) return null;
  const first = full.trim().split(/\s+/)[0];
  return first || null;
}

interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  photo_url?: string | null;
  jersey_number?: number | null;
  parent_email?: string | null;
  secondary_parent_email?: string | null;
}

interface AttendanceRow {
  id: string;
  player_id: string;
  status: CoachStatus;
  marked_by: string | null;
}

interface RosterEntry {
  player: RosterPlayer;
  status: DisplayStatus;
  source: StatusSource;
  /** Short name of whoever supplied the status, when their profile is readable. */
  sourceName: string | null;
  reason: string | null;
  hasCoachMark: boolean;
  /** Raw coach mark, so the ✓/✗ pair can show which one is active. */
  coachStatus: CoachStatus | null;
}

/** An RSVP we could not pin to exactly one player on this team. */
interface UnmappedRsvp {
  key: string;
  label: string;
  status: DisplayStatus;
  reason: string | null;
  ambiguous: boolean;
}

export default function EventDetailScreen({ route, navigation }: any) {
  const { event: eventParam, eventId, onRefetch } = route.params || {};
  const { user, currentRole } = useAuth();
  const [event, setEvent] = useState<CalendarEvent | null>(eventParam || null);
  const [loading, setLoading] = useState(!eventParam && !!eventId);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [cantGoModalVisible, setCantGoModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [eventRsvps, setEventRsvps] = useState<Array<{ player_id: string | null; user_id: string; status: string; decline_reason: string | null }>>([]);
  const [nonResponders, setNonResponders] = useState<string[]>([]);
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);
  const [isStaffInTeam, setIsStaffInTeam] = useState(false);
  const [remindingTeam, setRemindingTeam] = useState(false);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [playerRoleMap, setPlayerRoleMap] = useState<Map<string, string>>(new Map());
  const [responderEmails, setResponderEmails] = useState<
    Map<string, { email: string; name: string | null }>
  >(new Map());
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
        const { data: rsvpsData } = await supabase
          .from('cal_event_rsvps')
          .select('*')
          .eq('event_id', data.id);

        const rsvps = rsvpsData || [];
        setEventRsvps(rsvps);
        const rsvp_counts = {
          yes: rsvps.filter((r: any) => r.status === 'yes').length,
          no: rsvps.filter((r: any) => r.status === 'no').length,
          maybe: rsvps.filter((r: any) => r.status === 'maybe').length,
        };
        setEvent({ ...data, rsvp_counts } as CalendarEvent);
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

  // Lifted from the Attendance tab: the Details roster needs the same three
  // reads, so this now runs for both tabs off event id/team id.
  const fetchRoster = useCallback(async () => {
    if (!event?.id || !event?.team_id) return;

    try {
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select(
          'id, first_name, last_name, photo_url, jersey_number, parent_email, secondary_parent_email'
        )
        .eq('team_id', event.team_id)
        .order('last_name');

      if (playersError) throw playersError;
      const list = (playersData || []) as RosterPlayer[];
      setPlayers(list);

      const { data: attData, error: attError } = await supabase
        .from('event_attendance')
        .select('id, player_id, status, marked_by')
        .eq('event_id', event.id);

      if (attError && __DEV__) {
        console.warn('[EventDetail] attendance read failed:', attError);
      }
      const attRows = (attData || []) as AttendanceRow[];
      setAttendanceRows(attRows);

      // Player-role users are their own player: an exact user -> player identity
      // that beats any email guess.
      const playerIds = list.map((p) => p.id);
      const roleMap = new Map<string, string>();
      if (playerIds.length > 0) {
        const { data: roles, error: rolesError } = await supabase
          .from('user_roles')
          .select('user_id, entity_id')
          .eq('role', 'player')
          .in('entity_id', playerIds);
        if (rolesError && __DEV__) {
          console.warn('[EventDetail] player-role read failed:', rolesError);
        }
        (roles || []).forEach((r: any) => {
          if (r.user_id && r.entity_id) roleMap.set(r.user_id, r.entity_id);
        });
      }
      setPlayerRoleMap(roleMap);
    } catch (err) {
      console.error('[EventDetail] Error fetching roster:', err);
      setPlayers([]);
      setAttendanceRows([]);
    }
  }, [event?.id, event?.team_id]);

  // RSVP rows carry user_id but often no player_id. Emails are the only bridge
  // back to a player row, so resolve responder emails once per RSVP set.
  const fetchResponderEmails = useCallback(async () => {
    const ids = [
      ...new Set(
        [
          ...eventRsvps.map((r) => r.user_id),
          ...attendanceRows.map((a) => a.marked_by),
        ].filter(Boolean) as string[]
      ),
    ];
    if (ids.length === 0) {
      setResponderEmails(new Map());
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', ids);
    if (error) {
      // RLS may hide other members' profiles from a parent; those RSVPs then
      // render as un-mapped rows rather than being silently attached to a kid.
      if (__DEV__) {
        console.warn('[EventDetail] responder profiles read failed:', error);
      }
      setResponderEmails(new Map());
      return;
    }
    const map = new Map<string, { email: string; name: string | null }>();
    (data || []).forEach((p: any) => {
      map.set(p.id, {
        email: (p.email || '').toLowerCase(),
        name: p.full_name ?? null,
      });
    });
    setResponderEmails(map);
  }, [eventRsvps, attendanceRows]);

  const fetchNonResponders = useCallback(async () => {
    if (!event?.team_id || !event?.id) return;

    try {
      // Get team members: team_staff + parents of players (users who should RSVP)
      const { data: staffData } = await supabase
        .from('team_staff')
        .select('user_id')
        .eq('team_id', event.team_id);

      const { data: playersData } = await supabase
        .from('players')
        .select('id, parent_email, secondary_parent_email')
        .eq('team_id', event.team_id);

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
    // fetch: it carries no RSVP rows. The old code took this branch and never
    // called fetchEvent(), so eventRsvps stayed [] for the life of the screen
    // and every roster player resolved to "no reply" -- even rows whose
    // player_id pointed straight at them. Seed for an instant first paint,
    // then always fetch (silently, so nothing blanks).
    if (eventParam) {
      setEvent(eventParam);
      fetchEvent(true);
    } else {
      fetchEvent();
    }
  }, [eventParam, fetchEvent]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  useEffect(() => {
    fetchResponderEmails();
  }, [fetchResponderEmails]);

  useEffect(() => {
    if (event?.id && event?.team_id && isStaff) {
      fetchNonResponders();
    }
  }, [event?.id, event?.team_id, isStaff, fetchNonResponders]);

  const typeConfig = event ? getEventTypeConfig(event.event_type) : getEventTypeConfig('other_event');
  const dateParts = event ? formatDateParts(event.event_date) : { day: '', date: '', month: '' };

  /**
   * Resolve every RSVP to at most one player on this team.
   * Priority: explicit rsvp.player_id -> the responder IS the player (user_roles)
   * -> exactly one parent-email match. Two or more matches is ambiguous and is
   * deliberately NOT guessed: it surfaces as one un-mapped row instead.
   */
  const resolvedRsvps = useMemo(() => {
    const byPlayer = new Map<string, { rsvp: (typeof eventRsvps)[number]; source: StatusSource }>();
    const unmapped: UnmappedRsvp[] = [];

    for (const r of eventRsvps) {
      const selfPlayerId = playerRoleMap.get(r.user_id);

      if (r.player_id) {
        byPlayer.set(r.player_id, {
          rsvp: r,
          source: selfPlayerId === r.player_id ? 'player' : 'parent',
        });
        continue;
      }
      if (selfPlayerId) {
        byPlayer.set(selfPlayerId, { rsvp: r, source: 'player' });
        continue;
      }

      const profile = responderEmails.get(r.user_id);
      const email = profile?.email ?? '';
      const matches = email
        ? players.filter(
            (p) =>
              (p.parent_email || '').toLowerCase() === email ||
              (p.secondary_parent_email || '').toLowerCase() === email
          )
        : [];

      if (matches.length === 1) {
        byPlayer.set(matches[0].id, { rsvp: r, source: 'parent' });
      } else {
        unmapped.push({
          key: `${r.user_id}`,
          label: profile?.name || 'Team member',
          status: r.status === 'yes' ? 'going' : r.status === 'no' ? 'cant' : 'no_reply',
          reason: r.status === 'no' ? r.decline_reason : null,
          ambiguous: matches.length > 1,
        });
      }
    }
    return { byPlayer, unmapped };
  }, [eventRsvps, players, playerRoleMap, responderEmails]);

  /** Coach mark wins, then family RSVP, then no reply. */
  const roster = useMemo<RosterEntry[]>(() => {
    return players.map((player) => {
      const mark = attendanceRows.find((a) => a.player_id === player.id);
      if (mark) {
        return {
          player,
          status: COACH_TO_DISPLAY[mark.status] ?? 'no_reply',
          source: mark.marked_by ? 'coach' : null,
          sourceName: mark.marked_by
            ? firstName(responderEmails.get(mark.marked_by)?.name)
            : null,
          reason: null,
          hasCoachMark: true,
          coachStatus: mark.status,
        };
      }
      const hit = resolvedRsvps.byPlayer.get(player.id);
      if (hit) {
        const status: DisplayStatus =
          hit.rsvp.status === 'yes' ? 'going' : hit.rsvp.status === 'no' ? 'cant' : 'no_reply';
        return {
          player,
          status,
          source: hit.source,
          sourceName: shortName(responderEmails.get(hit.rsvp.user_id)?.name),
          reason: status === 'cant' ? hit.rsvp.decline_reason : null,
          hasCoachMark: false,
          coachStatus: null,
        };
      }
      return {
        player,
        status: 'no_reply',
        source: null,
        sourceName: null,
        reason: null,
        hasCoachMark: false,
        coachStatus: null,
      };
    });
  }, [players, attendanceRows, resolvedRsvps, responderEmails]);

  const headcounts = useMemo(() => {
    // going / cant come from stated family intent; headcount is the union of
    // family-going and coach-marked-present, deduped per player.
    const going = eventRsvps.filter((r) => r.status === 'yes').length;
    const cant = eventRsvps.filter((r) => r.status === 'no').length;
    const noReply = roster.filter((r) => r.status === 'no_reply').length;
    const headcount = roster.filter((r) => r.status === 'going').length;
    return { going, cant, noReply, headcount };
  }, [eventRsvps, roster]);

  const myRsvp = useMemo(
    () => eventRsvps.find((r) => r.user_id === user?.id) ?? null,
    [eventRsvps, user?.id]
  );

  /** The one player this user speaks for, or null when staff / ambiguous. */
  const myPlayerId = useMemo(() => {
    if (!user?.id) return null;
    const self = playerRoleMap.get(user.id);
    if (self) return self;
    const email = (user.email || '').toLowerCase();
    if (!email) return null;
    const matches = players.filter(
      (p) =>
        (p.parent_email || '').toLowerCase() === email ||
        (p.secondary_parent_email || '').toLowerCase() === email
    );
    return matches.length === 1 ? matches[0].id : null;
  }, [user?.id, user?.email, players, playerRoleMap]);

  const handleRsvp = async (
    status: 'yes' | 'no' | 'pending',
    declineReason?: string | null
  ) => {
    if (!user || !event) return;
    setRsvpLoading(true);

    try {
      const payload: Record<string, unknown> = {
        status,
        responded_at: new Date().toISOString(),
        // Cleared on yes/pending so an undone "can't go" leaves no stale reason.
        decline_reason: status === 'no' ? declineReason ?? null : null,
      };
      // Only when this user speaks for exactly one player on this team.
      if (myPlayerId) payload.player_id = myPlayerId;

      // limit(1) rather than maybeSingle(): a duplicate row must not error the
      // whole response out.
      const { data: existingRows, error: lookupError } = await supabase
        .from('cal_event_rsvps')
        .select('id')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .limit(1);

      if (lookupError) {
        if (__DEV__) console.warn('[EventDetail] rsvp lookup failed:', lookupError);
        Alert.alert('Error', 'Failed to save response. Please try again.');
        return;
      }

      const existing = existingRows?.[0];

      if (existing) {
        const { data, error } = await supabase
          .from('cal_event_rsvps')
          .update(payload)
          .eq('id', existing.id)
          .select('id');
        // RLS filters a denied write out silently: no error, no rows.
        if (error || !data || data.length === 0) {
          if (__DEV__) console.warn('[EventDetail] rsvp update failed:', error);
          Alert.alert('Error', 'Failed to save response. Please try again.');
          return;
        }
      } else {
        const { data, error } = await supabase
          .from('cal_event_rsvps')
          .insert({
            event_id: event.id,
            user_id: user.id,
            ...payload,
          })
          .select('id');
        if (error || !data || data.length === 0) {
          if (__DEV__) console.warn('[EventDetail] rsvp insert failed:', error);
          Alert.alert('Error', 'Failed to save response. Please try again.');
          return;
        }
      }

      setCantGoModalVisible(false);

      // Apply my row locally so the memos recompute instantly. The refetch
      // below is a background reconcile -- it must not blank the roster.
      setEventRsvps((prev) => {
        const mine = {
          player_id: (myPlayerId ?? null) as string | null,
          user_id: user.id,
          status,
          decline_reason: status === 'no' ? declineReason ?? null : null,
        };
        const idx = prev.findIndex((r) => r.user_id === user.id);
        if (idx === -1) return [...prev, mine];
        const next = [...prev];
        next[idx] = { ...next[idx], ...mine };
        return next;
      });

      fetchEvent(true);
      fetchNonResponders();
      onRefetch?.();
    } catch (err) {
      console.error('[EventDetail] RSVP error:', err);
      Alert.alert('Error', 'Failed to save response. Please try again.');
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleCantGoSkip = () => handleRsvp('no', null);
  const handleCantGoSubmit = (reason: string) => handleRsvp('no', reason.trim() || null);

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

              // Notify team of cancellation
              notifyTeamOfEvent({
                eventId: event.id,
                action: 'cancelled',
              });
              console.log('[Cancel] Event cancelled:', event.id);
              fetchEvent();
              onRefetch?.();
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
   * Coach headcount tool. Writes ONLY to event_attendance -- never to
   * cal_event_rsvps, whose vocabulary (yes/no/maybe/pending) is the family's.
   */
  const markAttendance = async (playerId: string, status: CoachStatus) => {
    if (!event || !user?.id || !isStaff) return;

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
      fetchRoster();
    } finally {
      setMarkingPlayerId(null);
    }
  };

  const unmarkAttendance = async (playerId: string) => {
    if (!event || !isStaff) return;

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
      fetchRoster();
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

      {isStaff && (
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
      )}

      {isStaff && activeTab === 'attendance' ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.attContext}>
            {`${titleCase(dateParts.day)}, ${titleCase(dateParts.month)} ${dateParts.date}`}
            {` · ${typeConfig.label}`}
            {event.is_all_day
              ? ' · All Day'
              : event.start_time
                ? ` · ${timeRangeLabel(event.start_time, event.end_time)}`
                : ''}
          </Text>
          <Text style={styles.attHeading}>Mark who showed up</Text>
          {roster.length === 0 ? (
            <Text style={styles.rosterEmptyText}>No players on this team</Text>
          ) : (
            roster.map((entry) => {
              const busy = markingPlayerId === entry.player.id;
              const chip = STATUS_CHIP[entry.status];
              return (
                <View key={entry.player.id} style={styles.attRow}>
                  <PlayerAvatar
                    photoUrl={entry.player.photo_url}
                    jerseyNumber={entry.player.jersey_number}
                    firstName={entry.player.first_name}
                    lastName={entry.player.last_name}
                    size={40}
                    teamColor={(event as any).team?.color || '#5B7BB5'}
                  />
                  <View style={styles.attInfo}>
                    <Text style={styles.attName} numberOfLines={1}>
                      {entry.player.first_name} {entry.player.last_name}
                    </Text>
                    {entry.hasCoachMark ? (
                      // A coach mark replaces the hint with what was recorded --
                      // legacy late/excused rows still render here.
                      <Text style={[styles.attHint, { color: chip.color }]}>
                        {chip.label}
                        {entry.sourceName ? ` · by Coach ${entry.sourceName}` : ''}
                      </Text>
                    ) : (
                      <Text style={styles.attHint}>
                        {rsvpHint(entry.status, entry.reason)}
                      </Text>
                    )}
                  </View>

                  {busy ? (
                    <View style={styles.attControls}>
                      <ActivityIndicator size="small" color="#8b5cf6" />
                    </View>
                  ) : (
                    <View style={styles.attControls}>
                      <TouchableOpacity
                        style={[
                          styles.attAbsentBtn,
                          entry.coachStatus === 'absent' && styles.attAbsentBtnActive,
                        ]}
                        // Tapping the active mark clears it.
                        onPress={() =>
                          entry.coachStatus === 'absent'
                            ? unmarkAttendance(entry.player.id)
                            : markAttendance(entry.player.id, 'absent')
                        }
                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                      >
                        <Text
                          style={[
                            styles.attBtnText,
                            entry.coachStatus === 'absent' && styles.attBtnTextActive,
                          ]}
                        >
                          ✗
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.attPresentBtn,
                          entry.coachStatus === 'present' && styles.attPresentBtnActive,
                        ]}
                        onPress={() =>
                          entry.coachStatus === 'present'
                            ? unmarkAttendance(entry.player.id)
                            : markAttendance(entry.player.id, 'present')
                        }
                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                      >
                        <Text
                          style={[
                            styles.attPresentText,
                            entry.coachStatus === 'present' && styles.attBtnTextActive,
                          ]}
                        >
                          ✓
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
          <View style={styles.bottomPadding} />
        </ScrollView>
      ) : (
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Main Event Card */}
          <View style={[
            styles.eventCard,
            event.is_cancelled && styles.mainCardCancelled
          ]}>
            {/* Left section: Team color background */}
            <View
              style={[
                styles.dateSection,
                { backgroundColor: (event as any).team?.color || '#5B7BB5' },
              ]}
            >
              <Text style={styles.eventTypeLabel}>
                {getEventTypeLabel(event.event_type)}
              </Text>
              <Text style={styles.dayName}>{dateParts.day}</Text>
              <Text style={styles.dateNumber}>{dateParts.date}</Text>
              <Text style={styles.monthName}>{dateParts.month}</Text>
            </View>

            {/* Right section: Event details */}
            <View style={styles.eventDetails}>
              {/* Title Row with Edit */}
              <View style={styles.titleRow}>
                <View style={styles.titleAndTeam}>
                  <Text 
                    style={[
                      styles.eventTitle,
                      event.is_cancelled && styles.eventTitleCancelled
                    ]} 
                    numberOfLines={2}
                  >
                    {event.title}
                  </Text>
                  {(event as any).team?.name && (
                    <View style={styles.teamNameRow}>
                      <View style={[styles.teamDot, { backgroundColor: (event as any).team?.color || '#5B7BB5' }]} />
                      <Text style={styles.teamNameText}>{(event as any).team.name}</Text>
                    </View>
                  )}
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
                <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '33' }]}>
                  <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
                    {typeConfig.icon} {typeConfig.label.toUpperCase()}
                  </Text>
                </View>
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

              {/* Location */}
              {(event.location_name || event.location_address) && (
                <TouchableOpacity style={styles.infoRow} onPress={handleOpenMaps}>
                  <Ionicons name="location-outline" size={18} color="#8b5cf6" />
                  <View style={styles.infoContent}>
                    {event.location_name && (
                      <Text style={styles.infoTitle}>{event.location_name}</Text>
                    )}
                    {event.location_address && (
                      <Text style={styles.infoSubtitle}>{event.location_address}</Text>
                    )}
                    <Text style={styles.tapHint}>Tap to open in Maps</Text>
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
          </View>

          {/* Will you be there? -- same control and state as the season list. */}
          {!isEventPast(event) && (
            <View style={styles.willCard}>
              <View style={styles.willRow}>
                <Text style={styles.willLabel}>
                  {myRsvp?.status === 'yes'
                    ? "✓ You're going"
                    : myRsvp?.status === 'no'
                      ? '✗ Not going'
                      : 'Will you be there?'}
                </Text>
                <View style={styles.willButtons}>
                  <TouchableOpacity
                    style={[
                      styles.willBtn,
                      myRsvp?.status === 'no' && styles.willBtnNoActive,
                    ]}
                    onPress={() => setCantGoModalVisible(true)}
                    disabled={rsvpLoading}
                  >
                    <Text
                      style={[
                        styles.willBtnText,
                        myRsvp?.status === 'no' && styles.willBtnTextActive,
                      ]}
                    >
                      ✗
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.willBtn,
                      myRsvp?.status === 'yes' && styles.willBtnYesActive,
                    ]}
                    // Tapping an active "going" undoes it back to pending.
                    onPress={() =>
                      myRsvp?.status === 'yes' ? handleRsvp('pending') : handleRsvp('yes')
                    }
                    disabled={rsvpLoading}
                  >
                    <Text
                      style={[
                        styles.willBtnText,
                        myRsvp?.status === 'yes' && styles.willBtnTextActive,
                      ]}
                    >
                      ✓
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {myRsvp?.status === 'no' && myRsvp.decline_reason ? (
                <Text style={styles.myReasonText}>“{myRsvp.decline_reason}”</Text>
              ) : null}
            </View>
          )}

          {/* Responses Card */}
          <View style={styles.responsesCard}>
            <Text style={styles.responsesTitle}>📊 Responses</Text>
            <View style={styles.responsesRow}>
              <View style={styles.responseItem}>
                <Text style={styles.responseCount}>{headcounts.going}</Text>
                <Text style={styles.responseLabel}>Going</Text>
              </View>
              <View style={styles.responseItem}>
                <Text style={styles.responseCount}>{headcounts.cant}</Text>
                <Text style={styles.responseLabel}>Can't</Text>
              </View>
              <View style={styles.responseItem}>
                <Text style={styles.responseCount}>{headcounts.noReply}</Text>
                <Text style={styles.responseLabel}>No reply</Text>
              </View>
              <View style={[styles.responseItem, styles.headcountItem]}>
                <Text style={[styles.responseCount, styles.headcountCount]}>
                  {headcounts.headcount}
                </Text>
                <Text style={styles.responseLabel}>Headcount</Text>
              </View>
            </View>

            {roster.length === 0 ? (
              <Text style={styles.rosterEmptyText}>No players on this team</Text>
            ) : (
              roster.map((entry) => {
                const chip = STATUS_CHIP[entry.status];
                return (
                  <View key={entry.player.id} style={styles.rosterRow}>
                    <View style={styles.rosterInfo}>
                      <Text style={styles.rosterName} numberOfLines={1}>
                        {entry.player.first_name} {entry.player.last_name}
                      </Text>
                      {entry.reason ? (
                        <Text style={styles.rosterReason} numberOfLines={2}>
                          “{entry.reason}”
                        </Text>
                      ) : null}
                      {entry.source ? (
                        <Text style={styles.rosterSource}>
                          {entry.sourceName
                            ? entry.source === 'coach'
                              ? `by Coach ${entry.sourceName}`
                              : `by ${entry.sourceName}`
                            : SOURCE_LABEL[entry.source]}
                        </Text>
                      ) : null}
                    </View>

                    <View
                      style={[
                        styles.statusChip,
                        { borderColor: chip.color, backgroundColor: chip.color + '22' },
                      ]}
                    >
                      <Text style={[styles.statusChipText, { color: chip.color }]}>
                        {chip.label}
                      </Text>
                    </View>

                  </View>
                );
              })
            )}

            {resolvedRsvps.unmapped.map((u) => {
              const chip = STATUS_CHIP[u.status];
              return (
                <View key={u.key} style={styles.rosterRow}>
                  <View style={styles.rosterInfo}>
                    <Text style={styles.rosterName} numberOfLines={1}>
                      {u.label}
                    </Text>
                    {u.reason ? (
                      <Text style={styles.rosterReason} numberOfLines={2}>
                        “{u.reason}”
                      </Text>
                    ) : null}
                    <Text style={styles.rosterSource}>
                      {u.ambiguous ? 'multiple players — not matched' : 'not matched to a player'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusChip,
                      { borderColor: chip.color, backgroundColor: chip.color + '22' },
                    ]}
                  >
                    <Text style={[styles.statusChipText, { color: chip.color }]}>
                      {chip.label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Game entry - for game events */}
          {event.event_type === 'game' && event.team_id && (
            <View style={{ marginBottom: 16 }}>
              <GameEntryButton
                eventId={event.id}
                teamId={event.team_id}
                eventType={event.event_type}
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

          {/* RSVP Buttons - hidden for past events */}
          {isEventPast(event) ? (
            <View style={styles.pastEventNotice}>
              <Text style={styles.pastEventNoticeText}>This event has passed</Text>
            </View>
          ) : (
            <>
              <CantGoReasonModal
                visible={cantGoModalVisible}
                onClose={() => setCantGoModalVisible(false)}
                onSkip={handleCantGoSkip}
                onSubmit={handleCantGoSubmit}
                submitting={rsvpLoading}
              />

              {isStaff && (
                <TouchableOpacity
                  style={[
                    styles.reminderButton,
                    (nonResponders.length === 0 || reminderSent) && styles.reminderButtonDisabled,
                  ]}
                  onPress={handleSendReminder}
                  disabled={nonResponders.length === 0 || reminderSending || reminderSent}
                >
                  {reminderSending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather
                        name={reminderSent ? 'check' : 'bell'}
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.reminderButtonText}>
                        {reminderSent
                          ? 'Reminder Sent'
                          : nonResponders.length === 0
                            ? 'All Responded'
                            : `Remind ${nonResponders.length} to RSVP`}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {isStaff && (
                <TouchableOpacity
                  style={[
                    styles.remindTeamButton,
                    remindingTeam && styles.reminderButtonDisabled,
                  ]}
                  onPress={handleRemindTeam}
                  disabled={remindingTeam}
                >
                  {remindingTeam ? (
                    <ActivityIndicator size="small" color="#8b5cf6" />
                  ) : (
                    <>
                      <Feather name="bell" size={18} color="#8b5cf6" />
                      <Text style={styles.remindTeamButtonText}>Remind Team</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}

        <View style={styles.bottomPadding} />
      </ScrollView>
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
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 16,
  },
  mainCardCancelled: {
    opacity: 0.6,
  },
  dateSection: {
    width: 80,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  eventTypeLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dayName: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  dateNumber: {
    color: 'white',
    fontSize: 36,
    fontWeight: 'bold',
    marginVertical: 2,
  },
  monthName: {
    color: 'white',
    fontSize: 12,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  eventDetails: {
    flex: 1,
    padding: 16,
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
  teamNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  teamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  teamNameText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  eventTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
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
    marginBottom: 16,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
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
    marginBottom: 12,
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
  rosterEmptyText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
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
  willCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  willRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  willLabel: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  willButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  willBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  willBtnYesActive: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  willBtnNoActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  willBtnText: {
    color: '#94a3b8',
    fontSize: 17,
    fontWeight: '700',
  },
  willBtnTextActive: {
    color: '#fff',
  },
  attContext: {
    color: '#64748b',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
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
  responsesCard: {
    backgroundColor: '#1e293b',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
  },
  responsesTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  responsesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  responseItem: {
    alignItems: 'center',
  },
  responseCount: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  responseLabel: {
    color: '#E9D5FF',
    fontSize: 13,
    marginTop: 4,
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

  remindTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#8b5cf6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 10,
    marginHorizontal: 16,
    gap: 8,
  },
  remindTeamButtonText: {
    color: '#8b5cf6',
    fontSize: 15,
    fontWeight: '600',
  },
  reminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    marginHorizontal: 16,
    gap: 8,
  },
  reminderButtonDisabled: {
    backgroundColor: '#475569',
  },
  reminderButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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

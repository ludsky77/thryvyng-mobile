import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import {
  addMonths,
  subMonths,
  format,
  parseISO,
  isToday,
  isTomorrow,
  isThisWeek,
} from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useUserTeams, UserTeam } from '../hooks/useUserTeams';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { upsertRsvp } from '../utils/rsvp';
import { MonthView } from '../components/calendar/MonthView';
import { WeekView } from '../components/calendar/WeekView';
import { DayView } from '../components/calendar/DayView';
import TeamLegend from '../components/calendar/TeamLegend';
import { CreateEventModal } from '../components/calendar/CreateEventModal';
import { EventTypeSheet } from '../components/calendar/EventTypeSheet';
import { CantGoReasonModal } from '../components/calendar/CantGoReasonModal';
import { supabase } from '../lib/supabase';
import { EVENT_ACCENT_PAST } from '../lib/eventColors';
import EventTypeChip, {
  eventTitleBits,
  VsOpponent,
} from '../components/calendar/EventTypeChip';
import { resolveTeamColor } from '../constants/teamColors';
import type { CalendarEvent, EventType } from '../types';
import { NotificationBell } from '../components/NotificationBell';
import CalendarSyncModal from '../components/calendar/CalendarSyncModal';
import DateBadge, { accentAlpha } from '../components/calendar/DateBadge';
import RsvpPill from '../components/calendar/RsvpPill';
import { isEventPast } from '../utils/calendar';
import { openInMaps } from '../lib/maps';
import { Ionicons } from '@expo/vector-icons';

type ViewMode = 'list' | 'month' | 'week' | 'day';

/** Ruling R-E: List · Day · Week · Month -- narrowest span first. */
const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const ALL_TEAMS_ID = 'ALL_TEAMS';


function formatEventTimeRange(event: { start_time?: string | null; end_time?: string | null; is_all_day?: boolean }): string {
  if (event.is_all_day) return 'All Day';
  if (!event.start_time) return 'All Day';
  const start = format(parseISO(`2000-01-01T${event.start_time}`), 'h:mm a');
  if (event.end_time) {
    const end = format(parseISO(`2000-01-01T${event.end_time}`), 'h:mm a');
    return `${start} – ${end}`;
  }
  return start;
}

export default function CalendarScreen({ route, navigation }: any) {
  const { user } = useAuth();
  const {
    teams,
    pastTeams,
    loading: teamsLoading,
    getTeamsByAccess,
    refetch: refetchTeams,
  } = useUserTeams();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamPickerVisible, setTeamPickerVisible] = useState(false);
  const [pastTeamsExpanded, setPastTeamsExpanded] = useState(false);
  const teamsSelectionInitialized = useRef(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [typeSheetVisible, setTypeSheetVisible] = useState(false);
  const [createEventType, setCreateEventType] = useState<EventType | null>(null);
  const [cantGoEventId, setCantGoEventId] = useState<string | null>(null);
  const [showPreviousEvents, setShowPreviousEvents] = useState(false);
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  // team_id -> the single player this user speaks for on that team.
  const [myPlayerByTeam, setMyPlayerByTeam] = useState<Map<string, string>>(new Map());
  const [events, setEvents] = useState<
    (CalendarEvent & { team?: UserTeam; rsvp_counts?: any; user_rsvp?: any })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);

  const startDate = subMonths(new Date(), 1).toISOString().split('T')[0];
  const endDate = addMonths(new Date(), 6).toISOString().split('T')[0];

  // Create-only hook: this screen does its own fetch below, and the hook's
  // duplicate fetch/realtime/updateRsvp went with the one-writer cleanup.
  //
  // No team argument: the create form owns the team choice and sends team_id
  // in the payload, so there is no setCreateForTeamId -> re-render round trip
  // between picking a team and submitting.
  const {
    createEvent,
    createRecurringEvents,
  } = useCalendarEvents();

  /** The only list the + may create for. Same condition as the RLS policy. */
  const staffTeams = useMemo(
    () => getTeamsByAccess().staffTeams,
    [getTeamsByAccess]
  );

  const allTeams = useMemo(() => [...teams, ...pastTeams], [teams, pastTeams]);

  useEffect(() => {
    if (teamsLoading) return;
    if (teams.length === 0 && pastTeams.length === 0) return;

    if (!selectedTeamId) {
      // Two or more teams -> open on All Teams, not on whichever team the role
      // switcher or an unordered team_staff read happened to put first. One
      // team -> that team, so its name is actually on screen (the All Teams
      // header is generic and TeamLegend is gated on teams.length >= 2).
      setSelectedTeamId(
        teams.length >= 2
          ? ALL_TEAMS_ID
          : teams[0]?.id ?? pastTeams[0]?.id ?? ALL_TEAMS_ID
      );
      return;
    }

    if (!teamsSelectionInitialized.current) {
      teamsSelectionInitialized.current = true;
      const inActive =
        selectedTeamId === ALL_TEAMS_ID ||
        teams.some((t) => t.id === selectedTeamId);
      const isPastTeam = pastTeams.some((t) => t.id === selectedTeamId);
      if (!inActive || isPastTeam) {
        if (teams.length > 0) {
          setSelectedTeamId(teams[0]?.id ?? ALL_TEAMS_ID);
        }
      }
    }
  }, [teamsLoading, teams, pastTeams, selectedTeamId]);

  const fetchEvents = useCallback(async () => {
    if (teamsLoading || (teams.length === 0 && pastTeams.length === 0)) return;

    setLoading(true);
    try {
      let teamIds: string[] = [];

      if (selectedTeamId === ALL_TEAMS_ID) {
        teamIds = teams.map((t) => t.id);
      } else if (selectedTeamId) {
        teamIds = [selectedTeamId];
      }

      if (teamIds.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      const { data: eventsData, error } = await supabase
        .from('cal_events')
        .select('*')
        .in('team_id', teamIds)
        .gte('event_date', startDate)
        .lte('event_date', endDate)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;

      const eventIds = (eventsData || []).map((e: CalendarEvent) => e.id);
      const rsvpsByEvent: Record<string, any[]> = {};

      // ONE aggregate read for every visible card -- counts AND my own row come
      // out of the same result set, reduced client-side. Never per-card.
      if (eventIds.length > 0) {
        const { data: rsvpsData, error: rsvpsError } = await supabase
          .from('cal_event_rsvps')
          .select('event_id, status, user_id, decline_reason')
          .in('event_id', eventIds);

        if (rsvpsError) {
          if (__DEV__) console.warn('[Calendar] rsvp counts read failed:', rsvpsError);
          Alert.alert('Error', 'Could not load RSVP counts');
        }

        (rsvpsData || []).forEach((r: any) => {
          if (!rsvpsByEvent[r.event_id]) rsvpsByEvent[r.event_id] = [];
          rsvpsByEvent[r.event_id].push(r);
        });
      }

      // ONE read for the whole visible range: which players on these teams this
      // user speaks for. Exactly one on a team => that team's events carry
      // player_id on my RSVP; zero or several => null, same as staff.
      const kidsByTeam = new Map<string, string[]>();
      const email = (user?.email || '').toLowerCase();
      if (email) {
        const { data: kids, error: kidsError } = await supabase
          .from('players')
          .select('id, team_id')
          .in('team_id', teamIds)
          .or(`parent_email.eq.${email},secondary_parent_email.eq.${email}`);
        if (kidsError && __DEV__) {
          console.warn('[Calendar] my-players read failed:', kidsError);
        }
        (kids || []).forEach((k: any) => {
          if (!k.team_id) return;
          kidsByTeam.set(k.team_id, [...(kidsByTeam.get(k.team_id) || []), k.id]);
        });
      }
      setMyPlayerByTeam(
        new Map(
          [...kidsByTeam.entries()]
            .filter(([, ids]) => ids.length === 1)
            .map(([teamId, ids]) => [teamId, ids[0]])
        )
      );

      const enrichedEvents = (eventsData || []).map((event: any) => {
        const team = allTeams.find((t) => t.id === event.team_id);
        const rsvps = rsvpsByEvent[event.id] || [];
        // Card counts stay a straight row tally of the family's answers --
        // the cards carry no coach marks to merge. The event-detail strip is
        // the resolved view; this is the at-a-glance one.
        const rsvp_counts = {
          yes: rsvps.filter((r) => r.status === 'yes').length,
          no: rsvps.filter((r) => r.status === 'no').length,
          pending: rsvps.filter((r) => r.status === 'pending').length,
        };
        const user_rsvp = rsvps.find((r) => r.user_id === user?.id) || null;

        return {
          ...event,
          team,
          rsvp_counts,
          user_rsvp,
        };
      });

      setEvents(enrichedEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedTeamId, teams, pastTeams, allTeams, teamsLoading, startDate, endDate, user?.id]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useFocusEffect(
    useCallback(() => {
      refetchTeams();
      fetchEvents();
    }, []) // Empty deps - run only on focus; avoids loop when refetch updates teams/fetchEvents
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  // The ONE cal_event_rsvps write path on this screen. Never touches
  // event_attendance -- coach marks are the Attendance tab's business.
  const handleRsvp = async (
    eventId: string,
    status: 'yes' | 'no' | 'pending',
    declineReason?: string | null
  ) => {
    if (!user) return;

    setRsvpSubmitting(true);
    try {
      const target = events.find((e) => e.id === eventId);
      const myPlayerId = target?.team_id
        ? myPlayerByTeam.get(target.team_id) ?? null
        : null;

      // Same single writer EventDetailScreen uses (src/utils/rsvp.ts): one
      // upsert against UNIQUE (event_id, user_id, player_id), replacing the
      // select-then-update-or-insert dance this screen used to duplicate.
      // ok:false also covers a silent RLS refusal.
      const { ok, error } = await upsertRsvp({
        eventId,
        userId: user.id,
        playerId: myPlayerId,
        status,
        declineReason,
      });

      if (!ok) {
        if (__DEV__) console.warn('[Calendar] rsvp upsert failed:', error);
        Alert.alert('Error', 'Could not save your response');
        return;
      }

      // Apply locally so the strip flips instantly and the list never blanks.
      setEvents((prev) =>
        prev.map((e) => {
          if (e.id !== eventId) return e;
          const wasYes = e.user_rsvp?.status === 'yes';
          const wasNo = e.user_rsvp?.status === 'no';
          const counts = { ...(e.rsvp_counts || { yes: 0, no: 0, pending: 0 }) };
          if (wasYes) counts.yes = Math.max(0, (counts.yes || 0) - 1);
          if (wasNo) counts.no = Math.max(0, (counts.no || 0) - 1);
          if (status === 'yes') counts.yes = (counts.yes || 0) + 1;
          if (status === 'no') counts.no = (counts.no || 0) + 1;
          return {
            ...e,
            rsvp_counts: counts,
            user_rsvp: {
              ...(e.user_rsvp || {}),
              user_id: user.id,
              status,
              decline_reason: status === 'no' ? declineReason ?? null : null,
            },
          };
        })
      );
    } finally {
      setRsvpSubmitting(false);
    }
  };

  const handleCantGoSkip = () => {
    const id = cantGoEventId;
    setCantGoEventId(null);
    if (id) handleRsvp(id, 'no', null);
  };

  const handleCantGoSubmit = (reason: string) => {
    const id = cantGoEventId;
    setCantGoEventId(null);
    if (id) handleRsvp(id, 'no', reason.trim() || null);
  };

  const groupedEvents = useMemo(() => {
    const previous: typeof events = [];
    const today: typeof events = [];
    const tomorrow: typeof events = [];
    const thisWeek: typeof events = [];
    const upcoming: typeof events = [];

    events.forEach((event) => {
      const eventDate = parseISO(event.event_date);
      if (isEventPast(event)) {
        previous.push(event);
      } else if (isToday(eventDate)) {
        today.push(event);
      } else if (isTomorrow(eventDate)) {
        tomorrow.push(event);
      } else if (isThisWeek(eventDate)) {
        thisWeek.push(event);
      } else {
        upcoming.push(event);
      }
    });

    const sections: { title: string; data: typeof events }[] = [];
    if (today.length > 0) sections.push({ title: 'Today', data: today });
    if (tomorrow.length > 0) sections.push({ title: 'Tomorrow', data: tomorrow });
    if (thisWeek.length > 0)
      sections.push({ title: 'This Week', data: thisWeek });
    if (upcoming.length > 0) sections.push({ title: 'Upcoming', data: upcoming });
    if (previous.length > 0) {
      previous.sort(
        (a, b) =>
          new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
      );
      sections.push({ title: 'Previous', data: previous });
    }
    return sections;
  }, [events]);

  const selectedTeam =
    selectedTeamId === ALL_TEAMS_ID
      ? null
      : allTeams.find((t) => t.id === selectedTeamId);

  const isPastTeamSelected =
    !!selectedTeamId &&
    selectedTeamId !== ALL_TEAMS_ID &&
    pastTeams.some((t) => t.id === selectedTeamId);

  const selectedTeamName =
    selectedTeamId === ALL_TEAMS_ID
      ? 'All Teams'
      : selectedTeam?.name || 'Select Team';

  // Staff on at least one active team is the whole gate -- All Teams included.
  // The form asks which team, and RLS refuses anything staffTeams would not
  // have offered, so hiding the + in All Teams only hid the feature.
  const canCreate = staffTeams.length > 0;

  /**
   * Pre-fill the form's Team field only when the calendar is already showing
   * ONE team this user is staff on. All Teams, a parent-access team and an
   * archived team all leave it blank rather than pre-filling something the
   * form would then have to refuse.
   */
  const createInitialTeamId =
    selectedTeamId && staffTeams.some((t) => t.id === selectedTeamId)
      ? selectedTeamId
      : null;

  // + opens the type sheet; the form opens once a type is chosen.
  const handleCreatePress = () => setTypeSheetVisible(true);

  const handleEventTypeChosen = (eventType: EventType) => {
    setTypeSheetVisible(false);
    setCreateEventType(eventType);
    setCreateModalVisible(true);
  };

  const handleCreateSuccess = () => {
    fetchEvents();
    setCreateModalVisible(false);
    setCreateEventType(null);
  };

  // First load only. useFocusEffect refetches teams on every focus; blanking a
  // calendar we can already draw is what made the tab flash a spinner each time.
  const hasAnyTeam = teams.length > 0 || pastTeams.length > 0;
  if (teamsLoading && !hasAnyTeam) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading teams...</Text>
      </View>
    );
  }

  if (teams.length === 0 && pastTeams.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📅</Text>
        <Text style={styles.emptyTitle}>No Teams</Text>
        <Text style={styles.emptyText}>
          Join a team or add a player to see the calendar
        </Text>
      </View>
    );
  }

  /**
   * Design "H1 - footer pill" (Lu, Oct 26): ONE list-card renderer for both
   * groups, so the Previous group and the main group can no longer drift. The
   * old pair had diverged -- only the main copy showed the arrive time, the
   * type chip and the "?" count, and only the Previous copy still carried a
   * round ✓/✗ pair that its own `eventPast` branch made unreachable.
   *
   * Layout: a header row (leaf badge + team line / title / meta / location)
   * that is the card's tap target, then a hairline, then a footer row with the
   * counts and the RSVP pill INSIDE the same frame. The footer sits outside
   * the header's TouchableOpacity, so tapping the pill answers instead of
   * opening the event -- exactly what the removed `willStrip` did below the
   * card.
   *
   * Ruling R-A moved the CARD's colour from the event type to the TEAM: the
   * leaf, the 5pt strip and the 2pt frame are the team's assigned colour, so
   * two events of different types on one team match, and the same game on two
   * teams does not. The type is not a hue at all -- it is the grey
   * EventTypeChip. A past event still greys out (EVENT_ACCENT_PAST), the one
   * state that outranks identity.
   *
   * Ruling R-H set the hierarchy (device pass, Oct 26): the TEAM NAME is the
   * headline -- the largest text on the card, up to two lines, and no longer
   * hidden outside All Teams, because a card has to say whose team it is even
   * when the calendar is filtered to one. Under it, the chip and a title that
   * is only shown when it says something the chip does not: "Practice" on a
   * practice is dropped. A CANCELLED event keeps its title either way -- the
   * strike-through on it is the card's only cancellation cue.
   *
   * Also used BY THE DAY VIEW (R-D), passed in as renderEventCard.
   */
  const renderEventListCard = (
    event: CalendarEvent & { team?: UserTeam; rsvp_counts?: any; user_rsvp?: any }
  ) => {
    const eventDate = parseISO(event.event_date + 'T12:00:00');
    const eventPast = isEventPast(event);
    const teamColor = resolveTeamColor(event.team);
    const frameColor = eventPast ? EVENT_ACCENT_PAST : teamColor;
    // R-H/R-K: what the line under the headline carries -- "vs Rapids", a
    // title, or neither. One helper, shared with the pills and the detail
    // header, so the three cannot disagree about a game's name.
    const { opponent, title } = eventTitleBits(event);
    // R-L: its own line, spelled out, never squeezed onto the time row.
    const arrive =
      !event.is_all_day && event.arrival_time
        ? format(parseISO(`2000-01-01T${event.arrival_time}`), 'h:mm a')
        : null;

    return (
      <View
        key={event.id}
        style={[
          styles.eventCard,
          {
            // F1 frame, kept: 2pt in the TEAM's colour at 50% plus a 5pt
            // solid left strip in the same colour. All four corners now use
            // the card radius -- the 8pt left corners were left over from the
            // clipped full-height date block and no longer had a reason.
            borderColor: accentAlpha(frameColor, 0.5),
            borderLeftColor: frameColor,
          },
          event.is_cancelled && styles.eventCardCancelled,
          eventPast && styles.eventCardPast,
        ]}
      >
        <TouchableOpacity
          style={styles.cardHeaderRow}
          activeOpacity={0.8}
          onPress={() =>
            navigation.navigate('EventDetail', { event, onRefetch: fetchEvents })
          }
        >
          <DateBadge date={eventDate} variant="list" color={frameColor} />

          <View style={styles.eventDetails}>
            {/* R-H headline: the team, big, two lines, never cut short. The
                dot sits on the first line (centring it lands it between the
                two lines of a name that wraps). */}
            {event.team ? (
              <View style={styles.eventTeamBadge}>
                <View
                  style={[styles.teamDot, { backgroundColor: teamColor }]}
                />
                <Text style={styles.eventTeamName} numberOfLines={2}>
                  {event.team.name}
                </Text>
              </View>
            ) : null}

            {/* R-H: grey chip, then what the event is -- "vs Rapids" (R-K)
                and/or a title, each only when it adds something. The chip
                holds its width; the title is what ellipsizes. */}
            <View style={styles.cardMetaRow}>
              <EventTypeChip eventType={event.event_type} />
              {opponent ? <VsOpponent name={opponent} /> : null}
              {title ? (
                <Text
                  style={[
                    styles.eventTitle,
                    event.is_cancelled && styles.eventTitleCancelled,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {title}
                </Text>
              ) : null}
            </View>

            {/* The time window, then the arrival that actually gets people
                there. R-L: arrival is its OWN line -- inline as
                "· arrive 4:45" it was the first thing to be clipped on a
                narrow phone, and it is the one number nobody can guess.
                The time is not purple: that is the location link's alone. */}
            <Text style={styles.eventTime} numberOfLines={1}>
              {formatEventTimeRange(event)}
            </Text>
            {arrive ? (
              <Text style={styles.eventArrive} numberOfLines={1}>
                {`Arrive ${arrive}`}
              </Text>
            ) : null}

            {(event.location_name || event.location_address) && (
              <TouchableOpacity
                // Its own tap zone: the venue opens Maps, the rest of the card
                // opens the event. stopPropagation keeps the card's onPress
                // from firing underneath this one.
                onPress={(e) => {
                  e.stopPropagation?.();
                  openInMaps(event.location_address || '', event.location_name);
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.eventLocationRow}
              >
                <Ionicons name="location" size={13} color="#8b5cf6" />
                <Text style={styles.eventLocation} numberOfLines={1}>
                  {event.location_name || event.location_address}
                </Text>
                <Ionicons name="chevron-forward" size={13} color="#8b5cf6" />
              </TouchableOpacity>
            )}
          </View>

          {eventPast ? (
            <View style={styles.pastEventBadge}>
              <Text style={styles.pastEventText}>Past</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <View style={styles.cardFooterDivider} />

        <View style={styles.cardFooterRow}>
          {/* Counts come from the single aggregate read above. */}
          <View style={styles.footerCounts}>
            <Text style={styles.footerCount}>
              ✓ <Text style={styles.footerCountNum}>{event.rsvp_counts?.yes ?? 0}</Text>
            </Text>
            <Text style={styles.footerCount}>
              ✕ <Text style={styles.footerCountNum}>{event.rsvp_counts?.no ?? 0}</Text>
            </Text>
            <Text style={styles.footerCount}>
              ? <Text style={styles.footerCountNum}>{event.rsvp_counts?.pending ?? 0}</Text>
            </Text>
          </View>

          {/* Same writer the removed "Will you be there?" strip used:
              handleRsvp(event.id, ...) -> upsertRsvp, and can't-go still
              opens the shared reason sheet via setCantGoEventId. */}
          {!eventPast && (
            <RsvpPill
              compact
              style={styles.footerPill}
              status={event.user_rsvp?.status}
              disabled={rsvpSubmitting}
              onGoing={() =>
                event.user_rsvp?.status === 'yes'
                  ? handleRsvp(event.id, 'pending')
                  : handleRsvp(event.id, 'yes')
              }
              onCantGo={() => setCantGoEventId(event.id)}
            />
          )}
        </View>
      </View>
    );
  };


  return (
    <View style={styles.container}>
      {teamsLoading && hasAnyTeam ? (
        <View style={styles.refreshBar}>
          <ActivityIndicator size="small" color="#8b5cf6" />
        </View>
      ) : null}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowSyncModal(true)}
          >
            <Text style={styles.headerButtonIcon}>🔗</Text>
          </TouchableOpacity>
          <NotificationBell />
        </View>
      </View>

      <View style={styles.toolbar}>
        {/* Row 1: Team selector (full width) + create button */}
        <View style={styles.toolbarRow1}>
          <TouchableOpacity
            style={styles.teamSelector}
            onPress={() => setTeamPickerVisible(true)}
          >
            {selectedTeamId === ALL_TEAMS_ID ? (
              <View style={styles.allTeamsIndicator}>
                <Text style={styles.allTeamsIcon}>👥</Text>
              </View>
            ) : selectedTeam ? (
              <View
                style={[
                  styles.teamColorDot,
                  { backgroundColor: resolveTeamColor(selectedTeam) },
                ]}
              />
            ) : null}
            <Text style={styles.teamSelectorText} numberOfLines={1}>
              {selectedTeamName}
            </Text>
            {isPastTeamSelected && (
              <View style={styles.seasonEndedPill}>
                <Text style={styles.seasonEndedPillText}>Season ended</Text>
              </View>
            )}
            <Text style={styles.dropdownArrow}>▼</Text>
          </TouchableOpacity>
          {canCreate && (
            <TouchableOpacity
              style={styles.createButton}
              onPress={handleCreatePress}
            >
              <Text style={styles.createButtonText}>+</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Row 2: R-E order -- List / Day / Week / Month. The inline style
            objects this row used to carry are back in the StyleSheet, which
            is what the five orphaned viewToggle/viewButton keys were for. */}
        <View style={styles.toolbarRow2}>
          <View style={styles.viewToggle}>
            {VIEW_OPTIONS.map(({ value, label }) => (
              <TouchableOpacity
                key={value}
                onPress={() => setViewMode(value)}
                style={[
                  styles.viewButton,
                  viewMode === value && styles.viewButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.viewButtonText,
                    viewMode === value && styles.viewButtonTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {(() => {
        const legendVisible =
          selectedTeamId === ALL_TEAMS_ID && teams.length >= 2;
        const contentPaddingBottom = legendVisible
          ? legendExpanded
            ? 150
            : 60
          : 0;
        const userTeamsForLegend = teams.map((t) => ({
          id: t.id,
          name: t.name,
          color: resolveTeamColor(t),
        }));
        // R-A: the pills and dots in Week/Month already carry the team colour;
        // the NAME is only worth the room when more than one team is in view.
        const showTeamNames = selectedTeamId === ALL_TEAMS_ID;
        return (
          <>
            <View
              style={{ flex: 1, paddingBottom: contentPaddingBottom }}
            >
              {/* First load only, matching the teams gate above. Every focus
                  refetches, and blanking a calendar we can already draw is what
                  flashed a spinner when arriving from chat. Freshness is
                  unchanged -- the refetch still runs, it just does not blank. */}
              {loading && events.length === 0 ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#8b5cf6" />
                </View>
              ) : viewMode === 'list' ? (
                <ScrollView
                  style={styles.eventsList}
                  refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#8b5cf6"
            />
          }
        >
          {groupedEvents.length === 0 ? (
            <View style={styles.noEventsContainer}>
              <Text style={styles.noEventsIcon}>📭</Text>
              <Text style={styles.noEventsText}>No upcoming events</Text>
            </View>
          ) : (
            groupedEvents.map((group, groupIndex) => {
              if (group.title === 'Previous') {
                return (
                  <View key={groupIndex} style={styles.eventGroup}>
                    <TouchableOpacity
                      style={styles.showPreviousButton}
                      onPress={() => setShowPreviousEvents(!showPreviousEvents)}
                    >
                      <Text style={styles.showPreviousButtonText}>
                        {showPreviousEvents ? '▲ Hide Previous Events' : '▼ Show Previous Events'} ({group.data.length})
                      </Text>
                    </TouchableOpacity>
                    {showPreviousEvents && (
                      <>
                        <Text style={styles.groupTitle}>{group.title}</Text>
                        {group.data.map(renderEventListCard)}
                      </>
                    )}
                  </View>
                );
              }
              return (
                <View key={groupIndex} style={styles.eventGroup}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  {group.data.map(renderEventListCard)}
              </View>
            );
            })
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      ) : viewMode === 'month' ? (
        <MonthView
          events={events}
          currentDate={currentDate}
          // R-D: tapping a day opens its pills UNDER the grid; it no longer
          // leaves for the Day view. The date still travels up, so switching
          // to Day afterwards lands on the day that was tapped.
          onDayPress={(date) => setCurrentDate(date)}
          onEventPress={(event) =>
            navigation.navigate('EventDetail', {
              event,
              onRefetch: fetchEvents,
            })
          }
          onPrevMonth={() =>
            setCurrentDate((d) => subMonths(d, 1))
          }
          onNextMonth={() =>
            setCurrentDate((d) => addMonths(d, 1))
          }
          showTeamNames={showTeamNames}
        />
      ) : viewMode === 'week' ? (
        <WeekView
          events={events}
          onEventPress={(event) =>
            navigation.navigate('EventDetail', {
              event,
              onRefetch: fetchEvents,
            })
          }
          onDayPress={(date) => {
            setCurrentDate(date);
            setViewMode('day');
          }}
          showTeamNames={showTeamNames}
        />
      ) : viewMode === 'day' ? (
                <DayView
                  events={events}
                  initialDate={currentDate}
                  // R-D: the Day view shows THE list card, not a copy of it.
                  renderEventCard={renderEventListCard}
                />
              ) : null}
            </View>
            {selectedTeamId === ALL_TEAMS_ID && (
              <TeamLegend
                teams={userTeamsForLegend}
                isExpanded={legendExpanded}
                onToggleExpand={() => setLegendExpanded(!legendExpanded)}
                onTeamPress={(teamId) => {
                  setSelectedTeamId(teamId);
                  setLegendExpanded(false);
                }}
              />
            )}
          </>
        );
      })()}

      <Modal
        visible={teamPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTeamPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTeamPickerVisible(false)}
        >
          <View
            style={styles.teamPickerModal}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Team</Text>
              <TouchableOpacity onPress={() => setTeamPickerVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.teamList}>
              <TouchableOpacity
                style={[
                  styles.teamOption,
                  selectedTeamId === ALL_TEAMS_ID && styles.teamOptionSelected,
                ]}
                onPress={() => {
                  setSelectedTeamId(ALL_TEAMS_ID);
                  setTeamPickerVisible(false);
                }}
              >
                <View style={styles.allTeamsIndicator}>
                  <Text style={styles.allTeamsIcon}>👥</Text>
                </View>
                <View style={styles.teamOptionInfo}>
                  <Text style={styles.teamOptionName}>All Teams</Text>
                  <Text style={styles.teamOptionSub}>
                    See events from all your teams
                  </Text>
                </View>
                {selectedTeamId === ALL_TEAMS_ID && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>

              <View style={styles.teamDivider} />

              {teams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  style={[
                    styles.teamOption,
                    selectedTeamId === team.id && styles.teamOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedTeamId(team.id);
                    setTeamPickerVisible(false);
                  }}
                >
                  <View
                    style={[
                      styles.teamColorDot,
                      { backgroundColor: resolveTeamColor(team) },
                    ]}
                  />
                  <View style={styles.teamOptionInfo}>
                    <Text style={styles.teamOptionName}>{team.name}</Text>
                    <Text style={styles.teamOptionSub}>
                      {team.access_type === 'staff'
                        ? team.staff_role?.replace('_', ' ') || 'Staff'
                        : `Parent of ${team.player_name}`}
                    </Text>
                  </View>
                  {selectedTeamId === team.id && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}

              {pastTeams.length > 0 && (
                <View style={styles.pastTeamsSection}>
                  <TouchableOpacity
                    style={styles.pastTeamsSectionHeader}
                    onPress={() => setPastTeamsExpanded((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={pastTeamsExpanded ? 'chevron-down' : 'chevron-forward'}
                      size={16}
                      color="#888"
                    />
                    <Text style={styles.pastTeamsSectionTitle}>
                      Past teams ({pastTeams.length})
                    </Text>
                  </TouchableOpacity>
                  {pastTeamsExpanded &&
                    pastTeams.map((team) => (
                      <TouchableOpacity
                        key={team.id}
                        style={[
                          styles.teamOption,
                          styles.teamOptionPast,
                          selectedTeamId === team.id && styles.teamOptionSelected,
                        ]}
                        onPress={() => {
                          setSelectedTeamId(team.id);
                          setTeamPickerVisible(false);
                        }}
                      >
                        <Ionicons
                          name="archive-outline"
                          size={16}
                          color="#888"
                        />
                        <View
                          style={[
                            styles.teamColorDot,
                            { backgroundColor: resolveTeamColor(team) },
                          ]}
                        />
                        <View style={styles.teamOptionInfo}>
                          <Text style={[styles.teamOptionName, styles.teamOptionNamePast]}>
                            {team.name}
                          </Text>
                          <Text style={styles.teamOptionSub}>Archived</Text>
                        </View>
                        {selectedTeamId === team.id && (
                          <Text style={styles.checkmark}>✓</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                </View>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <EventTypeSheet
        visible={typeSheetVisible}
        onClose={() => setTypeSheetVisible(false)}
        onSelect={handleEventTypeChosen}
      />

      <CreateEventModal
        visible={createModalVisible}
        eventType={createEventType ?? 'practice'}
        teams={staffTeams}
        initialTeamId={createInitialTeamId}
        onClose={() => {
          setCreateModalVisible(false);
          setCreateEventType(null);
        }}
        onSubmit={createEvent}
        onCreateRecurring={createRecurringEvents}
        onSuccess={handleCreateSuccess}
      />

      <CantGoReasonModal
        visible={!!cantGoEventId}
        onClose={() => setCantGoEventId(null)}
        onSkip={handleCantGoSkip}
        onSubmit={handleCantGoSubmit}
        submitting={rsvpSubmitting}
      />

      <CalendarSyncModal
        visible={showSyncModal}
        onClose={() => setShowSyncModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  refreshBar: {
    paddingVertical: 4,
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a4e',
  },
  headerTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerButton: {
    padding: 8,
  },
  headerButtonIcon: {
    fontSize: 22,
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2a2a4e',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a5e',
  },
  toolbarRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toolbarRow2: {
    alignItems: 'center',
    marginTop: 12,
  },
  teamSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3a3a5e',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    minWidth: 0,
  },
  teamColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  teamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    // (21pt line box - 8pt dot) / 2, so it sits on the headline's cap height.
    marginTop: 6,
  },
  allTeamsIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  allTeamsIcon: {
    fontSize: 12,
  },
  teamSelectorText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  dropdownArrow: {
    color: '#888',
    fontSize: 10,
  },
  // R-G: the toggle spans the toolbar instead of sizing to its labels, so
  // four tabs each get a quarter and 'Month' cannot clip at 375pt.
  viewToggle: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    backgroundColor: '#374151',
    borderRadius: 8,
    padding: 4,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  viewButton: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewButtonActive: {
    backgroundColor: '#8B5CF6',
  },
  viewButtonText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '400',
  },
  viewButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    marginTop: -2,
  },
  eventsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  noEventsContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  noEventsIcon: {
    fontSize: 50,
    marginBottom: 12,
  },
  noEventsText: {
    color: '#888',
    fontSize: 16,
  },
  eventGroup: {
    marginTop: 20,
  },
  showPreviousButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginTop: 8,
    marginHorizontal: 16,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderRadius: 8,
    alignItems: 'center',
  },
  showPreviousButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  groupTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  // H1: the card is a COLUMN now -- header row, hairline, footer row -- so the
  // footer pill lives inside the same frame as the event it answers for.
  eventCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    marginBottom: 10,
    // F1 frame. No `overflow: 'hidden'` any more: the date badge is an inset
    // tag now, nothing reaches the corners, and clipping ate its glow.
    borderWidth: 2,
    borderLeftWidth: 5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    minHeight: 80,
    // Round 3: +4pt of air above the footer hairline.
    paddingBottom: 4,
  },
  cardFooterDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 12,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // Round 3: the pill holds its measured width; only the counts compress.
  footerPill: {
    flexShrink: 0,
  },
  // Round 3: "Can't go" was clipped past the card's right edge at 375pt. The
  // counts give way, the pill never does.
  footerCounts: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 10,
  },
  footerCount: {
    color: '#94a3b8',
    fontSize: 13,
  },
  footerCountNum: {
    color: '#e2e8f0',
    fontWeight: '700',
  },

  eventCardCancelled: {
    opacity: 0.5,
  },
  eventCardPast: {
    opacity: 0.5,
  },
  pastEventBadge: {
    backgroundColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  pastEventText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '500',
  },
  eventDetails: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
    minWidth: 0,
  },
  // R-H: chip first, then the title -- the row under the headline.
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    gap: 8,
    minWidth: 0,
  },
  // R-H headline. flex-start so the dot keeps to the first line of a name
  // that wraps to two.
  eventTeamBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 3,
    minWidth: 0,
  },
  // The largest type on the card, at 17 against the title's 14. flexShrink
  // stays 1 so two lines WRAP inside the card instead of overflowing it --
  // numberOfLines={2} is what keeps the name whole (R-H).
  eventTeamName: {
    color: '#f5f3ff',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 21,
    flexShrink: 1,
    minWidth: 0,
  },
  eventTitle: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  eventTitleCancelled: {
    textDecorationLine: 'line-through',
    color: '#64748b',
  },
  eventTime: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  // R-L: a line of its own under the time window.
  eventArrive: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  // No underline (device review: too cluttered). The affordance is the accent
  // colour plus the pin and chevron flanking it; the venue text stays clean.
  eventLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  eventLocation: {
    color: '#8b5cf6',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  // Deleted here: the 20 style keys the recon found orphaned -- the old inline
  // RSVP buttons (10), the attendance preview (5), the old type badge (2),
  // eventCardWrap (1) and the placeholder view (2). The five view-toggle keys
  // are the exception: the R-E tab row uses them again.
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  teamPickerModal: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalClose: {
    color: '#888',
    fontSize: 20,
  },
  teamList: {
    padding: 16,
  },
  teamOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#2a2a4e',
    gap: 12,
  },
  teamOptionSelected: {
    backgroundColor: '#3a3a5e',
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  teamOptionInfo: {
    flex: 1,
  },
  teamOptionName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  teamOptionSub: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  checkmark: {
    color: '#8b5cf6',
    fontSize: 18,
    fontWeight: '700',
  },
  teamDivider: {
    height: 1,
    backgroundColor: '#2a2a4e',
    marginVertical: 8,
  },
  pastTeamsSection: {
    marginTop: 8,
  },
  pastTeamsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 8,
  },
  pastTeamsSectionTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  teamOptionPast: {
    opacity: 0.6,
  },
  teamOptionNamePast: {
    fontSize: 14,
  },
  seasonEndedPill: {
    backgroundColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 6,
  },
  seasonEndedPillText: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '600',
  },
});

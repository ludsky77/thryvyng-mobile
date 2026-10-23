import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logError } from '../utils/logError';
import type { CalendarEvent, EventType } from '../types';

// Table name - matches web app schema
const EVENTS_TABLE = 'cal_events';

/**
 * Event CREATION for the calendar screen. Nothing else.
 *
 * This hook used to also fetch the whole visible event range, enrich it with
 * RSVP counts, hold a realtime subscription and export an `updateRsvp` writer.
 * None of it was consumed: CalendarScreen destructures only the two create
 * functions and does its own fetch, so the hook was running a duplicate
 * events+RSVP read on every mount and keeping a second realtime channel open
 * for results nobody read. `updateRsvp` was a fourth, dead RSVP writer; the
 * one writer now lives in src/utils/rsvp.ts.
 *
 * The team comes from the SUBMIT PAYLOAD, not from this closure: the create
 * form owns the team choice now (CreateEventModal's Team field), so there is
 * no child -> parent -> re-render round trip before a submit. The `teamId`
 * argument stays as a fallback for a caller that already knows its one team.
 */

/**
 * An insert failure with something true to show the user.
 *
 * The old path swallowed every error into `null`, and the form rendered that
 * as "check your connection" -- so an RLS refusal (creating for a team you
 * are not staff on) read as a network blip. The real error is logged; the
 * `userMessage` is what the form is allowed to say.
 */
export type UserFacingError = Error & { userMessage: string };

function insertFailure(
  scope: string,
  error: unknown,
  extra: Record<string, unknown>
): UserFacingError {
  logError(scope, error, extra);

  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  // 42501 = insufficient_privilege, which is what the cal_events_insert
  // policy returns for a team_id with no team_staff row for this user.
  const refused =
    code === '42501' || /row-level security/i.test(message);

  const err = new Error(
    refused
      ? "You can't create events for this team."
      : 'Could not create the event. Please try again.'
  ) as UserFacingError;
  err.userMessage = err.message;
  return err;
}

export function useCalendarEvents(teamId: string | null = null) {
  const { user } = useAuth();

  const createEvent = async (payload: {
    team_id?: string | null;
    title: string;
    event_type: EventType;
    event_date: string;
    start_time?: string | null;
    arrival_time?: string | null;
    end_time?: string | null;
    is_all_day?: boolean;
    location_name?: string | null;
    location_address?: string | null;
    opponent?: string | null;
    home_away?: 'home' | 'away' | 'neutral' | null;
    uniform?: string | null;
    notes?: string | null;
  }) => {
    const eventTeamId = payload.team_id ?? teamId;
    if (!user || !eventTeamId) return null;

    const { data: team } = await supabase
      .from('teams')
      .select('club_id')
      .eq('id', eventTeamId)
      .single();

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .insert({
        team_id: eventTeamId,
        club_id: team?.club_id || null,
        created_by: user.id,
        title: payload.title,
        event_type: payload.event_type,
        event_date: payload.event_date,
        start_time: payload.start_time || null,
        arrival_time: payload.arrival_time || null,
        end_time: payload.end_time || null,
        is_all_day: payload.is_all_day ?? false,
        location_name: payload.location_name || null,
        location_address: payload.location_address || null,
        opponent: payload.opponent || null,
        home_away: payload.home_away || null,
        uniform: payload.uniform || null,
        notes: payload.notes || null,
      })
      .select()
      .single();

    if (error) {
      throw insertFailure('useCalendarEvents.createEvent', error, {
        teamId: eventTeamId,
        eventType: payload.event_type,
      });
    }

    return data as CalendarEvent;
  };

  const createRecurringEvents = async (payload: {
    team_id?: string | null;
    title: string;
    event_type: string;
    start_time?: string | null;
    arrival_time?: string | null;
    end_time?: string | null;
    is_all_day?: boolean;
    location_name?: string | null;
    location_address?: string | null;
    opponent?: string | null;
    home_away?: string | null;
    uniform?: string | null;
    notes?: string | null;
    dates: string[];
    recurrence_pattern: string;
  }) => {
    const eventTeamId = payload.team_id ?? teamId;
    if (!user || !eventTeamId || payload.dates.length === 0) return null;

    const { data: team } = await supabase
      .from('teams')
      .select('club_id')
      .eq('id', eventTeamId)
      .single();

    const recurrenceGroupId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

    const eventsToInsert = payload.dates.map((date) => ({
      team_id: eventTeamId,
      club_id: team?.club_id || null,
      created_by: user.id,
      title: payload.title,
      event_type: payload.event_type,
      event_date: date,
      start_time: payload.start_time || null,
      arrival_time: payload.arrival_time || null,
      end_time: payload.end_time || null,
      is_all_day: payload.is_all_day || false,
      location_name: payload.location_name || null,
      location_address: payload.location_address || null,
      opponent: payload.opponent || null,
      home_away: payload.home_away || null,
      uniform: payload.uniform || null,
      notes: payload.notes || null,
      recurrence_group_id: recurrenceGroupId,
      recurrence_pattern: payload.recurrence_pattern,
    }));

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .insert(eventsToInsert)
      .select();

    if (error) {
      throw insertFailure('useCalendarEvents.createRecurringEvents', error, {
        teamId: eventTeamId,
        eventType: payload.event_type,
        occurrences: payload.dates.length,
      });
    }
    return data;
  };

  return {
    createEvent,
    createRecurringEvents,
  };
}

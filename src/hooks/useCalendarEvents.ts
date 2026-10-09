import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
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
 */
export function useCalendarEvents(teamId: string | null) {
  const { user } = useAuth();

  const createEvent = async (payload: {
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
    if (!user || !teamId) return null;

    const { data: team } = await supabase
      .from('teams')
      .select('club_id')
      .eq('id', teamId)
      .single();

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .insert({
        team_id: teamId,
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
      console.error('createEvent error:', error.message);
      return null;
    }

    return data as CalendarEvent;
  };

  const createRecurringEvents = async (payload: {
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
    if (!user || !teamId || payload.dates.length === 0) return null;

    const { data: team } = await supabase
      .from('teams')
      .select('club_id')
      .eq('id', teamId)
      .single();

    const recurrenceGroupId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

    const eventsToInsert = payload.dates.map((date) => ({
      team_id: teamId,
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
      console.error('createRecurringEvents error:', error.message);
      return null;
    }
    return data;
  };

  return {
    createEvent,
    createRecurringEvents,
  };
}

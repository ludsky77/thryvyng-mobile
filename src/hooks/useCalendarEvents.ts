import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { CalendarEvent, EventRSVP, EventType, RSVPStatus } from '../types';

// Table names - match web app schema
const EVENTS_TABLE = 'cal_events';
const RSVPS_TABLE = 'cal_event_rsvps';

export function useCalendarEvents(
  teamId: string | null,
  startDate?: string,
  endDate?: string
) {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!teamId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let query = supabase
      .from(EVENTS_TABLE)
      .select('*')
      .eq('team_id', teamId)
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: false });

    if (startDate) {
      query = query.gte('event_date', startDate);
    }
    if (endDate) {
      query = query.lte('event_date', endDate);
    }

    const { data: eventsData, error: eventsError } = await query.limit(100);

    if (eventsError) {
      setLoading(false);
      return;
    }

    const eventIds = (eventsData || []).map((e: CalendarEvent) => e.id);
    if (eventIds.length === 0) {
      const enriched = (eventsData || []).map((e: CalendarEvent) => ({
        ...e,
        rsvp_counts: { yes: 0, no: 0, maybe: 0, pending: 0 },
        user_rsvp: null,
      }));
      setEvents(enriched);
      setLoading(false);
      return;
    }

    const { data: rsvpsData } = await supabase
      .from(RSVPS_TABLE)
      .select('*')
      .in('event_id', eventIds);

    const rsvpsByEvent: Record<string, EventRSVP[]> = {};
    eventIds.forEach((id) => (rsvpsByEvent[id] = []));
    (rsvpsData || []).forEach((r: EventRSVP) => {
      if (rsvpsByEvent[r.event_id]) rsvpsByEvent[r.event_id].push(r);
    });

    const enriched = (eventsData || []).map((e: CalendarEvent) => {
      const rsvps = rsvpsByEvent[e.id] || [];
      const rsvp_counts = {
        yes: rsvps.filter((r) => r.status === 'yes').length,
        no: rsvps.filter((r) => r.status === 'no').length,
        maybe: rsvps.filter((r) => r.status === 'maybe').length,
        pending: rsvps.filter((r) => r.status === 'pending').length,
      };
      const user_rsvp = rsvps.find((r) => r.user_id === user?.id) || null;
      return { ...e, rsvp_counts, user_rsvp };
    });

    setEvents(enriched as CalendarEvent[]);
    setLoading(false);
  }, [teamId, startDate, endDate, user?.id]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Real-time subscription for events
  useEffect(() => {
    if (!teamId) return;

    const channel = supabase
      .channel(`events:${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: EVENTS_TABLE,
          filter: `team_id=eq.${teamId}`,
        },
        () => fetchEvents()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: RSVPS_TABLE,
        },
        () => fetchEvents()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, fetchEvents]);

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

  const updateRsvp = async (eventId: string, status: RSVPStatus) => {
    if (!user) return false;

    const { data: existing } = await supabase
      .from(RSVPS_TABLE)
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from(RSVPS_TABLE)
        .update({
          status,
          responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      return !error;
    } else {
      const { error } = await supabase.from(RSVPS_TABLE).insert({
        event_id: eventId,
        user_id: user.id,
        status,
        responded_at: new Date().toISOString(),
      });
      return !error;
    }
  };

  return {
    events,
    loading,
    createEvent,
    createRecurringEvents,
    updateRsvp,
    refetch: fetchEvents,
  };
}

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useUserTeams } from '../hooks/useUserTeams';
import { supabase } from '../lib/supabase';
import { openInMaps } from '../lib/maps';
import { getEventTypeConfig } from '../types';
import type { CalendarEvent } from '../types';

function formatTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h || '0', 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m || '00'} ${ampm}`;
}

export default function EventDetailScreen({ route, navigation }: any) {
  const { event: eventParam, eventId, onRefetch } = route.params || {};
  const { user } = useAuth();
  const { canManageTeam } = useUserTeams();
  const [event, setEvent] = useState<CalendarEvent | null>(eventParam || null);
  const [loading, setLoading] = useState(!eventParam && !!eventId);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  useEffect(() => {
    if (eventParam || !eventId) return;

    const fetchEvent = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('cal_events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (!error && data) {
        const eventIds = [data.id];
        const { data: rsvpsData } = await supabase
          .from('cal_event_rsvps')
          .select('*')
          .in('event_id', eventIds);

        const rsvps = rsvpsData || [];
        const rsvp_counts = {
          yes: rsvps.filter((r: any) => r.status === 'yes').length,
          no: rsvps.filter((r: any) => r.status === 'no').length,
          maybe: rsvps.filter((r: any) => r.status === 'maybe').length,
        };
        setEvent({ ...data, rsvp_counts } as CalendarEvent);
      }
      setLoading(false);
    };

    fetchEvent();
  }, [eventId, eventParam]);

  const typeConfig = event ? getEventTypeConfig(event.event_type) : getEventTypeConfig('other_event');

  const handleRsvp = async (status: 'yes' | 'maybe' | 'no') => {
    if (!user) return;
    setRsvpLoading(true);

    const { data: existing } = await supabase
      .from('cal_event_rsvps')
      .select('id')
      .eq('event_id', event.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('cal_event_rsvps')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase.from('cal_event_rsvps').insert({
        event_id: event.id,
        user_id: user.id,
        status,
        responded_at: new Date().toISOString(),
      });
    }

    setRsvpLoading(false);
    onRefetch?.();
    navigation.goBack();
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('cal_event_rsvps').delete().eq('event_id', event.id);
            await supabase.from('cal_events').delete().eq('id', event.id);
            onRefetch?.();
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleOpenMaps = () => {
    if (!event) return;
    openInMaps(event.location_address || '', event.location_name || undefined);
  };

  if (loading || !event) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        {loading ? (
          <>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={{ color: '#888', marginTop: 12 }}>Loading event...</Text>
          </>
        ) : (
          <Text style={{ color: '#888', fontSize: 16 }}>Event not found</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Details</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header with colored bar */}
        <View style={[styles.eventHeader, { borderLeftColor: typeConfig.color }]}>
          <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '33' }]}>
            <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
              {typeConfig.icon} {typeConfig.label}
            </Text>
          </View>
          <Text style={styles.title}>{event.title}</Text>

          {event.opponent && (
            <Text style={styles.opponent}>
              {event.home_away === 'home' ? 'vs' : '@'} {event.opponent}
            </Text>
          )}
        </View>

        {/* Date & Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Date & Time</Text>
          <Text style={styles.sectionText}>{event.event_date}</Text>
          {event.start_time && (
            <Text style={styles.sectionText}>
              {formatTime(event.start_time)} - {event.end_time ? formatTime(event.end_time) : 'TBD'}
            </Text>
          )}
          {event.is_all_day && <Text style={styles.sectionText}>All Day</Text>}
        </View>

        {/* Location */}
        {(event.location_name || event.location_address) && (
          <TouchableOpacity style={styles.section} onPress={handleOpenMaps}>
            <Text style={styles.sectionTitle}>📍 Location</Text>
            {event.location_name && (
              <Text style={styles.sectionText}>{event.location_name}</Text>
            )}
            {event.location_address && (
              <Text style={styles.addressText}>{event.location_address}</Text>
            )}
            <Text style={styles.tapToOpen}>Tap to open in Maps</Text>
          </TouchableOpacity>
        )}

        {/* Venue + Uniform (combined inline) */}
        {(event.home_away || event.uniform) && (
          <View style={styles.inlineSection}>
            {event.home_away && (
              <View style={styles.inlineItem}>
                <Text style={styles.sectionTitle}>🏟️ Venue</Text>
                <View
                  style={[
                    styles.venueBadge,
                    event.home_away === 'home' && { backgroundColor: '#22c55e' },
                    event.home_away === 'away' && { backgroundColor: '#ef4444' },
                    event.home_away === 'neutral' && { backgroundColor: '#6b7280' },
                  ]}
                >
                  <Text style={styles.venueBadgeText}>
                    {event.home_away.toUpperCase()}
                  </Text>
                </View>
              </View>
            )}
            {event.uniform && (
              <View style={styles.inlineItem}>
                <Text style={styles.sectionTitle}>👕 Uniform</Text>
                <Text style={styles.sectionText}>{event.uniform}</Text>
              </View>
            )}
          </View>
        )}

        {/* Notes */}
        {event.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Notes</Text>
            <Text style={styles.sectionText}>{event.notes}</Text>
          </View>
        )}

        {/* RSVP Counts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Responses</Text>
          <View style={styles.rsvpCounts}>
            <View style={styles.rsvpCount}>
              <Text style={styles.rsvpCountNumber}>
                {event.rsvp_counts?.yes || 0}
              </Text>
              <Text style={styles.rsvpCountLabel}>Going</Text>
            </View>
            <View style={styles.rsvpCount}>
              <Text style={styles.rsvpCountNumber}>
                {event.rsvp_counts?.maybe || 0}
              </Text>
              <Text style={styles.rsvpCountLabel}>Maybe</Text>
            </View>
            <View style={styles.rsvpCount}>
              <Text style={styles.rsvpCountNumber}>
                {event.rsvp_counts?.no || 0}
              </Text>
              <Text style={styles.rsvpCountLabel}>Can't Go</Text>
            </View>
          </View>
        </View>

        {/* RSVP Buttons */}
        <View style={styles.rsvpButtons}>
          <TouchableOpacity
            style={[styles.rsvpButton, styles.rsvpGoing]}
            onPress={() => handleRsvp('yes')}
            disabled={rsvpLoading}
          >
            <Text style={styles.rsvpButtonText}>✓ Going</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rsvpButton, styles.rsvpMaybe]}
            onPress={() => handleRsvp('maybe')}
            disabled={rsvpLoading}
          >
            <Text style={styles.rsvpButtonText}>? Maybe</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rsvpButton, styles.rsvpNo]}
            onPress={() => handleRsvp('no')}
            disabled={rsvpLoading}
          >
            <Text style={styles.rsvpButtonText}>✗ Can't Go</Text>
          </TouchableOpacity>
        </View>

        {/* Take Attendance - coaches/managers only */}
        {event.team_id && canManageTeam(event.team_id) && (
          <TouchableOpacity
            style={styles.attendanceButton}
            onPress={() =>
              navigation.navigate('Attendance', { event_id: event.id })
            }
          >
            <Text style={styles.attendanceButtonText}>📋 Take Attendance</Text>
          </TouchableOpacity>
        )}

        {/* Delete Button */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>🗑️ Delete Event</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: '#2a2a4e',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a6e',
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    color: '#a78bfa',
    fontSize: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  eventHeader: {
    padding: 16,
    backgroundColor: '#2a2a4e',
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  opponent: {
    fontSize: 16,
    color: '#aaa',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#2a2a4e',
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a78bfa',
    marginBottom: 4,
  },
  sectionText: {
    fontSize: 15,
    color: '#fff',
  },
  addressText: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 4,
  },
  tapToOpen: {
    fontSize: 12,
    color: '#8b5cf6',
    marginTop: 8,
  },
  inlineSection: {
    flexDirection: 'row',
    backgroundColor: '#2a2a4e',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    padding: 12,
    gap: 20,
  },
  inlineItem: {
    flex: 1,
  },
  venueBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  venueBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  rsvpCounts: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  rsvpCount: {
    alignItems: 'center',
  },
  rsvpCountNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  rsvpCountLabel: {
    fontSize: 11,
    color: '#aaa',
  },
  rsvpButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  rsvpButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  rsvpGoing: {
    backgroundColor: '#22c55e',
  },
  rsvpMaybe: {
    backgroundColor: '#f59e0b',
  },
  rsvpNo: {
    backgroundColor: '#ef4444',
  },
  rsvpButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  attendanceButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#3a3a6e',
    borderWidth: 1,
    borderColor: '#8b5cf6',
    alignItems: 'center',
  },
  attendanceButtonText: {
    color: '#8b5cf6',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 13,
  },
});

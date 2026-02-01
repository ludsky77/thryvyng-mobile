import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type AttendanceStatus = 'yes' | 'no' | 'maybe';

interface Event {
  id: string;
  team_id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
}

interface Rsvp {
  id: string;
  player_id: string | null;
  user_id: string | null;
  status: string;
}

function formatTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h || '0', 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m || '00'} ${ampm}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; icon: string; color: string }[] = [
  { value: 'yes', label: 'Present', icon: '✓', color: '#22c55e' },
  { value: 'no', label: 'Absent', icon: '✗', color: '#ef4444' },
  { value: 'maybe', label: 'Unknown', icon: '?', color: '#6b7280' },
];

export default function AttendanceScreen({ route, navigation }: any) {
  const { event_id } = route.params;
  const { user } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!event_id) {
      setLoading(false);
      return;
    }

    try {
      const { data: eventData, error: eventError } = await supabase
        .from('cal_events')
        .select('id, team_id, title, event_date, start_time, end_time')
        .eq('id', event_id)
        .single();

      if (eventError || !eventData) throw new Error('Event not found');
      setEvent(eventData as Event);

      const teamId = (eventData as any).team_id;
      const { data: playersData } = await supabase
        .from('players')
        .select('id, first_name, last_name, jersey_number')
        .eq('team_id', teamId)
        .order('jersey_number', { ascending: true, nullsFirst: false })
        .order('last_name', { ascending: true });

      const playersList = (playersData || []) as Player[];
      setPlayers(playersList);

      const { data: rsvpsData } = await supabase
        .from('cal_event_rsvps')
        .select('id, player_id, user_id, status')
        .eq('event_id', event_id);

      const rsvpsList = (rsvpsData || []) as Rsvp[];
      setRsvps(rsvpsList);

      const initial: Record<string, AttendanceStatus> = {};
      playersList.forEach((p) => {
        const rsvp = rsvpsList.find((r) => r.player_id === p.id);
        initial[p.id] = rsvp
          ? (rsvp.status as AttendanceStatus)
          : 'maybe';
      });
      setAttendance(initial);
    } catch (err) {
      console.error('Error fetching attendance data:', err);
    } finally {
      setLoading(false);
    }
  }, [event_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const cycleStatus = (playerId: string) => {
    const current = attendance[playerId] || 'maybe';
    const idx = STATUS_OPTIONS.findIndex((o) => o.value === current);
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length].value;
    setAttendance((prev) => ({ ...prev, [playerId]: next }));
  };

  const getStatusHint = (playerId: string): string => {
    const rsvp = rsvps.find((r) => r.player_id === playerId);
    if (!rsvp) return 'No response';
    if (rsvp.status === 'yes') return 'Previously: Going';
    if (rsvp.status === 'no') return 'Previously: Not going';
    if (rsvp.status === 'maybe') return 'Previously: Maybe';
    return 'Previously: Unknown';
  };

  const handleSave = async () => {
    if (!user || !event) return;
    setSaving(true);

    try {
      for (const player of players) {
        const status = attendance[player.id] ?? 'maybe';
        const existing = rsvps.find((r) => r.player_id === player.id);

        if (existing) {
          await supabase
            .from('cal_event_rsvps')
            .update({
              status,
              responded_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('cal_event_rsvps').insert({
            event_id,
            player_id: player.id,
            user_id: user.id,
            status,
            responded_at: new Date().toISOString(),
          });
        }
      }

      Alert.alert('Saved', 'Attendance has been saved.');
      fetchData();
    } catch (err) {
      console.error('Error saving attendance:', err);
      Alert.alert('Error', 'Could not save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const presentCount = players.filter((p) => (attendance[p.id] ?? 'maybe') === 'yes').length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Event not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.eventDate}>{formatDate(event.event_date)}</Text>
        <Text style={styles.eventTime}>
          {event.start_time
            ? `${formatTime(event.start_time)}${event.end_time ? ` - ${formatTime(event.end_time)}` : ''}`
            : 'All Day'}
        </Text>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {presentCount}/{players.length} Present
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Players</Text>
        {players.length === 0 ? (
          <Text style={styles.emptyText}>No players on roster</Text>
        ) : (
          players.map((player) => {
            const status = attendance[player.id] ?? 'maybe';
            const config = STATUS_OPTIONS.find((o) => o.value === status)!;
            return (
              <View key={player.id} style={styles.playerRow}>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>
                    {player.first_name} {player.last_name}
                  </Text>
                  <Text style={styles.jerseyText}>
                    #{player.jersey_number ?? '—'}
                  </Text>
                  <Text style={styles.hintText}>{getStatusHint(player.id)}</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.statusButton,
                    { backgroundColor: config.color + '33', borderColor: config.color },
                  ]}
                  onPress={() => cycleStatus(player.id)}
                >
                  <Text style={[styles.statusIcon, { color: config.color }]}>
                    {config.icon}
                  </Text>
                  <Text style={[styles.statusLabel, { color: config.color }]}>
                    {config.label}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving || players.length === 0}
      >
        <Text style={styles.saveButtonText}>
          {saving ? 'Saving...' : 'Save Attendance'}
        </Text>
      </TouchableOpacity>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    paddingBottom: 40,
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
  errorContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  header: {
    backgroundColor: '#2a2a4e',
    padding: 20,
    marginBottom: 12,
  },
  eventTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  eventDate: {
    color: '#8b5cf6',
    fontSize: 15,
    marginBottom: 2,
  },
  eventTime: {
    color: '#888',
    fontSize: 14,
  },
  summary: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  summaryText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  section: {
    backgroundColor: '#2a2a4e',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a6e',
  },
  playerInfo: {
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  jerseyText: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  hintText: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusIcon: {
    fontSize: 16,
    fontWeight: '700',
    marginRight: 6,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
  saveButton: {
    marginHorizontal: 16,
    backgroundColor: '#22c55e',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomPadding: {
    height: 40,
  },
});

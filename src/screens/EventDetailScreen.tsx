import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useUserTeams } from '../hooks/useUserTeams';
import { supabase } from '../lib/supabase';
import { openInMaps } from '../lib/maps';
import { getEventTypeConfig } from '../types';
import type { CalendarEvent } from '../types';
import { EditEventModal } from '../components/calendar/EditEventModal';
import { notifyTeamOfEvent } from '../services/eventNotifications';

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

interface AttendanceRecord {
  id: string;
  player_id: string;
  status: 'present' | 'absent' | 'late' | 'excused' | null;
  player?: {
    id: string;
    first_name: string;
    last_name: string;
    photo_url?: string;
  };
}

export default function EventDetailScreen({ route, navigation }: any) {
  const { event: eventParam, eventId, onRefetch } = route.params || {};
  const { user } = useAuth();
  const { canManageTeam } = useUserTeams();
  const [event, setEvent] = useState<CalendarEvent | null>(eventParam || null);
  const [loading, setLoading] = useState(!eventParam && !!eventId);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'attendance'>('details');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const isManager = event?.team_id ? canManageTeam(event.team_id) : false;

  const fetchEvent = useCallback(async () => {
    if (!eventId && !eventParam) return;
    
    const id = eventId || eventParam?.id;
    if (!id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cal_events')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        const { data: rsvpsData } = await supabase
          .from('cal_event_rsvps')
          .select('*')
          .eq('event_id', data.id);

        const rsvps = rsvpsData || [];
        const rsvp_counts = {
          yes: rsvps.filter((r: any) => r.status === 'yes').length,
          no: rsvps.filter((r: any) => r.status === 'no').length,
          maybe: rsvps.filter((r: any) => r.status === 'maybe').length,
        };
        setEvent({ ...data, rsvp_counts } as CalendarEvent);
      }
    } catch (err) {
      console.error('[EventDetail] Error fetching event:', err);
    } finally {
      setLoading(false);
    }
  }, [eventId, eventParam]);

  const fetchAttendance = useCallback(async () => {
    if (!event?.id || !event?.team_id) return;
    
    setAttendanceLoading(true);
    try {
      const { data: players, error: playersError } = await supabase
        .from('players')
        .select('id, first_name, last_name, photo_url')
        .eq('team_id', event.team_id)
        .order('last_name');

      if (playersError) throw playersError;

      let attendanceRecords: any[] = [];
      try {
        const { data, error } = await supabase
          .from('event_attendance')
          .select('*')
          .eq('event_id', event.id);
        
        if (!error && data) {
          attendanceRecords = data;
        }
      } catch {
        console.log('[Attendance] No attendance table found');
      }

      const merged = (players || []).map((player) => {
        const record = attendanceRecords.find((a: any) => a.player_id === player.id);
        return {
          id: record?.id || player.id,
          player_id: player.id,
          status: record?.status || null,
          player,
        };
      });

      setAttendance(merged);
    } catch (err) {
      console.error('[EventDetail] Error fetching attendance:', err);
      setAttendance([]);
    } finally {
      setAttendanceLoading(false);
    }
  }, [event?.id, event?.team_id]);

  useEffect(() => {
    if (eventParam) {
      setEvent(eventParam);
    } else {
      fetchEvent();
    }
  }, [eventParam, fetchEvent]);

  useEffect(() => {
    if (activeTab === 'attendance' && event?.id) {
      fetchAttendance();
    }
  }, [activeTab, event?.id, fetchAttendance]);

  const typeConfig = event ? getEventTypeConfig(event.event_type) : getEventTypeConfig('other_event');
  const dateParts = event ? formatDateParts(event.event_date) : { day: '', date: '', month: '' };

  const handleRsvp = async (status: 'yes' | 'maybe' | 'no') => {
    if (!user || !event) return;
    setRsvpLoading(true);

    try {
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

      fetchEvent();
      onRefetch?.();
    } catch (err) {
      console.error('[EventDetail] RSVP error:', err);
      Alert.alert('Error', 'Failed to save response. Please try again.');
    } finally {
      setRsvpLoading(false);
    }
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

  const handleAttendanceUpdate = async (playerId: string, status: 'present' | 'absent' | 'late' | 'excused') => {
    if (!event) return;

    try {
      setAttendance(prev => prev.map(item => 
        item.player_id === playerId 
          ? { ...item, status } 
          : item
      ));
      
      console.log('[Attendance] Updated locally for player:', playerId, 'status:', status);
    } catch (err) {
      console.error('[Attendance] Error:', err);
    }
  };

  const renderAttendanceItem = ({ item }: { item: AttendanceRecord }) => (
    <View style={styles.attendanceRow}>
      <View style={styles.attendancePlayer}>
        <View style={styles.playerAvatar}>
          <Text style={styles.playerAvatarText}>
            {item.player?.first_name?.charAt(0) || '?'}
          </Text>
        </View>
        <Text style={styles.playerName}>
          {item.player?.first_name} {item.player?.last_name}
        </Text>
      </View>
      <View style={styles.attendanceButtons}>
        {(['present', 'absent', 'late', 'excused'] as const).map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.attendanceBtn,
              item.status === status && styles.attendanceBtnActive,
              item.status === status && status === 'present' && { backgroundColor: '#22c55e' },
              item.status === status && status === 'absent' && { backgroundColor: '#ef4444' },
              item.status === status && status === 'late' && { backgroundColor: '#f59e0b' },
              item.status === status && status === 'excused' && { backgroundColor: '#6b7280' },
            ]}
            onPress={() => handleAttendanceUpdate(item.player_id, status)}
          >
            <Text style={[
              styles.attendanceBtnText,
              item.status === status && styles.attendanceBtnTextActive,
            ]}>
              {status === 'present' ? '✓' : status === 'absent' ? '✗' : status === 'late' ? '⏰' : '🎫'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

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

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'details' && styles.tabActive]}
          onPress={() => setActiveTab('details')}
        >
          <Text style={[styles.tabText, activeTab === 'details' && styles.tabTextActive]}>
            Details
          </Text>
        </TouchableOpacity>
        {isManager && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'attendance' && styles.tabActive]}
            onPress={() => setActiveTab('attendance')}
          >
            <Text style={[styles.tabText, activeTab === 'attendance' && styles.tabTextActive]}>
              Attendance
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {activeTab === 'details' ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Main Event Card */}
          <View style={[
            styles.mainCard,
            event.is_cancelled && styles.mainCardCancelled
          ]}>
            {/* Date Column */}
            <View style={styles.dateColumn}>
              <Text style={styles.dateDay}>{dateParts.day}</Text>
              <Text style={styles.dateNumber}>{dateParts.date}</Text>
              <Text style={styles.dateMonth}>{dateParts.month}</Text>
              <View style={[styles.colorBar, { backgroundColor: typeConfig.color }]} />
            </View>

            {/* Content Column */}
            <View style={styles.contentColumn}>
              {/* Title Row with Edit */}
              <View style={styles.titleRow}>
                <Text 
                  style={[
                    styles.eventTitle,
                    event.is_cancelled && styles.eventTitleCancelled
                  ]} 
                  numberOfLines={2}
                >
                  {event.title}
                </Text>
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

              {/* Time */}
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={18} color="#8b5cf6" />
                <View style={styles.infoContent}>
                  {event.is_all_day ? (
                    <Text style={styles.infoTitle}>All Day</Text>
                  ) : (
                    <Text style={styles.infoTitle}>
                      {formatTime(event.start_time)}
                      {event.end_time ? ` - ${formatTime(event.end_time)}` : ''}
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

          {/* Responses Card */}
          <View style={styles.responsesCard}>
            <Text style={styles.responsesTitle}>📊 Responses</Text>
            <View style={styles.responsesRow}>
              <View style={styles.responseItem}>
                <Text style={styles.responseCount}>{event.rsvp_counts?.yes || 0}</Text>
                <Text style={styles.responseLabel}>Going</Text>
              </View>
              <View style={styles.responseItem}>
                <Text style={styles.responseCount}>{event.rsvp_counts?.maybe || 0}</Text>
                <Text style={styles.responseLabel}>Maybe</Text>
              </View>
              <View style={styles.responseItem}>
                <Text style={styles.responseCount}>{event.rsvp_counts?.no || 0}</Text>
                <Text style={styles.responseLabel}>Can't Go</Text>
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

          <View style={styles.bottomPadding} />
        </ScrollView>
      ) : (
        /* Attendance Tab */
        <View style={styles.attendanceContainer}>
          <View style={styles.attendanceLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
              <Text style={styles.legendText}>Present</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.legendText}>Absent</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={styles.legendText}>Late</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#6b7280' }]} />
              <Text style={styles.legendText}>Excused</Text>
            </View>
          </View>

          {attendanceLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#8b5cf6" />
            </View>
          ) : attendance.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No players on this team</Text>
            </View>
          ) : (
            <FlatList
              data={attendance}
              renderItem={renderAttendanceItem}
              keyExtractor={(item) => item.player_id}
              contentContainerStyle={styles.attendanceList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginRight: 8,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#8b5cf6',
  },
  tabText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#8b5cf6',
  },

  // Main Card
  scroll: {
    flex: 1,
  },
  mainCard: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  mainCardCancelled: {
    opacity: 0.6,
  },
  dateColumn: {
    width: 70,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  dateDay: {
    color: '#8b5cf6',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dateNumber: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    marginVertical: 4,
  },
  dateMonth: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  colorBar: {
    width: 4,
    flex: 1,
    marginTop: 12,
    borderRadius: 2,
  },
  contentColumn: {
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
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  responseLabel: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },

  // RSVP Buttons
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
    fontSize: 14,
  },

  // Attendance
  attendanceContainer: {
    flex: 1,
  },
  attendanceLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  attendanceList: {
    padding: 16,
  },
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  attendancePlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
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
  playerName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  attendanceButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  attendanceBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceBtnActive: {
    // Color set inline
  },
  attendanceBtnText: {
    fontSize: 14,
  },
  attendanceBtnTextActive: {
    color: '#fff',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
  },

  bottomPadding: {
    height: 40,
  },
});

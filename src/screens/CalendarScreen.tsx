import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { MonthView } from '../components/calendar/MonthView';
import { CreateEventModal } from '../components/calendar/CreateEventModal';
import { supabase } from '../lib/supabase';
import { getEventTypeConfig } from '../types';
import type { CalendarEvent } from '../types';
import { NotificationBell } from '../components/NotificationBell';

type ViewMode = 'list' | 'month';

const ALL_TEAMS_ID = 'ALL_TEAMS';

const EVENT_TYPE_LABEL_COLORS: Record<string, string> = {
  practice: '#10b981',
  game: '#ef4444',
  scrimmage: '#f59e0b',
  other_event: '#8b5cf6',
  club_event: '#3b82f6',
};

export default function CalendarScreen({ route, navigation }: any) {
  const { user } = useAuth();
  const { teams, loading: teamsLoading, getDefaultTeam, canManageTeam } =
    useUserTeams();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamPickerVisible, setTeamPickerVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForTeamId, setCreateForTeamId] = useState<string | null>(null);
  const [events, setEvents] = useState<
    (CalendarEvent & { team?: UserTeam; rsvp_counts?: any; user_rsvp?: any })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  const startDate = subMonths(new Date(), 1).toISOString().split('T')[0];
  const endDate = addMonths(new Date(), 6).toISOString().split('T')[0];

  const createTeamId =
    createForTeamId ||
    (selectedTeamId !== ALL_TEAMS_ID ? selectedTeamId : null);
  const {
    createEvent,
    createRecurringEvents,
  } = useCalendarEvents(createTeamId, startDate, endDate);

  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      const defaultTeam = getDefaultTeam();
      setSelectedTeamId(defaultTeam?.id || ALL_TEAMS_ID);
    }
  }, [teams, selectedTeamId, getDefaultTeam]);

  const fetchEvents = useCallback(async () => {
    if (teamsLoading || teams.length === 0) return;

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
      let rsvpsByEvent: Record<string, any[]> = {};

      if (eventIds.length > 0) {
        const { data: rsvpsData } = await supabase
          .from('cal_event_rsvps')
          .select('*')
          .in('event_id', eventIds);

        (rsvpsData || []).forEach((r: any) => {
          if (!rsvpsByEvent[r.event_id]) rsvpsByEvent[r.event_id] = [];
          rsvpsByEvent[r.event_id].push(r);
        });
      }

      const enrichedEvents = (eventsData || []).map((event: any) => {
        const team = teams.find((t) => t.id === event.team_id);
        const rsvps = rsvpsByEvent[event.id] || [];
        const rsvp_counts = {
          yes: rsvps.filter((r) => r.status === 'yes').length,
          no: rsvps.filter((r) => r.status === 'no').length,
          maybe: rsvps.filter((r) => r.status === 'maybe').length,
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
  }, [selectedTeamId, teams, teamsLoading, startDate, endDate, user?.id]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  const handleRsvp = async (
    eventId: string,
    status: 'yes' | 'no' | 'maybe'
  ) => {
    if (!user) return;

    const { data: existing } = await supabase
      .from('cal_event_rsvps')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .maybeSingle();

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
        event_id: eventId,
        user_id: user.id,
        status,
        responded_at: new Date().toISOString(),
      });
    }

    fetchEvents();
  };

  const groupedEvents = useMemo(() => {
    const groups: { title: string; data: typeof events }[] = [];
    const today: typeof events = [];
    const tomorrow: typeof events = [];
    const thisWeek: typeof events = [];
    const later: typeof events = [];

    events.forEach((event) => {
      const eventDate = parseISO(event.event_date);
      if (isToday(eventDate)) {
        today.push(event);
      } else if (isTomorrow(eventDate)) {
        tomorrow.push(event);
      } else if (isThisWeek(eventDate)) {
        thisWeek.push(event);
      } else {
        later.push(event);
      }
    });

    if (today.length > 0) groups.push({ title: 'Today', data: today });
    if (tomorrow.length > 0) groups.push({ title: 'Tomorrow', data: tomorrow });
    if (thisWeek.length > 0)
      groups.push({ title: 'This Week', data: thisWeek });
    if (later.length > 0) groups.push({ title: 'Upcoming', data: later });

    return groups;
  }, [events]);

  const selectedTeam =
    selectedTeamId === ALL_TEAMS_ID
      ? null
      : teams.find((t) => t.id === selectedTeamId);

  const selectedTeamName =
    selectedTeamId === ALL_TEAMS_ID
      ? 'All Teams'
      : selectedTeam?.name || 'Select Team';

  const canCreate =
    selectedTeamId !== ALL_TEAMS_ID &&
    selectedTeamId &&
    canManageTeam(selectedTeamId);

  const handleCreatePress = () => {
    if (selectedTeamId && selectedTeamId !== ALL_TEAMS_ID) {
      setCreateForTeamId(selectedTeamId);
      setCreateModalVisible(true);
    }
  };

  const handleCreateEvent = async (payload: Parameters<typeof createEvent>[0]) => {
    if (!createForTeamId) return null;
    return createEvent(payload);
  };

  const handleCreateRecurring = async (
    payload: Parameters<typeof createRecurringEvents>[0]
  ) => {
    if (!createForTeamId) return null;
    return createRecurringEvents(payload);
  };

  const handleCreateSuccess = () => {
    fetchEvents();
    setCreateModalVisible(false);
    setCreateForTeamId(null);
  };

  if (teamsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading teams...</Text>
      </View>
    );
  }

  if (teams.length === 0) {
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <NotificationBell />
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
            ) : selectedTeam?.color ? (
              <View
                style={[styles.teamColorDot, { backgroundColor: selectedTeam.color }]}
              />
            ) : null}
            <Text style={styles.teamSelectorText} numberOfLines={1}>
              {selectedTeamName}
            </Text>
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
        {/* Row 2: List/Month toggle centered */}
        <View style={styles.toolbarRow2}>
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[
                styles.viewButton,
                viewMode === 'list' && styles.viewButtonActive,
              ]}
              onPress={() => setViewMode('list')}
            >
              <Text
                style={[
                  styles.viewButtonText,
                  viewMode === 'list' && styles.viewButtonTextActive,
                ]}
              >
                List
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.viewButton,
                viewMode === 'month' && styles.viewButtonActive,
              ]}
              onPress={() => setViewMode('month')}
            >
              <Text
                style={[
                  styles.viewButtonText,
                  viewMode === 'month' && styles.viewButtonTextActive,
                ]}
              >
                Month
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
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
            groupedEvents.map((group, groupIndex) => (
              <View key={groupIndex} style={styles.eventGroup}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                {group.data.map((event) => {
                  const eventDate = parseISO(
                    event.event_date + 'T12:00:00'
                  );
                  const typeConfig = getEventTypeConfig(event.event_type);
                  const barColor =
                    selectedTeamId === ALL_TEAMS_ID && event.team?.color
                      ? event.team.color
                      : typeConfig.color;

                  return (
                    <TouchableOpacity
                      key={event.id}
                      style={[
                        styles.eventCard,
                        event.is_cancelled && { opacity: 0.5 },
                      ]}
                      onPress={() =>
                        navigation.navigate('EventDetail', {
                          event,
                          onRefetch: fetchEvents,
                        })
                      }
                    >
                      {/* Color bar - 4px left edge */}
                      <View
                        style={[
                          styles.eventColorBar,
                          { backgroundColor: barColor },
                        ]}
                      />

                      {/* Date block */}
                      <View style={styles.eventDateBlock}>
                        <Text
                          style={[
                            styles.eventTypeLabel,
                            {
                              color:
                                EVENT_TYPE_LABEL_COLORS[event.event_type] ||
                                typeConfig.color,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {event.event_type === 'other_event'
                            ? 'OTHER'
                            : event.event_type === 'club_event'
                              ? 'CLUB'
                              : event.event_type.toUpperCase()}
                        </Text>
                        <Text
                          style={styles.eventDateDow}
                          numberOfLines={1}
                        >
                          {format(eventDate, 'EEE')}
                        </Text>
                        <Text
                          style={styles.eventDateDay}
                          numberOfLines={1}
                        >
                          {format(eventDate, 'd')}
                        </Text>
                        <Text
                          style={styles.eventDateMonth}
                          numberOfLines={1}
                        >
                          {format(eventDate, 'MMM')}
                        </Text>
                      </View>

                      {/* Event details */}
                      <View style={styles.eventDetails}>
                        {selectedTeamId === ALL_TEAMS_ID && event.team && (
                          <View style={styles.eventTeamBadge}>
                            <View
                              style={[
                                styles.teamDot,
                                {
                                  backgroundColor:
                                    event.team.color || '#8b5cf6',
                                },
                              ]}
                            />
                            <Text style={styles.eventTeamName}>
                              {event.team.name}
                            </Text>
                          </View>
                        )}
                        <Text
                          style={[
                            styles.eventTitle,
                            event.is_cancelled && {
                              textDecorationLine: 'line-through',
                              color: '#64748b',
                            },
                          ]}
                        >
                          {event.title}
                        </Text>
                        <Text style={styles.eventTime}>
                          {event.start_time
                            ? format(
                                parseISO(
                                  `2000-01-01T${event.start_time}`
                                ),
                                'h:mm a'
                              )
                            : 'All Day'}
                        </Text>
                        {event.location_name && (
                          <Text style={styles.eventLocation}>
                            📍 {event.location_name}
                          </Text>
                        )}
                      </View>

                      {/* RSVP buttons */}
                      <View style={styles.rsvpSection}>
                        {event.user_rsvp ? (
                          <View
                            style={[
                              styles.rsvpBadge,
                              event.user_rsvp.status === 'yes' &&
                                styles.rsvpYes,
                              event.user_rsvp.status === 'no' &&
                                styles.rsvpNo,
                              event.user_rsvp.status === 'maybe' &&
                                styles.rsvpMaybe,
                            ]}
                          >
                            <Text style={styles.rsvpBadgeText}>
                              {event.user_rsvp.status === 'yes'
                                ? '✓ Going'
                                : event.user_rsvp.status === 'no'
                                  ? '✗ Not Going'
                                  : '? Maybe'}
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.rsvpButtons}>
                            <TouchableOpacity
                              style={[styles.rsvpBtn, styles.rsvpBtnYes]}
                              onPress={() => handleRsvp(event.id, 'yes')}
                            >
                              <Text style={styles.rsvpBtnText}>✓</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.rsvpBtn, styles.rsvpBtnNo]}
                              onPress={() => handleRsvp(event.id, 'no')}
                            >
                              <Text style={styles.rsvpBtnText}>✗</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      ) : (
        <MonthView
          events={events}
          currentDate={currentDate}
          onDatePress={(date) => setCurrentDate(date)}
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
        />
      )}

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
                      { backgroundColor: team.color || '#8b5cf6' },
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
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <CreateEventModal
        visible={createModalVisible}
        onClose={() => {
          setCreateModalVisible(false);
          setCreateForTeamId(null);
        }}
        onSubmit={handleCreateEvent}
        onCreateRecurring={handleCreateRecurring}
        onSuccess={handleCreateSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#3a3a5e',
    borderRadius: 8,
    padding: 2,
  },
  viewButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewButtonActive: {
    backgroundColor: '#8b5cf6',
  },
  viewButtonText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  viewButtonTextActive: {
    color: '#fff',
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
  groupTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    minHeight: 80,
  },
  eventColorBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  eventDateBlock: {
    width: 52,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#3a3a5e',
  },
  eventTypeLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  eventDateDow: {
    color: '#888',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  eventDateDay: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  eventDateMonth: {
    color: '#888',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  eventDetails: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
    minWidth: 0,
  },
  eventTeamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  eventTeamName: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: '600',
  },
  eventTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  eventTime: {
    color: '#8b5cf6',
    fontSize: 13,
    marginBottom: 2,
  },
  eventLocation: {
    color: '#888',
    fontSize: 12,
  },
  rsvpSection: {
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rsvpBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#3a3a5e',
  },
  rsvpYes: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  rsvpNo: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  rsvpMaybe: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  rsvpBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  rsvpButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  rsvpBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rsvpBtnYes: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
  },
  rsvpBtnNo: {
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
  },
  rsvpBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
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
});

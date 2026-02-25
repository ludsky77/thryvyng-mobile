import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { format, isToday } from 'date-fns';
import type { CalendarEvent } from '../../types';
import { isEventPast } from '../../utils/calendar';

type CalendarEventWithTeam = CalendarEvent & { team?: { color?: string } };

interface WeekViewProps {
  events: CalendarEventWithTeam[];
  onEventPress: (event: CalendarEvent) => void;
  onDayPress: (date: Date) => void;
}

function getEventIcon(eventType: string): string {
  switch (eventType?.toLowerCase()) {
    case 'game':
      return '🏆';
    case 'tournament':
      return '🎯';
    case 'meeting':
      return '👥';
    default:
      return '⚽';
  }
}

function formatEventTime(startTime: string | null): string {
  if (!startTime) return 'All Day';
  const [h, m] = startTime.split(':');
  const hour = parseInt(h || '0', 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m || '00'} ${ampm}`;
}

function getMinutesFromTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map((s) => parseInt(s || '0', 10));
  return h * 60 + m;
}

function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  const aStart = getMinutesFromTime(a.start_time || '00:00');
  const aEnd = a.end_time ? getMinutesFromTime(a.end_time) : aStart + 60;
  const bStart = getMinutesFromTime(b.start_time || '00:00');
  const bEnd = b.end_time ? getMinutesFromTime(b.end_time) : bStart + 60;
  return aStart < bEnd && bStart < aEnd;
}

function groupOverlappingEvents(events: CalendarEvent[]): CalendarEvent[][] {
  if (events.length === 0) return [];

  const sorted = [...events].sort(
    (a, b) =>
      getMinutesFromTime(a.start_time || '00:00') -
      getMinutesFromTime(b.start_time || '00:00')
  );

  const groups: CalendarEvent[][] = [];
  let currentGroup: CalendarEvent[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const event = sorted[i];
    const overlapsWithGroup = currentGroup.some((e) => eventsOverlap(e, event));

    if (overlapsWithGroup) {
      currentGroup.push(event);
    } else {
      groups.push(currentGroup);
      currentGroup = [event];
    }
  }
  groups.push(currentGroup);
  return groups;
}

export function WeekView({
  events,
  onEventPress,
  onDayPress,
}: WeekViewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    return new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - day
    );
  });

  const goToPreviousWeek = () => {
    setCurrentWeekStart(
      (prev) =>
        new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7)
    );
  };

  const goToNextWeek = () => {
    setCurrentWeekStart(
      (prev) =>
        new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7)
    );
  };

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate() + i);
        return date;
      }),
    [currentWeekStart]
  );

  const weekRangeLabel = useMemo(
    () =>
      `${format(weekDays[0], 'MMM d')} – ${format(weekDays[6], 'd, yyyy')}`,
    [weekDays]
  );

  const getEventsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events
      .filter((event) => event.event_date === dateStr)
      .sort((a, b) => {
        const aTime = a.start_time || '00:00';
        const bTime = b.start_time || '00:00';
        const [aH, aM] = aTime.split(':').map(Number);
        const [bH, bM] = bTime.split(':').map(Number);
        return aH * 60 + aM - (bH * 60 + bM);
      });
  };

  return (
    <View style={styles.container}>
      {/* Week navigation header */}
      <View style={styles.weekHeader}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={goToPreviousWeek}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.weekRangeText}>{weekRangeLabel}</Text>
        <TouchableOpacity
          style={styles.navButton}
          onPress={goToNextWeek}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day headers row */}
      <View style={styles.dayHeadersRow}>
        {weekDays.map((date) => {
          const isTodayDate = isToday(date);
          return (
            <TouchableOpacity
              key={date.getTime()}
              style={styles.dayHeaderCell}
              onPress={() => onDayPress(date)}
              activeOpacity={0.7}
            >
              <Text style={styles.dayHeaderAbbr}>
                {format(date, 'EEE')}
              </Text>
              <View
                style={[
                  styles.dayHeaderNumberWrap,
                  isTodayDate && styles.dayHeaderNumberWrapToday,
                ]}
              >
                <Text
                  style={[
                    styles.dayHeaderNumber,
                    isTodayDate && styles.dayHeaderNumberToday,
                  ]}
                >
                  {format(date, 'd')}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Events grid - 7 columns */}
      <ScrollView
        style={styles.gridScroll}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.gridRow}>
          {weekDays.map((date) => {
            const dayEvents = getEventsForDay(date);
            const groups = groupOverlappingEvents(dayEvents);
            return (
              <View key={date.getTime()} style={styles.column}>
                {groups.map((group) => {
                  const totalInGroup = group.length;
                  return (
                    <View
                      key={group.map((e) => e.id).join('-')}
                      style={styles.eventGroupRow}
                    >
                      {group.map((event) => {
                        const past = isEventPast(event);
                        return (
                          <TouchableOpacity
                            key={event.id}
                            style={[
                              styles.eventCard,
                              totalInGroup > 1 && styles.eventCardSideBySide,
                              {
                                backgroundColor: past
                                  ? '#4B5563'
                                  : (event as CalendarEventWithTeam).team?.color ||
                                    '#5B7BB5',
                                opacity: past ? 0.5 : 1,
                                flex: totalInGroup > 1 ? 1 : undefined,
                              },
                            ]}
                            onPress={() => onEventPress(event)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.eventCardTime}>
                              {getEventIcon(event.event_type)}{' '}
                              {formatEventTime(event.start_time)}
                            </Text>
                            <Text
                              style={styles.eventCardTitle}
                              numberOfLines={1}
                            >
                              {event.title}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}
                <View style={styles.columnMinHeight} />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  navButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonText: {
    color: '#8b5cf6',
    fontSize: 28,
    fontWeight: '600',
  },
  weekRangeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dayHeadersRow: {
    flexDirection: 'row',
    height: 50,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  dayHeaderAbbr: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  dayHeaderNumberWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeaderNumberWrapToday: {
    backgroundColor: '#8b5cf6',
  },
  dayHeaderNumber: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  dayHeaderNumberToday: {
    color: '#fff',
  },
  gridScroll: {
    flex: 1,
  },
  gridContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  gridRow: {
    flexDirection: 'row',
    minHeight: 150,
  },
  column: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 2,
    paddingTop: 8,
    position: 'relative',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.1)',
  },
  columnMinHeight: {
    minHeight: 120,
  },
  eventGroupRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 4,
  },
  eventCard: {
    borderRadius: 4,
    padding: 6,
    minHeight: 50,
  },
  eventCardSideBySide: {
    marginBottom: 0,
  },
  eventCardTime: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  eventCardTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
  },
});

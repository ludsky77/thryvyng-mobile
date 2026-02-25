import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { format } from 'date-fns';
import type { CalendarEvent } from '../../types';
import { isEventPast } from '../../utils/calendar';

type CalendarEventWithTeam = CalendarEvent & {
  team?: { color?: string; name?: string };
};

interface DayViewProps {
  events: CalendarEventWithTeam[];
  onEventPress: (event: CalendarEvent) => void;
  initialDate?: Date;
}

const HOUR_HEIGHT = 60;
const START_HOUR = 6;
const END_HOUR = 22;

function getEventIcon(eventType: string): string {
  switch (eventType?.toLowerCase()) {
    case 'game': return '🏆';
    case 'tournament': return '🎯';
    case 'practice': return '⚽';
    case 'meeting': return '👥';
    case 'scrimmage': return '🏆';
    default: return '📅';
  }
}

function getEventDisplayTitle(event: CalendarEvent): string {
  const eventType = (event.event_type || 'event').toUpperCase();
  if (event.event_type?.toLowerCase() === 'game' || event.event_type?.toLowerCase() === 'scrimmage') {
    return `${eventType} vs ${event.opponent || event.title}`;
  }
  return event.title;
}

/** Parse "HH:mm" to minutes since midnight */
function getMinutesFromTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map((s) => parseInt(s || '0', 10));
  return h * 60 + m;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function formatTimeLabel(timeStr: string): string {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h || '0', 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m || '00'} ${ampm}`;
}

function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  const aStart = getMinutesFromTime(a.start_time || '00:00');
  const aEnd = a.end_time
    ? getMinutesFromTime(a.end_time)
    : aStart + 60;
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

export function DayView({
  events,
  onEventPress,
  initialDate,
}: DayViewProps) {
  const [currentDate, setCurrentDate] = useState(
    () => initialDate || new Date()
  );
  const [showConflictBanner, setShowConflictBanner] = useState(true);

  useEffect(() => {
    if (initialDate) {
      setCurrentDate(initialDate);
    }
  }, [initialDate]);

  useEffect(() => {
    setShowConflictBanner(true);
  }, [currentDate]);

  const goToPreviousDay = () => {
    setCurrentDate(
      (prev) =>
        new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1)
    );
  };

  const goToNextDay = () => {
    setCurrentDate(
      (prev) =>
        new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1)
    );
  };

  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const dayEvents = useMemo(
    () =>
      events
        .filter((event) => event.event_date === dateStr)
        .sort(
          (a, b) =>
            getMinutesFromTime(a.start_time || '00:00') -
            getMinutesFromTime(b.start_time || '00:00')
        ),
    [events, dateStr]
  );

  const overlapGroups = useMemo(
    () => groupOverlappingEvents(dayEvents),
    [dayEvents]
  );
  const hasOverlaps = overlapGroups.some((group) => group.length > 1);

  const hours = Array.from(
    { length: END_HOUR - START_HOUR + 1 },
    (_, i) => START_HOUR + i
  );

  const totalGridHeight = hours.length * HOUR_HEIGHT;

  const getEventStyle = (
    event: CalendarEvent,
    columnIndex: number,
    totalColumns: number
  ) => {
    const startMinutes = getMinutesFromTime(event.start_time || '00:00');
    const endMinutes = event.end_time
      ? getMinutesFromTime(event.end_time)
      : startMinutes + 60;
    const duration = endMinutes - startMinutes;

    const gridStartMinutes = START_HOUR * 60;
    const top = ((startMinutes - gridStartMinutes) / 60) * HOUR_HEIGHT;
    const height = Math.max((duration / 60) * HOUR_HEIGHT, 40);

    const gapPercent = 1;
    const totalGaps = (totalColumns - 1) * gapPercent;
    const availableWidth = 100 - totalGaps;
    const columnWidth = availableWidth / totalColumns;
    const left = columnIndex * (columnWidth + gapPercent);

    return {
      position: 'absolute' as const,
      top,
      height,
      left: `${left}%`,
      width: `${columnWidth}%`,
    };
  };

  const renderEvents = () => {
    return overlapGroups.flatMap((group) => {
      const totalColumns = group.length;
      const useCompactLayout = totalColumns >= 4;
      return group.map((event, columnIndex) => {
        const past = isEventPast(event);
        return (
          <TouchableOpacity
            key={event.id}
            style={[
              getEventStyle(event, columnIndex, totalColumns),
              styles.dayEventBlock,
              {
                backgroundColor: past
                  ? '#4B5563'
                  : (event as CalendarEventWithTeam).team?.color || '#5B7BB5',
                opacity: past ? 0.5 : 1,
              },
            ]}
            onPress={() => onEventPress(event)}
            activeOpacity={0.8}
          >
            {useCompactLayout ? (
              <>
                <Text style={styles.eventTitleCompact} numberOfLines={1}>
                  {getEventIcon(event.event_type)} {event.title}
                </Text>
                <Text style={styles.eventTimeCompact}>
                  {event.is_all_day
                    ? 'All Day'
                    : formatTimeLabel(event.start_time || '00:00')}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.eventTitle} numberOfLines={1}>
                  {getEventIcon(event.event_type)} {getEventDisplayTitle(event)}
                </Text>
                {(event as CalendarEventWithTeam).team?.name && (
                  <Text style={styles.eventTeam} numberOfLines={1}>
                    {(event as CalendarEventWithTeam).team?.name}
                  </Text>
                )}
                <Text style={styles.eventTime}>
                  {event.is_all_day
                    ? 'All Day'
                    : event.end_time
                      ? `${formatTimeLabel(event.start_time || '00:00')} – ${formatTimeLabel(event.end_time)}`
                      : formatTimeLabel(event.start_time || '00:00')}
                </Text>
                {(event.home_away || event.uniform) && (
                  <View style={styles.eventMeta}>
                    {event.home_away && (
                      <Text style={styles.eventVenue}>
                        {event.home_away === 'home' ? '🏠 HOME' : event.home_away === 'away' ? '🚗 AWAY' : '📍 NEUTRAL'}
                      </Text>
                    )}
                    {event.uniform && (
                      <Text style={styles.eventUniform}>👕 {event.uniform}</Text>
                    )}
                  </View>
                )}
              </>
            )}
          </TouchableOpacity>
        );
      });
    });
  };

  return (
    <View style={styles.container}>
      {/* Day navigation header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={goToPreviousDay}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerDate}>
            {format(currentDate, 'EEEE, MMM d')}
          </Text>
          <Text style={styles.headerCount}>
            {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.navButton}
          onPress={goToNextDay}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Conflict warning banner */}
      {hasOverlaps && showConflictBanner && (
        <View style={styles.conflictBanner}>
          <View style={styles.conflictBannerContent}>
            <Text style={styles.conflictBannerText}>
              ⚠️ Schedule conflict detected
            </Text>
          </View>
          <TouchableOpacity
            style={styles.conflictBannerClose}
            onPress={() => setShowConflictBanner(false)}
          >
            <Text style={styles.conflictBannerCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Time grid */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.gridRow}>
          {/* Time labels column */}
          <View style={styles.timeColumn}>
            {hours.map((hour) => (
              <View
                key={hour}
                style={[styles.hourCell, { height: HOUR_HEIGHT }]}
              >
                <Text style={styles.hourLabel}>
                  {formatHourLabel(hour)}
                </Text>
              </View>
            ))}
          </View>

          {/* Events area */}
          <View style={[styles.eventsColumn, { minHeight: totalGridHeight }]}>
            {/* Hour grid lines */}
            {hours.map((hour) => (
              <View
                key={hour}
                style={[
                  styles.hourLine,
                  { height: HOUR_HEIGHT },
                ]}
              />
            ))}
            {/* Events positioned absolutely */}
            {renderEvents()}
          </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 8,
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
  headerCenter: {
    alignItems: 'center',
  },
  headerDate: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerCount: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 2,
  },
  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  conflictBannerContent: {
    flex: 1,
  },
  conflictBannerText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '500',
  },
  conflictBannerClose: {
    padding: 4,
    marginLeft: 8,
  },
  conflictBannerCloseText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  gridRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  timeColumn: {
    width: 50,
  },
  hourCell: {
    justifyContent: 'flex-start',
  },
  hourLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: -6,
  },
  eventsColumn: {
    flex: 1,
    position: 'relative',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.1)',
  },
  hourLine: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  dayEventBlock: {
    borderRadius: 6,
    padding: 10,
    overflow: 'hidden',
  },
  eventTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  eventTeam: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  eventTime: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  eventMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  eventVenue: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    fontWeight: '500',
  },
  eventUniform: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    fontWeight: '500',
  },
  eventTitleCompact: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  eventTimeCompact: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 9,
  },
});

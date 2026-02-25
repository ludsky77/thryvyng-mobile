import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns';
import type { CalendarEvent } from '../../types';
import { isEventPast } from '../../utils/calendar';

type CalendarEventWithTeam = CalendarEvent & { team?: { color?: string } };

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDayPress: (date: Date) => void;
  onEventPress: (event: CalendarEvent) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const MAX_VISIBLE_EVENTS = 2;

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

export function MonthView({
  currentDate,
  events,
  onDayPress,
  onEventPress,
  onPrevMonth,
  onNextMonth,
}: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const getEventsForDate = (date: Date) => {
    return events.filter((event) => {
      const eventDate = event.event_date;
      if (!eventDate) return false;
      const eventDay = new Date(eventDate + 'T12:00:00');
      return isSameDay(eventDay, date);
    });
  };

  const renderDays = () => {
    const days = [];
    let day = calendarStart;

    while (day <= calendarEnd) {
      const currentDay = new Date(day);
      const dayEvents = getEventsForDate(currentDay);
      const isCurrentMonth = isSameMonth(currentDay, currentDate);
      const isCurrentDay = isToday(currentDay);

      days.push(
        <TouchableOpacity
          key={currentDay.toISOString()}
          style={[
            styles.dayCell,
            !isCurrentMonth && styles.dayCellOutside,
            isCurrentDay && styles.dayCellToday,
          ]}
          onPress={() => onDayPress(currentDay)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.dayNumber,
              !isCurrentMonth && styles.dayNumberOutside,
              isCurrentDay && styles.dayNumberToday,
            ]}
          >
            {format(currentDay, 'd')}
          </Text>

          <View style={styles.eventsContainer}>
            {dayEvents.slice(0, MAX_VISIBLE_EVENTS).map((event) => {
              const past = isEventPast(event);
              return (
              <TouchableOpacity
                key={event.id}
                style={[
                  styles.eventChip,
                  {
                    backgroundColor: past
                      ? '#4B5563'
                      : (event as CalendarEventWithTeam).team?.color || '#5B7BB5',
                    opacity: past ? 0.5 : 1,
                  },
                ]}
                onPress={() => onEventPress(event)}
              >
                <Text style={styles.eventChipText} numberOfLines={1}>
                  {getEventIcon(event.event_type)} {event.title}
                </Text>
              </TouchableOpacity>
            );
            })}
            {dayEvents.length > MAX_VISIBLE_EVENTS && (
              <TouchableOpacity onPress={() => onDayPress(currentDay)}>
                <Text style={styles.moreEvents}>
                  +{dayEvents.length - MAX_VISIBLE_EVENTS} more
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      );

      day = addDays(day, 1);
    }

    return days;
  };

  return (
    <View style={styles.container}>
      {/* Month Header */}
      <View style={styles.monthHeader}>
        <TouchableOpacity onPress={onPrevMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{format(currentDate, 'MMMM yyyy')}</Text>
        <TouchableOpacity onPress={onNextMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Weekday Headers */}
      <View style={styles.weekdayHeader}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <Text key={d} style={styles.weekdayText}>
            {d}
          </Text>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>{renderDays()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navButton: {
    padding: 8,
  },
  navButtonText: {
    color: '#8b5cf6',
    fontSize: 28,
    fontWeight: '300',
  },
  monthTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  weekdayHeader: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
  },
  dayCell: {
    width: '14.28%',
    minHeight: 70,
    padding: 2,
    borderWidth: 0.5,
    borderColor: '#2a2a4e',
  },
  dayCellOutside: {
    backgroundColor: '#151525',
  },
  dayCellToday: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  dayNumber: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 2,
  },
  dayNumberOutside: {
    color: '#444',
  },
  dayNumberToday: {
    color: '#a78bfa',
    fontWeight: '700',
  },
  eventsContainer: {
    flex: 1,
  },
  eventChip: {
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginBottom: 2,
  },
  eventChipText: {
    color: '#fff',
    fontSize: 10,
  },
  moreEvents: {
    color: '#9CA3AF',
    fontSize: 9,
    marginTop: 2,
  },
});

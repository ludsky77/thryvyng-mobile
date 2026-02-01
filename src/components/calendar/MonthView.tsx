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
import { getEventTypeConfig } from '../../types';

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDatePress: (date: Date) => void;
  onEventPress: (event: CalendarEvent) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function MonthView({
  currentDate,
  events,
  onDatePress,
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
          onPress={() => onDatePress(currentDay)}
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
            {dayEvents.slice(0, 3).map((event) => {
              const typeConfig = getEventTypeConfig(event.event_type);
              return (
                <TouchableOpacity
                  key={event.id}
                  style={[styles.eventDot, { backgroundColor: typeConfig.color }]}
                  onPress={() => onEventPress(event)}
                >
                  <Text style={styles.eventDotText} numberOfLines={1}>
                    {event.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {dayEvents.length > 3 && (
              <Text style={styles.moreEvents}>+{dayEvents.length - 3}</Text>
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
  eventDot: {
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    marginBottom: 2,
  },
  eventDotText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '500',
  },
  moreEvents: {
    color: '#666',
    fontSize: 9,
    textAlign: 'center',
  },
});

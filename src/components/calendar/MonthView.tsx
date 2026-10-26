import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
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
import EventPill, { CalendarEventWithTeam, TeamDots } from './EventPill';

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEventWithTeam[];
  /** Fired so the screen's date follows the grid; it does NOT change view. */
  onDayPress: (date: Date) => void;
  onEventPress: (event: CalendarEvent) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Off when the calendar is already filtered to one team. */
  showTeamNames?: boolean;
}

/**
 * Ruling R-D: a month cell carries TEAM-COLOUR DOTS -- up to three, then "+n"
 * -- and tapping a day opens that day's pills UNDER the grid. The old cell
 * crammed two full-width event chips with title text into a ~50pt box, which
 * is what made every month cell unreadable at 375pt; and tapping a day left
 * the month entirely for the Day view.
 */
const MAX_DOTS = 3;

function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function minutesOf(timeStr: string | null): number {
  const [h, m] = (timeStr || '00:00').split(':').map((s) => parseInt(s || '0', 10));
  return h * 60 + m;
}

export function MonthView({
  currentDate,
  events,
  onDayPress,
  onEventPress,
  onPrevMonth,
  onNextMonth,
  showTeamNames = true,
}: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const monthKey = format(currentDate, 'yyyy-MM');

  const [selectedDay, setSelectedDay] = useState<Date>(currentDate);

  // Changing month keeps the selection on a day the grid is actually showing:
  // today when the new month is this one, otherwise the 1st. A selection that
  // is ALREADY in the new month survives -- which is what happens when the day
  // tapped was a trailing cell (tap Nov 1 from October: the grid follows to
  // November and Nov 1 stays selected, instead of snapping to the 1st).
  useEffect(() => {
    setSelectedDay((prev) => {
      if (isSameMonth(prev, monthStart)) return prev;
      const today = new Date();
      return isSameMonth(today, monthStart) ? today : monthStart;
    });
    // monthKey, not monthStart: a new Date object every render would loop.
  }, [monthKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** One pass over the range, not one filter per cell. */
  const eventsByDate = useMemo(() => {
    const byDate = new Map<string, CalendarEventWithTeam[]>();
    events.forEach((event) => {
      if (!event.event_date) return;
      const bucket = byDate.get(event.event_date);
      if (bucket) bucket.push(event);
      else byDate.set(event.event_date, [event]);
    });
    byDate.forEach((list) =>
      list.sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time))
    );
    return byDate;
  }, [events]);

  const handleDayPress = (date: Date) => {
    setSelectedDay(date);
    onDayPress(date);
  };

  const renderDays = () => {
    const days = [];
    let day = calendarStart;

    while (day <= calendarEnd) {
      const currentDay = new Date(day);
      const dayEvents = eventsByDate.get(dayKey(currentDay)) || [];
      const isCurrentMonth = isSameMonth(currentDay, currentDate);
      const isCurrentDay = isToday(currentDay);
      const isSelected = isSameDay(currentDay, selectedDay);

      days.push(
        <TouchableOpacity
          key={currentDay.toISOString()}
          style={[
            styles.dayCell,
            !isCurrentMonth && styles.dayCellOutside,
            isCurrentDay && styles.dayCellToday,
            isSelected && styles.dayCellSelected,
          ]}
          onPress={() => handleDayPress(currentDay)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.dayNumber,
              !isCurrentMonth && styles.dayNumberOutside,
              isCurrentDay && styles.dayNumberToday,
            ]}
            numberOfLines={1}
          >
            {format(currentDay, 'd')}
          </Text>
          <TeamDots events={dayEvents} max={MAX_DOTS} size={6} />
        </TouchableOpacity>
      );

      day = addDays(day, 1);
    }

    return days;
  };

  const selectedEvents = eventsByDate.get(dayKey(selectedDay)) || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator
    >
      <View style={styles.monthHeader}>
        <TouchableOpacity onPress={onPrevMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle} numberOfLines={1}>
          {format(currentDate, 'MMMM yyyy')}
        </Text>
        <TouchableOpacity onPress={onNextMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekdayHeader}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <Text key={d} style={styles.weekdayText} numberOfLines={1}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>{renderDays()}</View>

      {/* The tapped day, under the grid. */}
      <View style={styles.dayPanel}>
        <Text style={styles.dayPanelTitle} numberOfLines={1}>
          {format(selectedDay, 'EEEE, MMM d')}
        </Text>
        {selectedEvents.length === 0 ? (
          <Text style={styles.dayPanelEmpty}>No events</Text>
        ) : (
          selectedEvents.map((event) => (
            <EventPill
              key={event.id}
              event={event}
              onPress={onEventPress}
              showTeam={showTeamNames}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scrollContent: {
    paddingBottom: 100,
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
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
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
    minWidth: 0,
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
  // Percentage width, not a fixed one: the cell has to hold at 375pt and wider.
  dayCell: {
    width: '14.28%',
    minHeight: 46,
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 2,
    borderWidth: 0.5,
    borderColor: '#2a2a4e',
    alignItems: 'center',
  },
  dayCellOutside: {
    backgroundColor: '#151525',
  },
  dayCellToday: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  dayCellSelected: {
    borderWidth: 1.5,
    borderColor: '#8b5cf6',
  },
  dayNumber: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
  },
  dayNumberOutside: {
    color: '#444',
  },
  dayNumberToday: {
    color: '#a78bfa',
    fontWeight: '700',
  },
  dayPanel: {
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  dayPanelTitle: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  dayPanelEmpty: {
    color: '#4b5563',
    fontSize: 13,
  },
});

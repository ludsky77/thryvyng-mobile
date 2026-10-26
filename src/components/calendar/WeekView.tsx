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
import EventPill, { CalendarEventWithTeam } from './EventPill';

interface WeekViewProps {
  events: CalendarEventWithTeam[];
  onEventPress: (event: CalendarEvent) => void;
  onDayPress: (date: Date) => void;
  /** Off when the calendar is already filtered to one team. */
  showTeamNames?: boolean;
}

/**
 * Ruling R-C: the week is SEVEN ROWS, one per day, each holding compact pills.
 * The 7-column time grid is gone, and with it the overlap/column maths it
 * needed -- at 375pt a column was ~50pt wide, which is why every event in it
 * was a two-word stub. A row gives the pill the full width, so the time, the
 * title and the team all fit on one line (R-G).
 *
 * Tapping the day gutter still opens that day; tapping a pill opens the event.
 */
function startOfWeekSunday(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - date.getDay()
  );
}

function minutesOf(timeStr: string | null): number {
  const [h, m] = (timeStr || '00:00').split(':').map((s) => parseInt(s || '0', 10));
  return h * 60 + m;
}

export function WeekView({
  events,
  onEventPress,
  onDayPress,
  showTeamNames = true,
}: WeekViewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeekSunday(new Date())
  );

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
    () => `${format(weekDays[0], 'MMM d')} – ${format(weekDays[6], 'd, yyyy')}`,
    [weekDays]
  );

  /** One pass over the range, not one filter per day. */
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

  return (
    <View style={styles.container}>
      <View style={styles.weekHeader}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={goToPreviousWeek}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.weekRangeText} numberOfLines={1}>
          {weekRangeLabel}
        </Text>
        <TouchableOpacity
          style={styles.navButton}
          onPress={goToNextWeek}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        {weekDays.map((date) => {
          const dayEvents = eventsByDate.get(format(date, 'yyyy-MM-dd')) || [];
          const today = isToday(date);
          return (
            <View
              key={date.getTime()}
              style={[styles.dayRow, today && styles.dayRowToday]}
            >
              <TouchableOpacity
                style={styles.dayGutter}
                onPress={() => onDayPress(date)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.dayAbbr, today && styles.dayAbbrToday]}
                  numberOfLines={1}
                >
                  {format(date, 'EEE')}
                </Text>
                <View style={[styles.dayNumWrap, today && styles.dayNumWrapToday]}>
                  <Text style={styles.dayNum} numberOfLines={1}>
                    {format(date, 'd')}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.dayEvents}>
                {dayEvents.length === 0 ? (
                  <Text style={styles.noEvents}>—</Text>
                ) : (
                  dayEvents.map((event) => (
                    <EventPill
                      key={event.id}
                      event={event}
                      onPress={onEventPress}
                      showTeam={showTeamNames}
                    />
                  ))
                )}
              </View>
            </View>
          );
        })}
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
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  dayRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  dayRowToday: {
    backgroundColor: 'rgba(139, 92, 246, 0.10)',
  },
  // The gutter is the one fixed width in the view, and it is narrow enough to
  // leave a usable pill at 375pt.
  dayGutter: {
    width: 46,
    flexShrink: 0,
    alignItems: 'center',
    paddingTop: 2,
  },
  dayAbbr: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  dayAbbrToday: {
    color: '#c4b5fd',
  },
  dayNumWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumWrapToday: {
    backgroundColor: '#8b5cf6',
  },
  dayNum: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  dayEvents: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 10,
    paddingBottom: 4,
    justifyContent: 'center',
  },
  noEvents: {
    color: '#4b5563',
    fontSize: 13,
    paddingBottom: 10,
  },
});

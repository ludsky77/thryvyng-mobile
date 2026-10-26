import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { format, isToday } from 'date-fns';
import type { CalendarEvent } from '../../types';
import { CalendarEventWithTeam, TeamDots } from './EventPill';

/**
 * Generic over the event so the card renderer keeps the caller's own richer
 * event type (its `team` is a UserTeam, not just a colour) instead of being
 * handed back a widened one.
 */
interface DayViewProps<E extends CalendarEventWithTeam> {
  events: E[];
  initialDate?: Date;
  /**
   * The list card (ruling R-D: "the existing H1 cards"). It is passed in
   * rather than rebuilt here so the Day view and the List view are literally
   * the same card -- same leaf, same frame, same footer RSVP pill, same single
   * write path -- and cannot drift the way the two list renderers once did.
   */
  renderEventCard: (event: E) => React.ReactNode;
}

/**
 * Ruling R-D: Day is a SEVEN-DAY STRIP with team-colour dots over the H1 cards.
 * The 6am-10pm time grid is gone: it put a 16-hour canvas on screen to show
 * two events, pushed an evening game below the fold, and sized every block by
 * duration instead of by what it had to say.
 */
function minutesOf(timeStr: string | null): number {
  const [h, m] = (timeStr || '00:00').split(':').map((s) => parseInt(s || '0', 10));
  return h * 60 + m;
}

function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  const aStart = minutesOf(a.start_time);
  const aEnd = a.end_time ? minutesOf(a.end_time) : aStart + 60;
  const bStart = minutesOf(b.start_time);
  const bEnd = b.end_time ? minutesOf(b.end_time) : bStart + 60;
  return aStart < bEnd && bStart < aEnd;
}

/** Any two timed events sharing a minute. Drives the conflict banner only. */
function hasOverlap(events: CalendarEvent[]): boolean {
  const timed = events.filter((e) => !e.is_all_day && e.start_time);
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (eventsOverlap(timed[i], timed[j])) return true;
    }
  }
  return false;
}

function startOfWeekSunday(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - date.getDay()
  );
}

export function DayView<E extends CalendarEventWithTeam>({
  events,
  initialDate,
  renderEventCard,
}: DayViewProps<E>) {
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

  /** One pass over the range: the strip needs all seven days, not just one. */
  const eventsByDate = useMemo(() => {
    const byDate = new Map<string, E[]>();
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

  const weekDays = useMemo(() => {
    const start = startOfWeekSunday(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [currentDate]);

  const dayEvents = useMemo(
    () => eventsByDate.get(format(currentDate, 'yyyy-MM-dd')) || [],
    [eventsByDate, currentDate]
  );

  const conflict = useMemo(() => hasOverlap(dayEvents), [dayEvents]);

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
          <Text style={styles.headerDate} numberOfLines={1}>
            {format(currentDate, 'EEEE, MMM d')}
          </Text>
          <Text style={styles.headerCount} numberOfLines={1}>
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

      {/* R-D: the 7-day strip, dots and all. */}
      <View style={styles.strip}>
        {weekDays.map((date) => {
          const selected = format(date, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd');
          const today = isToday(date);
          return (
            <TouchableOpacity
              key={date.getTime()}
              style={[styles.stripDay, selected && styles.stripDaySelected]}
              onPress={() => setCurrentDate(date)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.stripAbbr, today && styles.stripAbbrToday]}
                numberOfLines={1}
              >
                {format(date, 'EEEEE')}
              </Text>
              <Text
                style={[styles.stripNum, today && styles.stripNumToday]}
                numberOfLines={1}
              >
                {format(date, 'd')}
              </Text>
              <TeamDots
                events={eventsByDate.get(format(date, 'yyyy-MM-dd')) || []}
                max={3}
                size={5}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {conflict && showConflictBanner && (
        <View style={styles.conflictBanner}>
          <Text style={styles.conflictBannerText} numberOfLines={2}>
            ⚠️ Schedule conflict detected
          </Text>
          <TouchableOpacity
            style={styles.conflictBannerClose}
            onPress={() => setShowConflictBanner(false)}
          >
            <Text style={styles.conflictBannerCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        {dayEvents.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No events this day</Text>
          </View>
        ) : (
          dayEvents.map((event) => renderEventCard(event))
        )}
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
    flex: 1,
    minWidth: 0,
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
  // Seven equal columns, no fixed widths: holds at 375pt and wider (R-G).
  strip: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  stripDay: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 10,
    gap: 2,
  },
  stripDaySelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.22)',
  },
  stripAbbr: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '600',
  },
  stripAbbrToday: {
    color: '#c4b5fd',
  },
  stripNum: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stripNumToday: {
    color: '#c4b5fd',
  },
  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    gap: 8,
  },
  conflictBannerText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
    minWidth: 0,
  },
  conflictBannerClose: {
    padding: 4,
    flexShrink: 0,
  },
  conflictBannerCloseText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 100,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 10,
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
  },
});

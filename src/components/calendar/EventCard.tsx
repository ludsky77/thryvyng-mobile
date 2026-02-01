import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CalendarEvent } from '../../types';
import { getEventTypeConfig } from '../../types';
import { openInMaps } from '../../lib/maps';

interface EventCardProps {
  event: CalendarEvent;
  onRsvp?: (eventId: string, status: 'yes' | 'maybe' | 'no') => void;
  rsvping?: boolean;
  onRefetch?: () => void;
}

function formatTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h || '0', 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m || '00'} ${ampm}`;
}

function formatDateBadge(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  d.setHours(0, 0, 0, 0);

  if (d.getTime() === today.getTime()) return 'TODAY';
  if (d.getTime() === tomorrow.getTime()) return 'TOMORROW';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function EventCard({ event, onRsvp, rsvping = false, onRefetch }: EventCardProps) {
  const navigation = useNavigation();
  const isCancelled = event.is_cancelled;
  const typeConfig = getEventTypeConfig(event.event_type);
  const timeStr = event.is_all_day
    ? 'All day'
    : [event.start_time, event.end_time].filter(Boolean).map(formatTime).join(' – ') || '—';
  const dateBadge = formatDateBadge(event.event_date);
  const counts = event.rsvp_counts || { yes: 0, no: 0, maybe: 0, pending: 0 };
  const userStatus = event.user_rsvp?.status;

  const handleCardPress = () => {
    navigation.navigate('EventDetail', { event, onRefetch });
  };

  return (
    <TouchableOpacity onPress={handleCardPress} activeOpacity={0.7}>
      <View
        style={[
          styles.card,
          { borderLeftColor: typeConfig.color },
          isCancelled && styles.cardCancelled,
        ]}
      >
      {isCancelled && (
        <View style={styles.cancelledOverlay}>
          <Text style={styles.cancelledBadge}>CANCELLED</Text>
        </View>
      )}

      <View style={styles.row}>
        <View style={[styles.dateBadge, { borderLeftColor: typeConfig.color }]}>
          <Text style={styles.dateBadgeText}>{dateBadge}</Text>
        </View>
      </View>

      <Text style={styles.title}>{event.title}</Text>

      <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '33' }]}>
        <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
          {typeConfig.icon} {typeConfig.label}
        </Text>
      </View>

      <View style={styles.meta}>
        <Text style={styles.metaText}>🕐 {timeStr}</Text>
        {(event.location_name || event.location_address) && (
          <TouchableOpacity
            onPress={() =>
              openInMaps(
                event.location_address || '',
                event.location_name || undefined
              )
            }
            style={styles.locationContainer}
          >
            <Text style={styles.locationIcon}>📍</Text>
            <View style={styles.locationTextContainer}>
              {event.location_name && (
                <Text style={styles.locationName}>{event.location_name}</Text>
              )}
              {event.location_address && (
                <Text style={styles.locationAddress}>
                  {event.location_address}
                </Text>
              )}
              <Text style={styles.openMapsLink}>Tap to open in Maps</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {!isCancelled && onRsvp && (
        <View style={styles.rsvpSection}>
          <View style={styles.rsvpButtons}>
            <TouchableOpacity
              style={[
                styles.rsvpButton,
                styles.rsvpGoing,
                userStatus === 'yes' && styles.rsvpSelected,
              ]}
              onPress={() => onRsvp?.(event.id, 'yes')}
              disabled={rsvping}
            >
              <Text style={styles.rsvpButtonText}>Going</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.rsvpButton,
                styles.rsvpMaybe,
                userStatus === 'maybe' && styles.rsvpSelected,
              ]}
              onPress={() => onRsvp?.(event.id, 'maybe')}
              disabled={rsvping}
            >
              <Text style={styles.rsvpButtonText}>Maybe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.rsvpButton,
                styles.rsvpNotGoing,
                userStatus === 'no' && styles.rsvpSelected,
              ]}
              onPress={() => onRsvp?.(event.id, 'no')}
              disabled={rsvping}
            >
              <Text style={styles.rsvpButtonText}>Not Going</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.rsvpCounts}>
            <Text style={styles.rsvpCountText}>
              ✓ {counts.yes}  ○ {counts.maybe}  ✕ {counts.no}
            </Text>
          </View>
        </View>
      )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
    position: 'relative',
  },
  cardCancelled: {
    opacity: 0.85,
  },
  cancelledOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  cancelledBadge: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
    borderLeftWidth: 3,
  },
  dateBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  meta: {
    gap: 4,
  },
  metaText: {
    color: '#999',
    fontSize: 13,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  locationIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  locationTextContainer: {
    flex: 1,
  },
  locationName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  locationAddress: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
  openMapsLink: {
    color: '#8b5cf6',
    fontSize: 12,
    marginTop: 4,
  },
  rsvpSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#3a3a6e',
  },
  rsvpButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  rsvpButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  rsvpGoing: {
    backgroundColor: '#166534',
  },
  rsvpMaybe: {
    backgroundColor: '#854d0e',
  },
  rsvpNotGoing: {
    backgroundColor: '#7f1d1d',
  },
  rsvpSelected: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  rsvpButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  rsvpCounts: {
    marginTop: 8,
  },
  rsvpCountText: {
    color: '#888',
    fontSize: 11,
  },
});

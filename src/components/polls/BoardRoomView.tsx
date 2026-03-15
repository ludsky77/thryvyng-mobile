import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { BoardVoteParticipant } from '../../hooks/useBoardVoteView';
import { VoterSeat } from './VoterSeat';
import { BoardVoteResults } from './BoardVoteResults';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const OVAL_WIDTH = Math.min(320, SCREEN_WIDTH - 48);
const OVAL_HEIGHT = 200;
const SEAT_RADIUS = 60;
const TABLE_WIDTH = 100;
const TABLE_HEIGHT = 50;

interface BoardRoomViewProps {
  pollId: string;
  channelId: string;
  question: string;
  participants: BoardVoteParticipant[];
}

export function BoardRoomView({
  question,
  participants,
}: BoardRoomViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stats = useMemo(
    () => ({
      yes: participants.filter((p) => p.status === 'yes').length,
      no: participants.filter((p) => p.status === 'no').length,
      pending: participants.filter((p) => p.status === 'pending').length,
      unread: participants.filter((p) => p.status === 'unread').length,
    }),
    [participants]
  );

  const seatPositions = useMemo(() => {
    const n = participants.length || 1;
    const positions: { x: number; y: number }[] = [];
    const cx = OVAL_WIDTH / 2;
    const cy = OVAL_HEIGHT / 2 + 20;
    const a = OVAL_WIDTH / 2 - 40;
    const b = OVAL_HEIGHT / 2 - 20;

    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const x = cx + a * Math.cos(angle);
      const y = cy + b * Math.sin(angle);
      positions.push({ x, y });
    }
    return positions;
  }, [participants.length]);

  return (
    <View style={styles.container}>
      <Text style={styles.question} numberOfLines={2}>
        {question}
      </Text>

      <View style={[styles.ovalContainer, { width: OVAL_WIDTH, height: OVAL_HEIGHT + 60 }]}>
        {/* Wood-grain table */}
        <LinearGradient
          colors={['#3d2914', '#2d1f0f', '#3d2914']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.table,
            {
              width: TABLE_WIDTH,
              height: TABLE_HEIGHT,
              left: (OVAL_WIDTH - TABLE_WIDTH) / 2,
              top: (OVAL_HEIGHT - TABLE_HEIGHT) / 2 + 20,
            },
          ]}
        />

        {/* Seats around the oval */}
        {participants.map((p, i) => (
          <View
            key={p.id}
            style={[
              styles.seatWrapper,
              {
                left: (seatPositions[i]?.x ?? 0) - 24,
                top: (seatPositions[i]?.y ?? 0) - 24,
              },
            ]}
          >
            <VoterSeat
              participant={p}
              size="normal"
              isSelected={selectedId === p.id}
              onPress={() => setSelectedId(selectedId === p.id ? null : p.id)}
            />
          </View>
        ))}
      </View>

      <BoardVoteResults stats={stats} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  question: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 24,
  },
  ovalContainer: {
    position: 'relative',
    alignSelf: 'center',
  },
  table: {
    position: 'absolute',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(125, 80, 30, 0.5)',
  },
  seatWrapper: {
    position: 'absolute',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

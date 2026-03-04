import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { BoardVoteParticipant } from '../../hooks/useBoardVoteView';
import { VoterSeat } from './VoterSeat';
import { BoardVoteResults } from './BoardVoteResults';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTAINER_WIDTH = Math.min(360, SCREEN_WIDTH - 32);
const SEATS_PER_ROW = [5, 7, 7];
const ROW_HEIGHT = 52;
const SEAT_SIZE = 40;

interface SenateViewProps {
  pollId: string;
  channelId: string;
  question: string;
  participants: BoardVoteParticipant[];
}

function distributeInRows<T>(items: T[], perRow: number[]): T[][] {
  const rows: T[][] = [];
  let idx = 0;
  for (const count of perRow) {
    if (idx >= items.length) break;
    rows.push(items.slice(idx, idx + count));
    idx += count;
  }
  if (idx < items.length) {
    rows.push(items.slice(idx));
  }
  return rows;
}

export function SenateView({
  question,
  participants,
}: SenateViewProps) {
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

  const rows = useMemo(
    () => distributeInRows(participants, SEATS_PER_ROW),
    [participants]
  );

  return (
    <View style={styles.container}>
      {/* Podium / board with question */}
      <LinearGradient
        colors={['#1e293b', '#334155']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.podium}
      >
        <Text style={styles.question} numberOfLines={2}>
          {question}
        </Text>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((p, seatIndex) => {
              const totalInRow = row.length;
              const curveOffset = Math.abs(
                (seatIndex - (totalInRow - 1) / 2) * 8
              );
              const yOffset = curveOffset * (rowIndex + 1);

              return (
                <View
                  key={p.id}
                  style={[
                    styles.seatWrapper,
                    {
                      marginTop: yOffset,
                    },
                  ]}
                >
                  <VoterSeat
                    participant={p}
                    size="small"
                    isSelected={selectedId === p.id}
                    onPress={() =>
                      setSelectedId(selectedId === p.id ? null : p.id)
                    }
                  />
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <BoardVoteResults stats={stats} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    maxHeight: 480,
  },
  podium: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#475569',
  },
  question: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  scroll: {
    maxHeight: 280,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: 4,
  },
  seatWrapper: {
    width: SEAT_SIZE,
    height: SEAT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

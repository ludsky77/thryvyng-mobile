import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useBoardVoteView } from '../../hooks/useBoardVoteView';
import { BoardRoomView } from './BoardRoomView';
import { SenateView } from './SenateView';

interface BoardVoteContainerProps {
  pollId: string;
  channelId: string;
  question: string;
}

export function BoardVoteContainer({
  pollId,
  channelId,
  question,
}: BoardVoteContainerProps) {
  const { participants, isLoading, error, markAsViewed } = useBoardVoteView(
    pollId,
    channelId
  );

  useEffect(() => {
    markAsViewed();
  }, [markAsViewed]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading board...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>
          Failed to load participants. Please try again.
        </Text>
      </View>
    );
  }

  if (participants.length <= 10) {
    return (
      <BoardRoomView
        pollId={pollId}
        channelId={channelId}
        question={question}
        participants={participants}
      />
    );
  }

  return (
    <SenateView
      pollId={pollId}
      channelId={channelId}
      question={question}
      participants={participants}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    padding: 48,
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#94a3b8',
  },
  error: {
    padding: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    fontSize: 14,
    color: '#fca5a5',
    textAlign: 'center',
  },
});

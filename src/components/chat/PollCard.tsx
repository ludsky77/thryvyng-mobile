import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { usePoll } from '../../hooks/usePolls';
import { supabase } from '../../lib/supabase';

interface PollCardProps {
  pollId: string;
  compact?: boolean;
  isStaffInChannel?: boolean;
}

function getTimeRemaining(endsAt: string): string {
  const now = new Date();
  const end = new Date(endsAt);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `Ends in ${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `Ends in ${hours} hour${hours > 1 ? 's' : ''}`;
  return 'Ends soon';
}

export function PollCard({ pollId, compact = false, isStaffInChannel = false }: PollCardProps) {
  // 1. ALL HOOKS FIRST (before any conditions or returns)
  const { user } = useAuth();
  const { poll, loading, vote, removeVote, closePoll } = usePoll(pollId);
  const [voting, setVoting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [nonVoters, setNonVoters] = useState<string[]>([]);
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);

  // 2. Derived values (safe when poll is null)
  const totalVotes = poll?.options?.reduce((sum, opt) => sum + (opt.vote_count || 0), 0) ?? 0;
  const isCreator = poll?.created_by === user?.id;
  const canSendReminder = isStaffInChannel || isCreator;

  // 3. useCallback - must be before useEffect
  const fetchNonVoters = useCallback(async () => {
    if (!poll?.id || !poll?.channel_id) return;

    try {
      const { data: channelMembers } = await supabase
        .from('comm_channel_members')
        .select('user_id')
        .eq('channel_id', poll.channel_id);

      const { data: votes } = await supabase
        .from('comm_poll_votes')
        .select('user_id')
        .eq('poll_id', poll.id);

      const votedUserIds = votes?.map((v: { user_id: string }) => v.user_id) || [];
      const nonVoterIds =
        channelMembers
          ?.filter((cm: { user_id: string }) => !votedUserIds.includes(cm.user_id))
          .map((cm: { user_id: string }) => cm.user_id) || [];

      setNonVoters(nonVoterIds);
    } catch (err) {
      console.error('[PollCard] Error fetching non-voters:', err);
      setNonVoters([]);
    }
  }, [poll?.id, poll?.channel_id]);

  // 4. useEffect
  useEffect(() => {
    if (poll?.id && poll?.channel_id && canSendReminder) {
      fetchNonVoters();
    }
  }, [poll?.id, poll?.channel_id, canSendReminder, fetchNonVoters, totalVotes]);

  // 5. Early return (after all hooks)
  if (loading || !poll) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading poll...</Text>
      </View>
    );
  }

  // 6. Derived values (poll is guaranteed after early return)
  const userVotedOptionIds = poll.user_votes?.map(v => v.option_id) || [];
  const hasVoted = userVotedOptionIds.length > 0;
  const isExpired = poll.ends_at && new Date(poll.ends_at) < new Date();
  const isClosed = !poll.is_active || isExpired;
  const canClose = isStaffInChannel || isCreator;
  const showResults = hasVoted || isClosed || poll.show_results_live;

  // 7. Functions
  const handleSendPollReminder = async () => {
    if (nonVoters.length === 0 || reminderSending || !poll) return;

    setReminderSending(true);

    try {
      const timeRemaining = poll.ends_at ? getTimeRemaining(poll.ends_at) : '';

      const { error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          user_ids: nonVoters,
          title: '📊 Your Vote Needed',
          body: `"${poll.question}"${timeRemaining ? ` - ${timeRemaining}` : ''} - Vote now!`,
          type: 'poll_reminder',
          data: {
            reference_type: 'poll',
            reference_id: poll.id,
            channel_id: poll.channel_id,
          },
        },
      });

      if (error) throw error;

      setReminderSent(true);
      Alert.alert('Reminder Sent', `Notified ${nonVoters.length} member(s) to vote`);

      setTimeout(() => setReminderSent(false), 60 * 60 * 1000);
    } catch (err) {
      console.error('[PollCard] Failed to send poll reminder:', err);
      Alert.alert('Error', 'Failed to send reminder. Please try again.');
    } finally {
      setReminderSending(false);
    }
  };

  const handleVote = async (optionId: string) => {
    if (voting || isClosed) return;
    setVoting(true);

    try {
      if (poll.poll_type === 'multiple') {
        if (userVotedOptionIds.includes(optionId)) {
          await removeVote(optionId);
        } else {
          await vote(optionId);
        }
      } else {
        await vote(optionId);
      }
    } catch (error) {
      console.error('Voting error:', error);
    } finally {
      setVoting(false);
    }
  };

  const handleClosePoll = async () => {
    if (!canClose) return;
    await closePoll();
  };

  const sortedOptions = [...(poll.options || [])].sort((a, b) => a.sort_order - b.sort_order);

  // Get highest percentage for winner highlighting
  const maxPercentage = totalVotes > 0 
    ? Math.max(...sortedOptions.map(o => Math.round((o.vote_count || 0) / totalVotes * 100)))
    : 0;

  // Compact version for inline chat display
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        {/* Header - Always Visible */}
        <TouchableOpacity 
          style={styles.compactHeader}
          onPress={() => setIsExpanded(!isExpanded)}
        >
          <View style={styles.compactHeaderContent}>
            <View style={styles.compactInfo}>
              <View style={styles.pollBadge}>
                <Feather name="bar-chart-2" size={16} color="#8B5CF6" />
                <Text style={styles.pollBadgeText}>Poll</Text>
                {isClosed && <Text style={styles.closedBadge}>Closed</Text>}
              </View>
              <Text style={styles.compactQuestion} numberOfLines={2}>
                {poll.question}
              </Text>
              <View style={styles.compactMeta}>
                {hasVoted && (
                  <Text style={styles.votedIndicator}>✅ Voted</Text>
                )}
                <Text style={styles.voteCount}>
                  👥 {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            <View style={styles.expandButton}>
              <Text style={styles.expandButtonText}>
                {isExpanded ? '🔼 Hide' : '🔽 View'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Expandable Options */}
        {isExpanded && (
          <View style={styles.expandableContent}>
            {sortedOptions.map((option) => {
              const percentage = totalVotes > 0 
                ? Math.round((option.vote_count || 0) / totalVotes * 100) 
                : 0;
              const isWinner = percentage > 0 && percentage === maxPercentage;
              const isUserVote = userVotedOptionIds.includes(option.id);
              
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.compactOption,
                    isUserVote && styles.selectedOption,
                    isClosed && styles.disabledOption
                  ]}
                  onPress={() => !isClosed && handleVote(option.id)}
                  disabled={isClosed || voting}
                >
                  {/* Progress Bar */}
                  {showResults && (
                    <View 
                      style={[
                        styles.progressBar,
                        isUserVote ? styles.userProgressBar : 
                        isWinner ? styles.winnerProgressBar : styles.defaultProgressBar,
                        { width: `${percentage}%` }
                      ]} 
                    />
                  )}
                  
                  <View style={styles.optionContent}>
                    <View style={styles.optionLeft}>
                      <Text style={styles.checkmark}>
                        {isUserVote ? '✅' : '⚪'}
                      </Text>
                      <Text style={[
                        styles.optionText,
                        isUserVote && styles.selectedOptionText,
                        isWinner && !isUserVote && styles.winnerOptionText
                      ]}>
                        {option.option_text}
                      </Text>
                    </View>
                    {showResults && (
                      <Text style={[
                        styles.percentageText,
                        isWinner && styles.winnerPercentage
                      ]}>
                        {percentage}%
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            
            {!isClosed && !hasVoted && (
              <Text style={styles.votePrompt}>
                Tap an option to vote
              </Text>
            )}

            {canClose && (
              <TouchableOpacity
                style={styles.closePollButton}
                onPress={handleClosePoll}
              >
                <Text style={styles.closePollButtonText}>Close Poll</Text>
              </TouchableOpacity>
            )}

            {canSendReminder && !isClosed && (
              <TouchableOpacity
                style={[
                  styles.pollReminderButton,
                  (nonVoters.length === 0 || reminderSent) && styles.pollReminderButtonDisabled,
                ]}
                onPress={handleSendPollReminder}
                disabled={nonVoters.length === 0 || reminderSending || reminderSent}
              >
                {reminderSending ? (
                  <ActivityIndicator size="small" color="#8b5cf6" />
                ) : (
                  <>
                    <Feather
                      name={reminderSent ? 'check' : 'bell'}
                      size={16}
                      color={reminderSent || nonVoters.length === 0 ? '#64748b' : '#8b5cf6'}
                    />
                    <Text
                      style={[
                        styles.pollReminderText,
                        (reminderSent || nonVoters.length === 0) && styles.pollReminderTextDisabled,
                      ]}
                    >
                      {reminderSent
                        ? 'Reminder Sent'
                        : nonVoters.length === 0
                          ? 'All Voted'
                          : `Remind ${nonVoters.length} to Vote`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  }

  // Full-size version (for future use in poll sheets/modals)
  return (
    <View style={styles.fullContainer}>
      <Text style={styles.fullQuestion}>{poll.question}</Text>
      {/* Full version implementation would go here */}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#8b5cf6',
    fontSize: 14,
  },
  compactContainer: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#8b5cf6',
    overflow: 'hidden',
  },
  compactHeader: {
    padding: 12,
  },
  compactHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  compactInfo: {
    flex: 1,
    marginRight: 12,
  },
  pollBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  pollBadgeText: {
    color: '#8b5cf6',
    fontSize: 12,
    fontWeight: '600',
  },
  closedBadge: {
    backgroundColor: '#666',
    color: '#fff',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  compactQuestion: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  compactMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  votedIndicator: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '600',
  },
  voteCount: {
    color: '#999',
    fontSize: 11,
  },
  expandButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  expandButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  expandableContent: {
    borderTopWidth: 1,
    borderTopColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  compactOption: {
    position: 'relative',
    backgroundColor: '#3a3a6e',
    borderRadius: 8,
    overflow: 'hidden',
  },
  selectedOption: {
    backgroundColor: '#8b5cf6',
  },
  disabledOption: {
    opacity: 0.6,
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 8,
  },
  userProgressBar: {
    backgroundColor: '#22c55e',
  },
  winnerProgressBar: {
    backgroundColor: '#8b5cf6',
  },
  defaultProgressBar: {
    backgroundColor: '#666',
  },
  optionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    zIndex: 1,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  checkmark: {
    fontSize: 12,
  },
  optionText: {
    color: '#fff',
    fontSize: 13,
    flex: 1,
  },
  selectedOptionText: {
    fontWeight: '600',
  },
  winnerOptionText: {
    fontWeight: '600',
  },
  percentageText: {
    color: '#ccc',
    fontSize: 11,
    fontWeight: '600',
  },
  winnerPercentage: {
    color: '#fff',
  },
  votePrompt: {
    color: '#8b5cf6',
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 4,
  },
  closePollButton: {
    backgroundColor: '#ef4444',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8,
  },
  closePollButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  pollReminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8b5cf6',
    marginTop: 12,
    gap: 6,
  },
  pollReminderButtonDisabled: {
    borderColor: '#475569',
  },
  pollReminderText: {
    color: '#8b5cf6',
    fontSize: 13,
    fontWeight: '500',
  },
  pollReminderTextDisabled: {
    color: '#64748b',
  },
  fullContainer: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
  },
  fullQuestion: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
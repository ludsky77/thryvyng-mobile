import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { usePoll } from '../../hooks/usePolls';
import { canCreatePoll } from '../../lib/permissions';

interface PollCardProps {
  pollId: string;
  compact?: boolean;
}

export function PollCard({ pollId, compact = false }: PollCardProps) {
  const { user, currentRole } = useAuth();
  const { poll, loading, vote, removeVote, closePoll } = usePoll(pollId);
  const [voting, setVoting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (loading || !poll) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading poll...</Text>
      </View>
    );
  }

  const totalVotes = poll.options?.reduce((sum, opt) => sum + (opt.vote_count || 0), 0) || 0;
  const userVotedOptionIds = poll.user_votes?.map(v => v.option_id) || [];
  const hasVoted = userVotedOptionIds.length > 0;
  const isCreator = poll.created_by === user?.id;
  const isExpired = poll.ends_at && new Date(poll.ends_at) < new Date();
  const isClosed = !poll.is_active || isExpired;
  const canClose = isCreator && canCreatePoll(currentRole?.role);

  const showResults = hasVoted || isClosed || poll.show_results_live;

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
            <TouchableOpacity style={styles.expandButton}>
              <Text style={styles.expandButtonText}>
                {isExpanded ? '🔼 Hide' : '🔽 View'}
              </Text>
            </TouchableOpacity>
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
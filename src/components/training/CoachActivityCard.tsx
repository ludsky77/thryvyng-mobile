import React, { memo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

interface CoachActivityCardProps {
  coach: {
    id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    role: string;
    sessionsCreated: number;
    sessionsScheduled: number;
    completed: number;
  };
}

function getInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatRole(role: string): string {
  if (role === 'head_coach') return 'Head Coach';
  if (role === 'assistant_coach') return 'Assistant Coach';
  return role.replace(/_/g, ' ');
}

export const CoachActivityCard = memo(function CoachActivityCard({
  coach,
}: CoachActivityCardProps) {
  const totalActivity =
    coach.sessionsCreated + coach.sessionsScheduled + coach.completed;
  const completionRate =
    coach.sessionsScheduled > 0
      ? Math.round((coach.completed / coach.sessionsScheduled) * 100)
      : 0;
  const noActivity = totalActivity === 0;

  return (
    <View style={[styles.card, noActivity && styles.cardMuted]}>
      <View style={styles.header}>
        {coach.avatar_url ? (
          <Image source={{ uri: coach.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {getInitials(coach.full_name)}
            </Text>
          </View>
        )}
        <View style={styles.headerContent}>
          <Text style={[styles.coachName, noActivity && styles.textMuted]}>
            {coach.full_name || 'Unknown Coach'}
          </Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{formatRole(coach.role)}</Text>
          </View>
        </View>
      </View>

      {noActivity ? (
        <Text style={styles.noActivityText}>No activity yet</Text>
      ) : (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statNumber}>{coach.sessionsCreated}</Text>
              <Text style={styles.statLabel}>Sessions Created</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statNumber}>{coach.sessionsScheduled}</Text>
              <Text style={styles.statLabel}>Scheduled</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statNumber}>{coach.completed}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
          </View>

          {coach.sessionsScheduled > 0 && (
            <View style={styles.progressSection}>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${completionRate}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>
                {completionRate}% completion rate
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardMuted: {
    opacity: 0.8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  headerContent: {
    flex: 1,
  },
  coachName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  textMuted: {
    color: '#94a3b8',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  progressSection: {
    marginTop: 4,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  noActivityText: {
    fontSize: 14,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
});

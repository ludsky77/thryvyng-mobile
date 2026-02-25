import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Team {
  id: string;
  name: string;
  color: string;
}

interface TeamLegendProps {
  teams: Team[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTeamPress: (teamId: string) => void;
}

const TeamLegend: React.FC<TeamLegendProps> = ({
  teams,
  isExpanded,
  onToggleExpand,
  onTeamPress,
}) => {
  // Don't render if user has less than 2 teams
  if (teams.length < 2) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={onToggleExpand}>
        {!isExpanded && (
          <View style={styles.collapsedContent}>
            <View style={styles.colorDotsRow}>
              {teams.slice(0, 6).map((team) => (
                <View
                  key={team.id}
                  style={[styles.colorDot, { backgroundColor: team.color }]}
                />
              ))}
              {teams.length > 6 && (
                <Text style={styles.moreDots}>+{teams.length - 6}</Text>
              )}
            </View>
            <Text style={styles.collapsedTitle}>Your Teams</Text>
          </View>
        )}
        {isExpanded && (
          <Text style={styles.expandedTitle}>YOUR TEAMS</Text>
        )}
        <Text style={styles.arrow}>{isExpanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.teamsGrid}>
          {teams.map((team) => (
            <TouchableOpacity
              key={team.id}
              style={styles.teamItem}
              onPress={() => onTeamPress(team.id)}
            >
              <View
                style={[styles.teamColorBox, { backgroundColor: team.color }]}
              />
              <Text style={styles.teamName} numberOfLines={1}>
                {team.name}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.tapHint}>Tap a team to filter</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(26, 22, 37, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  collapsedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  colorDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  moreDots: {
    color: '#9CA3AF',
    fontSize: 10,
    marginLeft: 2,
  },
  collapsedTitle: {
    color: '#D1D5DB',
    fontSize: 14,
  },
  expandedTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  arrow: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  teamsGrid: {
    marginTop: 12,
  },
  teamItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  teamColorBox: {
    width: 14,
    height: 14,
    borderRadius: 4,
    marginRight: 10,
  },
  teamName: {
    color: '#D1D5DB',
    fontSize: 13,
    flex: 1,
  },
  tapHint: {
    color: '#6B7280',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default TeamLegend;

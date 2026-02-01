import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useUserTeams } from '../hooks/useUserTeams';

export default function TeamsScreen({ navigation }: any) {
  const { teams, loading, getTeamsByAccess } = useUserTeams();
  const { staffTeams, parentTeams } = getTeamsByAccess();

  const sections = [
    ...(staffTeams.length > 0 ? [{ title: 'Coaching', data: staffTeams }] : []),
    ...(parentTeams.length > 0 ? [{ title: 'My Kids', data: parentTeams }] : []),
  ];

  const renderTeamItem = ({ item }: any) => (
    <TouchableOpacity
      style={styles.teamCard}
      onPress={() => {
        navigation.navigate('TeamDetail', {
          teamId: item.id,
          teamName: item.name,
        });
      }}
      activeOpacity={0.7}
    >
      <View
        style={[styles.teamColorBar, { backgroundColor: item.color || '#8b5cf6' }]}
      />
      <View style={styles.teamContent}>
        <Text style={styles.teamName}>{item.name}</Text>

        <Text style={styles.teamMeta}>
          {item.age_group && `${item.age_group} • `}
          {item.gender && `${item.gender}`}
        </Text>

        {item.club_name && (
          <Text style={styles.clubName}>🏆 {item.club_name}</Text>
        )}

        <Text style={styles.accessType}>
          {item.access_type === 'staff'
            ? `👔 ${(item.staff_role || '').replace(/_/g, ' ')}`
            : `👨‍👩‍👧 Parent of ${item.player_name || 'player'}`}
        </Text>
      </View>

      <Text style={styles.teamArrow}>›</Text>
    </TouchableOpacity>
  );

  const renderSectionHeader = ({ section }: any) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionIcon}>
        {section.title === 'Coaching' ? '📋' : '🎽'}
      </Text>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.sectionBadge}>
        <Text style={styles.sectionBadgeText}>{section.data.length}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading teams...</Text>
      </View>
    );
  }

  if (teams.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>👥</Text>
        <Text style={styles.emptyTitle}>No Teams</Text>
        <Text style={styles.emptyText}>
          You'll see your teams here once you join a team or add a player
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Teams</Text>
      </View>

      <SectionList
        sections={sections}
        renderItem={renderTeamItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a4e',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 12,
    gap: 8,
  },
  sectionIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  sectionBadge: {
    backgroundColor: '#3a3a5e',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sectionBadgeText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  teamColorBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  teamContent: {
    flex: 1,
    padding: 14,
  },
  teamName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  teamMeta: {
    color: '#888',
    fontSize: 13,
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  clubName: {
    color: '#8b5cf6',
    fontSize: 13,
    marginBottom: 4,
  },
  accessType: {
    color: '#888',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  teamArrow: {
    color: '#666',
    fontSize: 22,
    paddingRight: 14,
  },
});

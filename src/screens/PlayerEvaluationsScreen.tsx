import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../lib/supabase';

interface AwardType {
  award_name: string;
  award_color: string;
}

interface Evaluation {
  id: string;
  player_id: string;
  player_name: string | null;
  jersey_number: number | null;
  is_visible_to_player: boolean | null;
  coach_personal_note: string | null;
  generated_certificate_url: string | null;
  created_at: string;
  award_types: AwardType | null;
}

export default function PlayerEvaluationsScreen({ route, navigation }: any) {
  const { teamId } = route.params || {};
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvaluations();
  }, [teamId]);

  const fetchEvaluations = async () => {
    if (!teamId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('player_evaluations')
        .select(`
          id,
          player_id,
          player_name,
          jersey_number,
          is_visible_to_player,
          coach_personal_note,
          generated_certificate_url,
          created_at,
          award_types (
            award_name,
            award_color
          )
        `)
        .eq('team_id', teamId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEvaluations((data || []) as Evaluation[]);
    } catch (err) {
      console.error('Error fetching evaluations:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderEvaluation = ({ item }: { item: Evaluation }) => (
    <TouchableOpacity
      style={styles.evalCard}
      onPress={() => navigation.navigate('EvaluationDetail', { evaluationId: item.id })}
    >
      <Text style={styles.playerName}>{item.player_name || 'Unknown Player'}</Text>
      {item.jersey_number != null && (
        <Text style={styles.jersey}>#{item.jersey_number}</Text>
      )}
      {item.award_types?.award_name && (
        <View
          style={[
            styles.awardBadge,
            { backgroundColor: item.award_types.award_color || '#8b5cf6' },
          ]}
        >
          <Text style={styles.awardText}>{item.award_types.award_name}</Text>
        </View>
      )}
      <Text style={styles.date}>
        {new Date(item.created_at).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Player Evaluations</Text>
        <View style={styles.headerRight} />
      </View>
      <View style={styles.subtitleRow}>
        <Text style={styles.subtitle}>{evaluations.length} evaluations</Text>
      </View>

      {evaluations.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No evaluations yet</Text>
          <Text style={styles.emptySubtext}>Create evaluations from the team roster</Text>
        </View>
      ) : (
        <FlatList
          data={evaluations}
          keyExtractor={(item) => item.id}
          renderItem={renderEvaluation}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  subtitleRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
  listContent: {
    padding: 16,
  },
  evalCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  jersey: {
    fontSize: 14,
    color: '#a78bfa',
    marginBottom: 6,
  },
  awardBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  awardText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  date: {
    fontSize: 13,
    color: '#888',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
});

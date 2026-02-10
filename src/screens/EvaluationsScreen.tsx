import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Evaluation {
  id: string;
  created_at?: string;
  evaluation_date?: string;
  overall_score: number;
  evaluator_name: string;
  status: string;
}

export default function EvaluationsScreen() {
  const navigation = useNavigation();
  const { currentRole } = useAuth();

  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const playerId = currentRole?.entity_id;

  useEffect(() => {
    if (playerId) {
      fetchEvaluations();
    } else {
      setIsLoading(false);
    }
  }, [playerId]);

  const fetchEvaluations = async () => {
    try {
      const { data, error } = await supabase
        .from('player_evaluations')
        .select('id, evaluation_date, created_at, overall_score, evaluator_name, status')
        .eq('player_id', playerId)
        .eq('is_visible_to_player', true)
        .order('evaluation_date', { ascending: false })
        .limit(5);

      if (error) throw error;

      const mapped = (data || []).map((e: any) => ({
        id: e.id,
        created_at: e.created_at || e.evaluation_date,
        evaluation_date: e.evaluation_date,
        overall_score: e.overall_score ?? 0,
        evaluator_name: e.evaluator_name || 'Unknown',
        status: e.status || 'completed',
      }));

      setEvaluations(mapped);
    } catch (error) {
      console.error('[Evaluations] Error fetching:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFindEvaluator = () => {
    Linking.openURL('https://thryvyng.com/evaluators');
  };

  const handleViewAllEvaluations = () => {
    navigation.navigate('PlayerProfile' as never, {
      playerId,
      playerName: 'My Evaluations',
    } as never);
  };

  const handleEvaluationPress = (evaluationId: string) => {
    navigation.navigate('EvaluationDetail' as never, { evaluationId } as never);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + (dateString.includes('T') ? '' : 'T12:00:00'));
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Evaluations</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Find an Evaluator Card */}
        <TouchableOpacity
          style={styles.actionCard}
          onPress={handleFindEvaluator}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconContainer, { backgroundColor: '#3B82F6' }]}>
            <Ionicons name="search" size={28} color="#FFFFFF" />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Find an Evaluator</Text>
            <Text style={styles.actionSubtitle}>
              Get professional assessments from certified evaluators
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#64748b" />
        </TouchableOpacity>

        {/* My Evaluations Card */}
        <TouchableOpacity
          style={styles.actionCard}
          onPress={handleViewAllEvaluations}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconContainer, { backgroundColor: '#F59E0B' }]}>
            <Ionicons name="document-text" size={28} color="#FFFFFF" />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>My Evaluations</Text>
            <Text style={styles.actionSubtitle}>
              View all your evaluation history and reports
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#64748b" />
        </TouchableOpacity>

        {/* Recent Evaluations Preview */}
        <View style={styles.recentSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Evaluations</Text>
            {evaluations.length > 0 && (
              <TouchableOpacity onPress={handleViewAllEvaluations}>
                <Text style={styles.viewAllLink}>View All →</Text>
              </TouchableOpacity>
            )}
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#8B5CF6" />
            </View>
          ) : evaluations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="clipboard-outline" size={40} color="#475569" />
              <Text style={styles.emptyTitle}>No evaluations yet</Text>
              <Text style={styles.emptySubtitle}>
                Find an evaluator to get your first assessment
              </Text>
            </View>
          ) : (
            evaluations.map((evaluation) => (
              <TouchableOpacity
                key={evaluation.id}
                style={styles.evaluationCard}
                onPress={() => handleEvaluationPress(evaluation.id)}
              >
                <View style={styles.evalScoreContainer}>
                  <Text style={styles.evalScore}>
                    {evaluation.overall_score?.toFixed(1) ?? '--'}
                  </Text>
                </View>
                <View style={styles.evalInfo}>
                  <Text style={styles.evalEvaluator}>
                    {evaluation.evaluator_name}
                  </Text>
                  <Text style={styles.evalDate}>
                    {formatDate(evaluation.created_at || evaluation.evaluation_date || '')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.evalStatus,
                    evaluation.status === 'completed'
                      ? styles.statusCompleted
                      : styles.statusPending,
                  ]}
                >
                  <Text style={styles.evalStatusText}>
                    {evaluation.status === 'completed' ? 'Complete' : 'Pending'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Ionicons name="information-circle-outline" size={20} color="#64748b" />
          <Text style={styles.infoText}>
            Evaluations help track player development and identify areas for
            improvement
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Action Cards
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: {
    flex: 1,
    marginLeft: 16,
    marginRight: 8,
  },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  actionSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
  },

  // Recent Section
  recentSection: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  viewAllLink: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },

  // Empty State
  emptyCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },

  // Evaluation Card
  evaluationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  evalScoreContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  evalScore: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  evalInfo: {
    flex: 1,
    marginLeft: 12,
  },
  evalEvaluator: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  evalDate: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  evalStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusCompleted: {
    backgroundColor: '#10B98133',
  },
  statusPending: {
    backgroundColor: '#F59E0B33',
  },
  evalStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Info Section
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 24,
    padding: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
  },
  infoText: {
    flex: 1,
    color: '#64748b',
    fontSize: 13,
    marginLeft: 12,
    lineHeight: 18,
  },
});

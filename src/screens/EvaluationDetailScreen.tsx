import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';

interface SkillScore {
  id?: string;
  skill_category: string;
  skill_name?: string;
  score: number;
  max_score?: number;
}

interface EvaluationDetail {
  id: string;
  player_id: string;
  evaluation_date: string;
  overall_score: number | null;
  evaluator_name: string | null;
  evaluator_id?: string | null;
  status: string;
  coach_comments: string | null;
  has_certificate: boolean;
  generated_certificate_url?: string | null;
  evaluator?: { full_name: string } | null;
  skill_scores?: SkillScore[];
}

export default function EvaluationDetailScreen({ route, navigation }: any) {
  const { evaluation_id } = route.params;
  const [evaluation, setEvaluation] = useState<EvaluationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvaluation();
  }, [evaluation_id]);

  const fetchEvaluation = async () => {
    if (!evaluation_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: evalData, error: evalError } = await supabase
        .from('player_evaluations')
        .select('*')
        .eq('id', evaluation_id)
        .single();

      if (evalError) {
        try {
          const { data: fallbackData } = await supabase
            .from('player_evaluations')
            .select('*')
            .eq('id', evaluation_id)
            .single();

          if (fallbackData) {
            const row = fallbackData as any;
            let skillScores: SkillScore[] = [];
            if (row.skill_scores && Array.isArray(row.skill_scores)) {
              skillScores = row.skill_scores;
            } else if (row.skills && typeof row.skills === 'object') {
              skillScores = Object.entries(row.skills).map(([name, score]) => ({
                skill_category: String(name).replace(/_/g, ' '),
                score: Number(score) || 0,
                max_score: 5,
              }));
            }
            setEvaluation({
              ...row,
              evaluator_name: row.evaluator_name || 'Unknown',
              coach_comments: row.coach_comments ?? null,
              has_certificate: row.has_certificate ?? false,
              skill_scores: skillScores,
            });
          }
        } catch (error) {
          console.warn('Error:', error);
        }
        setLoading(false);
        return;
      }

      let skillScores: SkillScore[] = [];
      try {
        const { data: skillsData } = await supabase
          .from('evaluation_skill_scores')
          .select('*')
          .eq('evaluation_id', evaluation_id);

        if (skillsData && skillsData.length > 0) {
          skillScores = skillsData.map((s: any) => ({
            skill_category: s.skill_category || s.skill_name || 'Skill',
            score: s.score ?? 0,
            max_score: s.max_score ?? 5,
          }));
        } else {
          const row = evalData as any;
          if (row.skill_scores && Array.isArray(row.skill_scores)) {
            skillScores = row.skill_scores;
          } else if (row.skills && typeof row.skills === 'object') {
            skillScores = Object.entries(row.skills).map(([name, score]) => ({
              skill_category: String(name).replace(/_/g, ' '),
              score: Number(score) || 0,
              max_score: 5,
            }));
          }
        }
      } catch (skillsError) {
        console.warn('Could not fetch evaluation_skill_scores:', skillsError);
        const row = evalData as any;
        if (row?.skill_scores && Array.isArray(row.skill_scores)) {
          skillScores = row.skill_scores;
        } else if (row?.skills && typeof row.skills === 'object') {
          skillScores = Object.entries(row.skills).map(([name, score]) => ({
            skill_category: String(name).replace(/_/g, ' '),
            score: Number(score) || 0,
            max_score: 5,
          }));
        }
      }

      const row = evalData as any;
      setEvaluation({
        ...row,
        evaluator_name: row.evaluator_name || 'Unknown',
        coach_comments: row.coach_comments ?? null,
        has_certificate: row.has_certificate ?? false,
        skill_scores: skillScores,
      });
    } catch (error) {
      console.error('Error fetching evaluation:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderSkillBar = (score: number, maxScore: number) => {
    const pct = maxScore > 0 ? Math.min(100, (score / maxScore) * 100) : 0;
    return (
      <View style={styles.skillBarTrack}>
        <View
          style={[
            styles.skillBarFill,
            {
              width: `${pct}%`,
              backgroundColor:
                pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444',
            },
          ]}
        />
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading evaluation...</Text>
      </View>
    );
  }

  if (!evaluation) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Evaluation not found</Text>
      </View>
    );
  }

  const maxScore = Math.max(
    ...(evaluation.skill_scores?.map((s) => s.max_score ?? 5) || [5]),
    5
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerDate}>
          {formatDate(evaluation.evaluation_date)}
        </Text>
        <Text style={styles.evaluatorName}>
          By {evaluation.evaluator_name || 'Unknown Evaluator'}
        </Text>
        {evaluation.overall_score != null && (
          <View style={styles.overallScore}>
            <Text style={styles.overallScoreValue}>
              {evaluation.overall_score.toFixed(1)}
            </Text>
            <Text style={styles.overallScoreLabel}>Overall Score</Text>
          </View>
        )}
      </View>

      {/* Skill Categories */}
      {evaluation.skill_scores &&
        evaluation.skill_scores.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Skill Categories</Text>
            {evaluation.skill_scores.map((skill, index) => {
              const max = skill.max_score ?? 5;
              return (
                <View key={index} style={styles.skillRow}>
                  <View style={styles.skillInfo}>
                    <Text style={styles.skillName}>
                      {skill.skill_category.replace(/_/g, ' ')}
                    </Text>
                    <Text style={styles.skillScore}>
                      {skill.score} / {max}
                    </Text>
                  </View>
                  {renderSkillBar(skill.score, max)}
                </View>
              );
            })}
          </View>
        )}

      {/* Coach Comments */}
      {(evaluation.coach_comments || evaluation.status) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💬 Coach Comments</Text>
          <Text style={styles.commentsText}>
            {evaluation.coach_comments || `Status: ${evaluation.status}`}
          </Text>
        </View>
      )}

      {/* View Certificate */}
      {(evaluation.generated_certificate_url || evaluation.has_certificate) && (
        <TouchableOpacity
          style={styles.certificateButton}
          onPress={() =>
            navigation.navigate('CertificateViewer', {
              evaluation_id: evaluation.id,
            })
          }
        >
          <Text style={styles.certificateIcon}>📜</Text>
          <Text style={styles.certificateText}>View Certificate</Text>
        </TouchableOpacity>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    paddingBottom: 40,
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
  errorContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  header: {
    backgroundColor: '#2a2a4e',
    padding: 20,
    marginBottom: 16,
  },
  headerDate: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  evaluatorName: {
    color: '#8b5cf6',
    fontSize: 15,
    marginBottom: 12,
  },
  overallScore: {
    alignSelf: 'flex-start',
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  overallScoreValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  overallScoreLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#2a2a4e',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  skillRow: {
    marginBottom: 12,
  },
  skillInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  skillName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  skillScore: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '600',
  },
  skillBarTrack: {
    height: 8,
    backgroundColor: '#3a3a6e',
    borderRadius: 4,
    overflow: 'hidden',
  },
  skillBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  commentsText: {
    color: '#ddd',
    fontSize: 15,
    lineHeight: 22,
  },
  certificateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a4e',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  certificateIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  certificateText: {
    color: '#8b5cf6',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 40,
  },
});

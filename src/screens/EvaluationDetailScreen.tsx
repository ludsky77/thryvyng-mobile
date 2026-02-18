import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import Svg, {
  Path,
  Rect,
  Circle,
  Line,
  Polygon,
  Text as SvgText,
  G,
} from 'react-native-svg';
import { supabase } from '../lib/supabase';

interface Club {
  id: string;
  name: string;
  logo_url: string | null;
}

interface Team {
  id: string;
  name: string;
  clubs: Club | null;
}

interface Player {
  photo_url: string | null;
  team_id: string | null;
  date_of_birth: string | null;
  teams: Team | null;
}

interface AwardType {
  award_name: string;
  award_tagline: string | null;
  award_color: string;
}

interface BatchSession {
  session_name: string | null;
  season_name: string | null;
  default_signature_1_name: string | null;
  default_signature_1_title: string | null;
  default_signature_2_name: string | null;
  default_signature_2_title: string | null;
  default_signature_3_name: string | null;
  default_signature_3_title: string | null;
}

interface Evaluation {
  id: string;
  player_id: string;
  player_name: string | null;
  jersey_number: number | null;
  primary_position?: string | null;
  secondary_position?: string | null;
  third_position?: string | null;
  fourth_position?: string | null;
  position?: string | null;
  coach_personal_note: string | null;
  is_visible_to_player: boolean | null;
  generated_certificate_url: string | null;
  created_at: string;
  signature_1_name?: string | null;
  signature_1_title?: string | null;
  signature_2_name?: string | null;
  signature_2_title?: string | null;
  signature_3_name?: string | null;
  signature_3_title?: string | null;
  signature_4_name?: string | null;
  signature_4_title?: string | null;
  evaluator_name?: string | null;
  evaluator_title?: string | null;
  players: Player | null;
  award_types: AwardType | null;
  batch_evaluation_sessions: BatchSession | null;
}

interface ScoreRow {
  id: string;
  attribute_name: string;
  dimension: string;
  score: number;
  score_max: number;
}

interface GroupedScores {
  technical: ScoreRow[];
  tactical: ScoreRow[];
  psychological: ScoreRow[];
  physiological: ScoreRow[];
}

interface DimensionAverages {
  technical: number;
  tactical: number;
  psychological: number;
  physiological: number;
}

const calculateAverage = (scores: ScoreRow[]): number => {
  if (!scores?.length) return 0;
  return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
};

const calculateAge = (dob: string | null): number | null => {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

/** Normalize dimension average to 0–10 scale for spider graph */
const normalizedAverageForSpider = (scores: ScoreRow[]): number => {
  if (!scores?.length) return 0;
  const avg = calculateAverage(scores);
  const max = scores[0]?.score_max ?? 5;
  return max > 0 ? (avg / max) * 10 : 0;
};

const TAB_CONFIG = {
  technical: { icon: '⚽', label: 'TEC', color: '#10B981' },
  tactical: { icon: '🧠', label: 'TAC', color: '#3B82F6' },
  psychological: { icon: '💪', label: 'PSY', color: '#A855F7' },
  physiological: { icon: '🏃', label: 'PHY', color: '#F59E0B' },
} as const;

type TabKey = keyof typeof TAB_CONFIG;

const POSITION_COORDINATES: Record<string, { x: number; y: number }> = {
  GK: { x: 50, y: 100 },
  LB: { x: 22, y: 78 },
  CB: { x: 50, y: 80 },
  RB: { x: 78, y: 78 },
  LWB: { x: 18, y: 65 },
  RWB: { x: 82, y: 65 },
  CDM: { x: 50, y: 65 },
  DM: { x: 50, y: 65 },
  LM: { x: 20, y: 55 },
  CM: { x: 50, y: 55 },
  RM: { x: 80, y: 55 },
  CAM: { x: 50, y: 42 },
  AM: { x: 50, y: 42 },
  LW: { x: 22, y: 28 },
  RW: { x: 78, y: 28 },
  CF: { x: 50, y: 28 },
  ST: { x: 50, y: 20 },
  SS: { x: 50, y: 32 },
};

function JerseyCard({
  number,
  position,
}: {
  number: number | null;
  position: string | null;
}) {
  return (
    <View style={styles.jerseyCard}>
      <View style={styles.jerseyImageContainer}>
        <Image
          source={require('../assets/jersey-badge.png')}
          style={styles.jerseyImage}
          resizeMode="contain"
        />
        <View style={styles.numberOverlay}>
          <Text style={styles.jerseyNumber}>{number ?? '—'}</Text>
        </View>
      </View>
      <View style={styles.positionBadge}>
        <Text style={styles.positionBadgeText}>{position || 'N/A'}</Text>
      </View>
    </View>
  );
}

function HeatMapCard({
  primaryPosition,
  secondaryPosition,
  thirdPosition,
  fourthPosition,
}: {
  primaryPosition: string | null;
  secondaryPosition?: string | null;
  thirdPosition?: string | null;
  fourthPosition?: string | null;
}) {
  const positionStyles = [
    { pos: fourthPosition, color: '#22c55e', sizes: [10, 7, 5, 3] },
    { pos: thirdPosition, color: '#eab308', sizes: [12, 9, 6, 3.5] },
    { pos: secondaryPosition, color: '#f97316', sizes: [14, 10, 7, 4] },
    { pos: primaryPosition, color: '#ef4444', sizes: [17, 12, 8, 5] },
  ].filter((p) => p.pos && POSITION_COORDINATES[p.pos]);

  return (
    <View style={styles.heatMapContainer}>
      <Svg width={95} height={110} viewBox="0 0 100 120">
        <Rect x="5" y="5" width="90" height="110" fill="#15803d" rx="4" />
        <Rect
          x="8"
          y="8"
          width="84"
          height="104"
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1"
          rx="2"
        />
        <Line
          x1="8"
          y1="60"
          x2="92"
          y2="60"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1"
        />
        <Circle
          cx="50"
          cy="60"
          r="12"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1"
        />
        <Circle cx="50" cy="60" r="2" fill="rgba(255,255,255,0.4)" />
        <Rect
          x="22"
          y="8"
          width="56"
          height="24"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1"
        />
        <Rect
          x="32"
          y="8"
          width="36"
          height="10"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1"
        />
        <Rect
          x="22"
          y="88"
          width="56"
          height="24"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1"
        />
        <Rect
          x="32"
          y="102"
          width="36"
          height="10"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1"
        />
        <Circle cx="50" cy="22" r="1.5" fill="rgba(255,255,255,0.4)" />
        <Circle cx="50" cy="98" r="1.5" fill="rgba(255,255,255,0.4)" />
        {positionStyles.map((item, index) => {
          const coords = item.pos ? POSITION_COORDINATES[item.pos] : null;
          if (!coords) return null;
          return (
            <G key={index}>
              <Circle
                cx={coords.x}
                cy={coords.y}
                r={item.sizes[0]}
                fill={item.color}
                opacity={0.2}
              />
              <Circle
                cx={coords.x}
                cy={coords.y}
                r={item.sizes[1]}
                fill={item.color}
                opacity={0.35}
              />
              <Circle
                cx={coords.x}
                cy={coords.y}
                r={item.sizes[2]}
                fill={item.color}
                opacity={0.55}
              />
              <Circle
                cx={coords.x}
                cy={coords.y}
                r={item.sizes[3]}
                fill={item.color}
                opacity={0.9}
              />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

function SpiderGraph({
  averagesNorm,
}: {
  averagesNorm: { technical: number; tactical: number; psychological: number; physiological: number };
}) {
  const centerX = 70;
  const centerY = 55;
  const maxRadius = 40;

  const tecRadius = (averagesNorm.technical / 10) * maxRadius;
  const tacRadius = (averagesNorm.tactical / 10) * maxRadius;
  const psyRadius = (averagesNorm.psychological / 10) * maxRadius;
  const phyRadius = (averagesNorm.physiological / 10) * maxRadius;

  const points = {
    tec: { x: centerX, y: centerY - tecRadius },
    tac: { x: centerX + tacRadius, y: centerY },
    psy: { x: centerX, y: centerY + psyRadius },
    phy: { x: centerX - phyRadius, y: centerY },
  };

  const polygonPoints = `${points.tec.x},${points.tec.y} ${points.tac.x},${points.tac.y} ${points.psy.x},${points.psy.y} ${points.phy.x},${points.phy.y}`;

  return (
    <View style={styles.spiderContainer}>
      <Svg width={140} height={110} viewBox="0 0 140 110">
        <Circle
          cx={centerX}
          cy={centerY}
          r={maxRadius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />
        <Circle
          cx={centerX}
          cy={centerY}
          r={maxRadius * 0.66}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />
        <Circle
          cx={centerX}
          cy={centerY}
          r={maxRadius * 0.33}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />
        <Line
          x1={centerX}
          y1={centerY - maxRadius}
          x2={centerX}
          y2={centerY + maxRadius}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1"
        />
        <Line
          x1={centerX - maxRadius}
          y1={centerY}
          x2={centerX + maxRadius}
          y2={centerY}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1"
        />
        <Polygon
          points={polygonPoints}
          fill="rgba(16, 185, 129, 0.3)"
          stroke="#10B981"
          strokeWidth="2"
        />
        <Circle cx={points.tec.x} cy={points.tec.y} r="4" fill="#10B981" />
        <Circle cx={points.tac.x} cy={points.tac.y} r="4" fill="#3B82F6" />
        <Circle cx={points.psy.x} cy={points.psy.y} r="4" fill="#A855F7" />
        <Circle cx={points.phy.x} cy={points.phy.y} r="4" fill="#F59E0B" />
        <SvgText x={centerX} y={8} fontSize="9" fill="#10B981" fontWeight="bold" textAnchor="middle">
          TEC
        </SvgText>
        <SvgText x={centerX} y={18} fontSize="8" fill="#fff" textAnchor="middle">
          {averagesNorm.technical.toFixed(1)}
        </SvgText>
        <SvgText x={125} y={centerY + 3} fontSize="9" fill="#3B82F6" fontWeight="bold" textAnchor="middle">
          TAC
        </SvgText>
        <SvgText x={125} y={centerY + 13} fontSize="8" fill="#fff" textAnchor="middle">
          {averagesNorm.tactical.toFixed(1)}
        </SvgText>
        <SvgText x={centerX} y={105} fontSize="9" fill="#A855F7" fontWeight="bold" textAnchor="middle">
          PSY
        </SvgText>
        <SvgText x={centerX} y={97} fontSize="8" fill="#fff" textAnchor="middle">
          {averagesNorm.psychological.toFixed(1)}
        </SvgText>
        <SvgText x={15} y={centerY + 3} fontSize="9" fill="#F59E0B" fontWeight="bold" textAnchor="middle">
          PHY
        </SvgText>
        <SvgText x={15} y={centerY + 13} fontSize="8" fill="#fff" textAnchor="middle">
          {averagesNorm.physiological.toFixed(1)}
        </SvgText>
      </Svg>
    </View>
  );
}

export default function EvaluationDetailScreen({ route, navigation }: any) {
  const evaluationId = route.params?.evaluationId ?? route.params?.evaluation_id;
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [scores, setScores] = useState<GroupedScores>({
    technical: [],
    tactical: [],
    psychological: [],
    physiological: [],
  });
  const [averages, setAverages] = useState<DimensionAverages>({
    technical: 0,
    tactical: 0,
    psychological: 0,
    physiological: 0,
  });
  const [activeTab, setActiveTab] = useState<TabKey>('technical');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvaluation();
  }, [evaluationId]);

  const fetchEvaluation = async () => {
    if (!evaluationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: evalData, error: evalError } = await supabase
        .from('player_evaluations')
        .select(`
          id,
          player_id,
          player_name,
          jersey_number,
          primary_position,
          secondary_position,
          third_position,
          fourth_position,
          signature_1_name,
          signature_1_title,
          signature_2_name,
          signature_2_title,
          signature_3_name,
          signature_3_title,
          signature_4_name,
          signature_4_title,
          evaluator_name,
          evaluator_title,
          coach_personal_note,
          is_visible_to_player,
          generated_certificate_url,
          created_at,
          players (
            photo_url,
            date_of_birth,
            team_id,
            teams (
              id,
              name,
              clubs (
                id,
                name,
                logo_url
              )
            )
          ),
          award_types (
            award_name,
            award_tagline,
            award_color
          ),
          batch_evaluation_sessions (
            session_name,
            season_name,
            default_signature_1_name,
            default_signature_1_title,
            default_signature_2_name,
            default_signature_2_title,
            default_signature_3_name,
            default_signature_3_title
          )
        `)
        .eq('id', evaluationId)
        .single();

      if (evalError) {
        console.warn('Evaluation fetch error:', evalError.message);
        setEvaluation(null);
        setLoading(false);
        return;
      }

      setEvaluation(evalData as Evaluation);

      const { data: scoresData } = await supabase
        .from('evaluation_scores')
        .select('id, attribute_name, dimension, score, score_max')
        .eq('evaluation_id', evaluationId)
        .order('dimension');

      const scoreList = (scoresData || []) as ScoreRow[];
      const grouped = {
        technical: scoreList.filter((s) => s.dimension === 'technical'),
        tactical: scoreList.filter((s) => s.dimension === 'tactical'),
        psychological: scoreList.filter((s) => s.dimension === 'psychological'),
        physiological: scoreList.filter((s) => s.dimension === 'physiological'),
      };

      setScores(grouped);
      setAverages({
        technical: calculateAverage(grouped.technical),
        tactical: calculateAverage(grouped.tactical),
        psychological: calculateAverage(grouped.psychological),
        physiological: calculateAverage(grouped.physiological),
      });
    } catch (err) {
      console.error('Error fetching evaluation:', err);
      setEvaluation(null);
    } finally {
      setLoading(false);
    }
  };

  const averagesNorm = {
    technical: normalizedAverageForSpider(scores.technical),
    tactical: normalizedAverageForSpider(scores.tactical),
    psychological: normalizedAverageForSpider(scores.psychological),
    physiological: normalizedAverageForSpider(scores.physiological),
  };

  const currentScores = scores[activeTab] ?? [];
  const tabColor = TAB_CONFIG[activeTab].color;

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

  const photoUrl = evaluation.players?.photo_url;
  const age = calculateAge(evaluation.players?.date_of_birth ?? null);
  const signatures = [
    { name: evaluation?.signature_1_name, title: evaluation?.signature_1_title },
    { name: evaluation?.signature_2_name, title: evaluation?.signature_2_title },
    { name: evaluation?.signature_3_name, title: evaluation?.signature_3_title },
    { name: evaluation?.signature_4_name, title: evaluation?.signature_4_title },
  ].filter((s) => s.name);
  const showSignatures =
    signatures.length > 0 || !!evaluation?.evaluator_name;
  const displaySignatures =
    signatures.length > 0
      ? signatures
      : evaluation?.evaluator_name
        ? [{ name: evaluation.evaluator_name, title: evaluation?.evaluator_title || '' }]
        : [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Evaluation Details</Text>
        <View style={styles.headerRight} />
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
      {/* Player Header */}
      <View style={styles.playerHeader}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.playerPhoto} />
        ) : (
          <View style={[styles.playerPhoto, styles.playerPhotoPlaceholder]}>
            <Text style={styles.playerPhotoText}>
              {evaluation.player_name?.charAt(0) || '?'}
            </Text>
          </View>
        )}
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>
            {evaluation.player_name || 'Unknown Player'}
          </Text>
          <Text style={styles.playerDetails}>
            {evaluation?.primary_position ?? 'N/A'} • Age {age ?? '?'}
          </Text>
          <Text style={styles.sessionName}>
            {evaluation.batch_evaluation_sessions?.session_name || 'Evaluation'}
          </Text>
          <Text style={styles.date}>
            {new Date(evaluation.created_at).toLocaleDateString()}
          </Text>
        </View>
        {evaluation?.players?.teams?.clubs?.logo_url ? (
          <Image
            source={{ uri: evaluation.players.teams.clubs.logo_url }}
            style={styles.clubEmblem}
          />
        ) : (
          <View style={styles.clubEmblem} />
        )}
      </View>

      {/* Visual Cards Row: Jersey, Heat Map, Spider Graph */}
      <View style={styles.visualCardsRow}>
        <JerseyCard
          number={evaluation.jersey_number}
          position={evaluation?.primary_position ?? null}
        />
        <HeatMapCard
          primaryPosition={evaluation?.primary_position ?? null}
          secondaryPosition={evaluation?.secondary_position ?? null}
          thirdPosition={evaluation?.third_position ?? null}
          fourthPosition={evaluation?.fourth_position ?? null}
        />
        <SpiderGraph averagesNorm={averagesNorm} />
      </View>

      {/* Award Badge */}
      {evaluation.award_types && (
        <View
          style={[styles.awardCard, { borderColor: evaluation.award_types.award_color }]}
        >
          <Text style={styles.awardIcon}>🏆</Text>
          <View>
            <Text
              style={[styles.awardName, { color: evaluation.award_types.award_color }]}
            >
              {evaluation.award_types.award_name}
            </Text>
            {evaluation.award_types.award_tagline && (
              <Text style={styles.awardTagline}>
                {evaluation.award_types.award_tagline}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Evaluation Scores with Tabs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 EVALUATION SCORES</Text>
        <View style={styles.tabsContainer}>
          {(Object.keys(TAB_CONFIG) as TabKey[]).map((key) => {
            const isActive = activeTab === key;
            const config = TAB_CONFIG[key];
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.tab,
                  isActive && styles.tabActive,
                  isActive && { borderColor: config.color },
                ]}
                onPress={() => setActiveTab(key)}
              >
                <Text style={styles.tabIcon}>{config.icon}</Text>
                <Text style={[styles.tabLabel, isActive && { color: config.color }]}>
                  {config.label}
                </Text>
                <Text style={[styles.tabValue, { color: config.color }]}>
                  {averages[key].toFixed(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.scoresListContainer}>
          {currentScores.length === 0 ? (
            <Text style={styles.noScoresText}>No scores for this dimension</Text>
          ) : (
            currentScores.map((score) => (
              <View key={score.id} style={styles.scoreRow}>
                <Text style={styles.attributeName} numberOfLines={1}>
                  {score.attribute_name}
                </Text>
                <View style={styles.scoreBarContainer}>
                  <View
                    style={[
                      styles.scoreBar,
                      {
                        width: `${score.score_max > 0 ? (score.score / score.score_max) * 100 : 0}%`,
                        backgroundColor: tabColor,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.scoreValue}>
                  {score.score}/{score.score_max}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Coach's Note */}
      {evaluation.coach_personal_note && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 COACH'S NOTE</Text>
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>"{evaluation.coach_personal_note}"</Text>
          </View>
        </View>
      )}

      {/* Signatures */}
      {showSignatures && displaySignatures.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✍️ SIGNATURES</Text>
          <View style={styles.signaturesGrid}>
            {displaySignatures.map((sig, index) => (
              <View key={index} style={styles.signatureCard}>
                <Text style={styles.signatureName}>{sig.name}</Text>
                <Text style={styles.signatureTitle}>{sig.title}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* View Certificate Button */}
      {evaluation.generated_certificate_url && (
        <TouchableOpacity
          style={styles.certificateButton}
          onPress={() =>
            navigation.navigate('CertificateViewer', {
              evaluationId: evaluation.id,
              evaluation_id: evaluation.id,
            })
          }
        >
          <Text style={styles.certificateButtonText}>🏆 View Certificate</Text>
        </TouchableOpacity>
      )}

      <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#13111C',
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#13111C',
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
    backgroundColor: '#13111C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  playerHeader: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  playerPhoto: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#333',
  },
  playerPhotoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerPhotoText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#a78bfa',
  },
  playerInfo: {
    marginLeft: 12,
    flex: 1,
    justifyContent: 'center',
  },
  playerName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  playerDetails: {
    fontSize: 14,
    color: '#a78bfa',
    marginTop: 2,
  },
  sessionName: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  date: {
    fontSize: 12,
    color: '#666',
  },
  clubEmblem: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  visualCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  jerseyCard: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  jerseyImageContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jerseyImage: {
    width: 110,
    height: 120,
  },
  numberOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 15,
  },
  jerseyNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  positionBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#00CED1',
  },
  positionBadgeText: {
    color: '#00CED1',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  heatMapContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 95,
    height: 110,
  },
  spiderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  awardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
  },
  awardIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  awardName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  awardTagline: {
    fontSize: 13,
    color: '#888',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 10,
    letterSpacing: 1,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
  },
  tabIcon: {
    fontSize: 20,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginTop: 4,
  },
  tabValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  scoresListContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  attributeName: {
    flex: 1,
    fontSize: 14,
    color: '#ccc',
  },
  scoreBarContainer: {
    flex: 1.2,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    marginHorizontal: 10,
  },
  scoreBar: {
    height: '100%',
    borderRadius: 4,
  },
  scoreValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    width: 45,
    textAlign: 'right',
  },
  noScoresText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 12,
  },
  noteCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
  },
  noteText: {
    fontSize: 14,
    color: '#ccc',
    fontStyle: 'italic',
    lineHeight: 22,
  },
  signaturesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  signatureCard: {
    width: '45%',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 14,
    borderRadius: 10,
  },
  signatureName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  signatureTitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
  certificateButton: {
    backgroundColor: '#a78bfa',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  certificateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 40,
  },
});

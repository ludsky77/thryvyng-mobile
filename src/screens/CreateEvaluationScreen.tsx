import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type Dimension = 'technical' | 'tactical' | 'psychological' | 'physiological';

const DIMENSIONS: {
  key: Dimension;
  label: string;
  attributes: { key: string; label: string }[];
}[] = [
  {
    key: 'technical',
    label: 'Technical',
    attributes: [
      { key: 'ball_control', label: 'Ball Control' },
      { key: 'passing', label: 'Passing' },
      { key: 'shooting', label: 'Shooting' },
    ],
  },
  {
    key: 'tactical',
    label: 'Tactical',
    attributes: [
      { key: 'positioning', label: 'Positioning' },
      { key: 'decision_making', label: 'Decision Making' },
      { key: 'game_awareness', label: 'Game Awareness' },
    ],
  },
  {
    key: 'psychological',
    label: 'Psychological',
    attributes: [
      { key: 'confidence', label: 'Confidence' },
      { key: 'focus', label: 'Focus' },
      { key: 'coachability', label: 'Coachability' },
    ],
  },
  {
    key: 'physiological',
    label: 'Physiological',
    attributes: [
      { key: 'speed', label: 'Speed' },
      { key: 'stamina', label: 'Stamina' },
      { key: 'strength', label: 'Strength' },
    ],
  },
];

const SCORE_MAX = 10;

export default function CreateEvaluationScreen({ route, navigation }: any) {
  const player_id = route.params?.player_id ?? route.params?.playerId;
  const team_id = route.params?.team_id ?? route.params?.teamId;
  const { user } = useAuth();
  const [player, setPlayer] = useState<{
    first_name: string;
    last_name: string;
    jersey_number: number | null;
  } | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [scores, setScores] = useState<Record<string, number>>({});
  const [coachNotes, setCoachNotes] = useState('');
  const [isVisibleToPlayer, setIsVisibleToPlayer] = useState(true);

  useEffect(() => {
    fetchPlayerAndTeam();
  }, [player_id, team_id]);

  const fetchPlayerAndTeam = async () => {
    if (!player_id || !team_id) {
      setLoading(false);
      return;
    }

    try {
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .select('first_name, last_name, jersey_number')
        .eq('id', player_id)
        .single();

      if (playerError || !playerData) throw new Error('Player not found');
      setPlayer(playerData as any);

      const { data: teamData } = await supabase
        .from('teams')
        .select('club_id')
        .eq('id', team_id)
        .single();

      setClubId((teamData as any)?.club_id || null);

      const initialScores: Record<string, number> = {};
      DIMENSIONS.forEach((dim) => {
        dim.attributes.forEach((attr) => {
          initialScores[attr.key] = 5;
        });
      });
      setScores(initialScores);
    } catch (err) {
      console.error('Error fetching player:', err);
    } finally {
      setLoading(false);
    }
  };

  const setScore = (key: string, value: number) => {
    setScores((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!user || !player || !player_id || !team_id) return;

    setSaving(true);
    try {
      const playerName = `${player.first_name} ${player.last_name}`;
      const jerseyNumber = player.jersey_number;

      const { data: evaluation, error: evalError } = await supabase
        .from('player_evaluations')
        .insert({
          player_id,
          team_id,
          club_id: clubId,
          player_name: playerName,
          jersey_number: jerseyNumber,
          coach_personal_note: coachNotes.trim() || null,
          is_visible_to_player: isVisibleToPlayer,
        })
        .select('id')
        .single();

      if (evalError) throw evalError;

      const evaluationId = (evaluation as any).id;

      const scoresToInsert: {
        evaluation_id: string;
        attribute_name: string;
        dimension: string;
        score: number;
        score_max: number;
      }[] = [];

      DIMENSIONS.forEach((dim) => {
        dim.attributes.forEach((attr) => {
          const score = scores[attr.key] ?? 5;
          scoresToInsert.push({
            evaluation_id: evaluationId,
            attribute_name: attr.key,
            dimension: dim.key,
            score,
            score_max: SCORE_MAX,
          });
        });
      });

      const { error: scoresError } = await supabase
        .from('evaluation_scores')
        .insert(scoresToInsert);

      if (scoresError) throw scoresError;

      Alert.alert('Success', 'Evaluation saved.', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (err: any) {
      console.error('Error saving evaluation:', err);
      Alert.alert('Error', err.message || 'Could not save evaluation.');
    } finally {
      setSaving(false);
    }
  };

  const renderScoreRow = (attrKey: string, attrLabel: string) => {
    const value = scores[attrKey] ?? 5;
    return (
      <View key={attrKey} style={styles.scoreRow}>
        <Text style={styles.scoreLabel}>{attrLabel}</Text>
        <View style={styles.scoreButtons}>
          {Array.from({ length: SCORE_MAX }, (_, i) => i + 1).map((n) => (
            <TouchableOpacity
              key={n}
              style={[
                styles.scoreButton,
                value === n && styles.scoreButtonSelected,
              ]}
              onPress={() => setScore(attrKey, n)}
            >
              <Text
                style={[
                  styles.scoreButtonText,
                  value === n && styles.scoreButtonTextSelected,
                ]}
              >
                {n}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!player) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Player not found</Text>
      </View>
    );
  }

  const playerName = `${player.first_name} ${player.last_name}`;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.playerName}>{playerName}</Text>
          <Text style={styles.jerseyText}>
            #{player.jersey_number ?? '—'}
          </Text>
        </View>

        {DIMENSIONS.map((dim) => (
          <View key={dim.key} style={styles.section}>
            <Text style={styles.sectionTitle}>{dim.label}</Text>
            {dim.attributes.map((attr) =>
              renderScoreRow(attr.key, attr.label)
            )}
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coach Notes</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Personal notes (optional)"
            placeholderTextColor="#666"
            value={coachNotes}
            onChangeText={setCoachNotes}
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Visible to player/parent</Text>
          <Switch
            value={isVisibleToPlayer}
            onValueChange={setIsVisibleToPlayer}
            trackColor={{ false: '#3a3a6e', true: '#8b5cf6' }}
            thumbColor="#fff"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Evaluation'}
          </Text>
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scroll: {
    flex: 1,
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
  playerName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  jerseyText: {
    color: '#8b5cf6',
    fontSize: 16,
    marginTop: 4,
  },
  section: {
    backgroundColor: '#2a2a4e',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#a78bfa',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  scoreRow: {
    marginBottom: 12,
  },
  scoreLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  scoreButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  scoreButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#3a3a6e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreButtonSelected: {
    backgroundColor: '#8b5cf6',
  },
  scoreButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  scoreButtonTextSelected: {
    color: '#fff',
  },
  notesInput: {
    backgroundColor: '#3a3a6e',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
  },
  toggleLabel: {
    color: '#fff',
    fontSize: 15,
  },
  saveButton: {
    marginHorizontal: 16,
    backgroundColor: '#22c55e',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomPadding: {
    height: 40,
  },
});

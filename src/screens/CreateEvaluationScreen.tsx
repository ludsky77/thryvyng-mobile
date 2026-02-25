import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Slider } from '@miblanchard/react-native-slider';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/** Format date as YYYY-MM-DD (local date, no timezone shift) */
function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const EVALUATION_ATTRIBUTES = {
  technical: [
    { id: '938b9d53-acd1-43de-befa-2bfcddea12ac', name: 'Passing' },
    { id: 'd416a8ed-718c-45db-8e8c-80ed6c762ddb', name: 'Dribbling' },
    { id: 'b7039c12-98df-444b-a85d-4b6f03d546fa', name: 'Shooting' },
    { id: '626a8680-8f1d-47fe-9ab3-3f0bae6edbcb', name: 'First touch' },
    { id: '0c5b365e-3b62-4ee1-b8b2-7f5f45b8be15', name: 'Ball control' },
  ],
  tactical: [
    { id: '0aae3aa1-1541-48ef-bd44-2be1e7a6d951', name: 'Role understanding' },
    { id: 'ab8e0e1e-1fc4-43c5-8e4a-aef6f8b31a82', name: 'Task execution' },
    { id: 'fa8d6cdf-f8b9-49ed-8808-f2b6beb2a4da', name: 'Spatial awareness' },
    { id: 'a98e85f9-0a77-42a5-9449-eea233efbdfc', name: 'Reading the game' },
    { id: '414ee161-393d-4dd6-ad47-0b3a8b7d8093', name: 'Decision making' },
  ],
  psychological: [
    { id: '0512ae2d-2245-4ea8-8939-e8bc2e590113', name: 'Resilience' },
    { id: '59303d5c-bb65-439a-b40f-c91cea0468bd', name: 'Focus' },
    { id: 'c2c7fefd-3598-42eb-88dd-4d7084d53e44', name: 'Confidence' },
    { id: '42d9afa5-31e1-47e2-9012-45bc3cd6773f', name: 'Coachability' },
    { id: 'b527d71f-d076-430b-9e85-623c46cd5f9a', name: 'Competitiveness' },
  ],
  physiological: [
    { id: 'ce869f2f-6478-4134-adb2-ac374b860f0a', name: 'Endurance' },
    { id: '5da9bb56-76c6-4734-8bad-b78f9f00ce9e', name: 'Explosiveness' },
    { id: '8fe0c149-b206-4a62-929e-402fd0674a86', name: 'Agility' },
    { id: 'a6401e63-4174-4283-9564-4cfa910212c0', name: 'Strength' },
    { id: 'fe6319ab-6e81-40cc-bdbb-261eed8def88', name: 'Speed' },
  ],
};

const DIMENSIONS = [
  { key: 'technical', label: 'Technical', icon: 'football', color: '#06B6D4' },
  { key: 'tactical', label: 'Tactical', icon: 'bulb', color: '#F59E0B' },
  { key: 'psychological', label: 'Mental', icon: 'flash', color: '#EC4899' },
  { key: 'physiological', label: 'Physical', icon: 'barbell', color: '#10B981' },
];

const AWARDS = [
  { id: '3e5b0a9d-59e5-49a5-8bf3-ff4782ea9091', name: 'Rising Star', tagline: 'Most Improved', color: '#EC4899' },
  { id: '397d36f5-1a1b-4de3-9f2b-e846ef1e4809', name: 'The Engine', tagline: 'Tireless Worker', color: '#3B82F6' },
  { id: '64f7decf-3502-434d-bb40-4a13093576b1', name: 'The Leader', tagline: 'Team Captain', color: '#F59E0B' },
  { id: '8c02a075-9e63-4adb-9c74-d93e3e1cc18c', name: 'The Playmaker', tagline: 'Vision & Creativity', color: '#10B981' },
  { id: 'ad1575b0-534d-4141-bc2f-65e48f94e7ce', name: 'The Technician', tagline: 'Technical Mastery', color: '#8B5CF6' },
  { id: 'f10dc420-bf73-4608-bc8f-a98140f827d9', name: 'The Wall', tagline: 'Defensive Excellence', color: '#EF4444' },
];

const EVALUATION_SESSIONS = [
  { id: 'spring', label: 'Spring Season', value: 'Spring 2026' },
  { id: 'summer', label: 'Summer Season', value: 'Summer 2026' },
  { id: 'fall', label: 'Fall Season', value: 'Fall 2026' },
  { id: 'winter', label: 'Winter Season', value: 'Winter 2025-26' },
  { id: 'tryout', label: 'Tryout Evaluation', value: 'Tryout 2026' },
  { id: 'midseason', label: 'Mid-Season Check', value: 'Mid-Season 2026' },
  { id: 'endseason', label: 'End of Season', value: 'End of Season 2026' },
];

const POSITION_GROUPS = [
  {
    label: 'Goalkeepers',
    positions: [{ id: 'GK', label: 'Goalkeeper' }],
  },
  {
    label: 'Defenders',
    positions: [
      { id: 'CB', label: 'Center Back' },
      { id: 'LB', label: 'Left Back' },
      { id: 'RB', label: 'Right Back' },
    ],
  },
  {
    label: 'Midfielders',
    positions: [
      { id: 'CDM', label: 'Def. Mid' },
      { id: 'CM', label: 'Center Mid' },
      { id: 'CAM', label: 'Att. Mid' },
      { id: 'LM', label: 'Left Mid' },
      { id: 'RM', label: 'Right Mid' },
    ],
  },
  {
    label: 'Forwards',
    positions: [
      { id: 'LW', label: 'Left Wing' },
      { id: 'RW', label: 'Right Wing' },
      { id: 'ST', label: 'Striker' },
      { id: 'CF', label: 'Center Fwd' },
    ],
  },
];

interface RouteParams {
  playerId?: string;
  player_id?: string;
  playerName?: string;
  jerseyNumber?: number | null;
  teamId?: string;
  team_id?: string;
}

export default function CreateEvaluationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const params = route.params || {};
  const playerId = params.playerId ?? params.player_id ?? '';
  const teamId = params.teamId ?? params.team_id ?? '';
  const playerName = params.playerName ?? 'Player';
  const jerseyNumber = params.jerseyNumber ?? null;

  const { user, currentRole } = useAuth();

  const [activeTab, setActiveTab] = useState<'technical' | 'tactical' | 'psychological' | 'physiological'>('technical');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [selectedAward, setSelectedAward] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState(EVALUATION_SESSIONS[0].value);
  const [coachNote, setCoachNote] = useState('');
  const [isVisibleToPlayer, setIsVisibleToPlayer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [includeSignature, setIncludeSignature] = useState(true);

  useEffect(() => {
    const initialScores: Record<string, number> = {};
    Object.values(EVALUATION_ATTRIBUTES)
      .flat()
      .forEach((attr) => {
        initialScores[attr.id] = 5;
      });
    setScores(initialScores);
  }, []);

  const handleScoreChange = (attributeId: string, value: number) => {
    setScores((prev) => ({
      ...prev,
      [attributeId]: Math.round(value),
    }));
  };

  const getDimensionAverage = (dimension: string) => {
    const attrs = EVALUATION_ATTRIBUTES[dimension as keyof typeof EVALUATION_ATTRIBUTES];
    const total = attrs.reduce((sum, attr) => sum + (scores[attr.id] ?? 5), 0);
    return (total / attrs.length).toFixed(1);
  };

  const togglePosition = (posId: string) => {
    setSelectedPositions((prev) => {
      if (prev.includes(posId)) {
        return prev.filter((p) => p !== posId);
      } else if (prev.length < 4) {
        return [...prev, posId];
      }
      return prev;
    });
  };

  const getPositionRank = (posId: string): number | null => {
    const index = selectedPositions.indexOf(posId);
    return index >= 0 ? index + 1 : null;
  };

  const getPositionColor = (rank: number): string => {
    switch (rank) {
      case 1:
        return '#EF4444';
      case 2:
        return '#F97316';
      case 3:
        return '#FBBF24';
      case 4:
        return '#10B981';
      default:
        return '#6B7280';
    }
  };

  const handleSave = async () => {
    if (!playerId || !teamId) {
      Alert.alert('Error', 'Missing player or team');
      return;
    }
    if (selectedPositions.length === 0) {
      Alert.alert('Required', 'Please select at least a primary position for the player.');
      return;
    }
    try {
      setSaving(true);

      const { data: teamData } = await supabase
        .from('teams')
        .select('club_id, name')
        .eq('id', teamId)
        .single();

      const clubId = teamData?.club_id ?? null;
      const teamName = teamData?.name ?? currentRole?.team?.name ?? 'your coach';

      const { data: evaluation, error: evalError } = await supabase
        .from('player_evaluations')
        .insert({
          // Required fields
          team_id: teamId,
          club_id: clubId,
          player_name: playerName,
          season_name: selectedSession,
          evaluator_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Coach',
          evaluator_title: 'Head Coach',
          // Optional fields
          player_id: playerId,
          jersey_number: jerseyNumber,
          award_id: selectedAward,
          coach_personal_note: coachNote || null,
          is_visible_to_player: isVisibleToPlayer,
          evaluator_id: user?.id,
          scale_type: '1-10',
          scale_max: 10,
          evaluation_date: formatDateLocal(new Date()),
          // Positions
          primary_position: selectedPositions[0] || null,
          secondary_position: selectedPositions[1] || null,
          third_position: selectedPositions[2] || null,
          fourth_position: selectedPositions[3] || null,
          // Signature
          signature_1_name: includeSignature ? (user?.user_metadata?.full_name || 'Coach') : null,
          signature_1_title: includeSignature ? 'Head Coach' : null,
        })
        .select()
        .single();

      if (evalError) throw evalError;

      const scoreRecords = Object.entries(scores).map(([attributeId, score]) => {
        let dimension = 'technical';
        let attrName = '';
        for (const [dim, attrs] of Object.entries(EVALUATION_ATTRIBUTES)) {
          const found = attrs.find((a) => a.id === attributeId);
          if (found) {
            dimension = dim;
            attrName = found.name;
            break;
          }
        }
        return {
          evaluation_id: evaluation.id,
          attribute_id: attributeId,
          attribute_name: attrName,
          dimension,
          score,
          score_max: 10,
        };
      });

      const { error: scoresError } = await supabase.from('evaluation_scores').insert(scoreRecords);
      if (scoresError) throw scoresError;

      if (isVisibleToPlayer && playerId) {
        try {
          const { data: playerData } = await supabase
            .from('players')
            .select('user_id, parent_email')
            .eq('id', playerId)
            .single();

          let notifyUserId = playerData?.user_id;

          if (!notifyUserId && playerData?.parent_email) {
            const { data: userData } = await supabase
              .from('profiles')
              .select('id')
              .eq('email', playerData.parent_email)
              .single();
            notifyUserId = userData?.id;
          }

          if (notifyUserId) {
            await supabase.from('notif_history').insert({
              user_id: notifyUserId,
              notification_type: 'evaluation',
              title: '📋 New Evaluation Available',
              body: `Your evaluation from ${teamName} is ready to view.`,
              reference_type: 'player_evaluation',
              reference_id: evaluation.id,
              is_read: false,
            });
            console.log('Notification created for user:', notifyUserId);
          } else {
            console.log('Could not find user to notify for player:', playerId);
          }
        } catch (notifError) {
          console.error('Error creating notification:', notifError);
        }
      }

      Alert.alert(
        'Evaluation Saved',
        isVisibleToPlayer
          ? `${playerName}'s evaluation has been saved and shared with the player.`
          : `${playerName}'s evaluation has been saved.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      console.error('Error saving evaluation:', err);
      Alert.alert('Error', err.message || 'Failed to save evaluation');
    } finally {
      setSaving(false);
    }
  };

  const renderScoreSlider = (attribute: { id: string; name: string }) => (
    <View key={attribute.id} style={styles.sliderContainer}>
      <View style={styles.sliderHeader}>
        <Text style={styles.attributeName}>{attribute.name}</Text>
        <Text style={styles.scoreValue}>{scores[attribute.id] ?? 5}</Text>
      </View>
      <Slider
        containerStyle={styles.slider}
        trackStyle={styles.sliderTrack}
        minimumValue={1}
        maximumValue={10}
        step={1}
        value={scores[attribute.id] ?? 5}
        onValueChange={(value) => handleScoreChange(attribute.id, Array.isArray(value) ? value[0] : value)}
        minimumTrackTintColor={DIMENSIONS.find((d) => d.key === activeTab)?.color ?? '#8B5CF6'}
        maximumTrackTintColor="#374151"
        thumbTintColor="#FFFFFF"
      />
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>1</Text>
        <Text style={styles.sliderLabel}>10</Text>
      </View>
    </View>
  );

  const initials = playerName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={styles.container}>
      <View style={styles.playerHeader}>
        <View style={styles.playerAvatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View>
          <Text style={styles.playerName}>{playerName}</Text>
          {jerseyNumber != null && <Text style={styles.jerseyNumber}>#{jerseyNumber}</Text>}
        </View>
      </View>

      <View style={styles.tabsContainer}>
        {DIMENSIONS.map((dim) => (
          <TouchableOpacity
            key={dim.key}
            style={[
              styles.tab,
              activeTab === dim.key && styles.tabActive,
            ]}
            onPress={() => setActiveTab(dim.key)}
          >
            <View
              style={[
                styles.tabIconContainer,
                { backgroundColor: activeTab === dim.key ? dim.color + '30' : '#374151' },
              ]}
            >
              <Ionicons
                name={dim.icon as any}
                size={20}
                color={activeTab === dim.key ? dim.color : '#6B7280'}
              />
            </View>
            <Text
              style={[
                styles.tabLabel,
                activeTab === dim.key && { color: dim.color },
              ]}
            >
              {dim.label}
            </Text>
            <Text
              style={[
                styles.tabAverage,
                { color: activeTab === dim.key ? dim.color : '#6B7280' },
              ]}
            >
              {getDimensionAverage(dim.key)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.slidersSection}>
          {EVALUATION_ATTRIBUTES[activeTab].map((attr) => renderScoreSlider(attr))}
        </View>

        {/* Player Positions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Player Positions *</Text>
          <Text style={styles.fieldHint}>Tap to select up to 4 positions (first = primary)</Text>

          <TouchableOpacity
            style={styles.positionSelector}
            onPress={() => setShowPositionModal(true)}
          >
            {selectedPositions.length === 0 ? (
              <Text style={styles.positionPlaceholder}>Select positions...</Text>
            ) : (
              <View style={styles.selectedPositionsRow}>
                {selectedPositions.map((pos, index) => (
                  <View
                    key={pos}
                    style={[
                      styles.selectedPositionChip,
                      {
                        backgroundColor: getPositionColor(index + 1) + '20',
                        borderColor: getPositionColor(index + 1),
                      },
                    ]}
                  >
                    <Text style={[styles.selectedPositionRank, { color: getPositionColor(index + 1) }]}>
                      {index + 1}.
                    </Text>
                    <Text style={[styles.selectedPositionText, { color: getPositionColor(index + 1) }]}>
                      {pos}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Evaluation Session */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evaluation For</Text>
          <View style={styles.sessionGrid}>
            {EVALUATION_SESSIONS.map((session) => (
              <TouchableOpacity
                key={session.id}
                style={[
                  styles.sessionChip,
                  selectedSession === session.value && styles.sessionChipActive,
                ]}
                onPress={() => setSelectedSession(session.value)}
              >
                <Text
                  style={[
                    styles.sessionChipText,
                    selectedSession === session.value && styles.sessionChipTextActive,
                  ]}
                >
                  {session.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Award (Optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.awardsRow}>
              {AWARDS.map((award) => (
                <TouchableOpacity
                  key={award.id}
                  style={[
                    styles.awardCard,
                    selectedAward === award.id && {
                      borderColor: award.color,
                      backgroundColor: award.color + '20',
                    },
                  ]}
                  onPress={() => setSelectedAward(selectedAward === award.id ? null : award.id)}
                >
                  <Ionicons
                    name="trophy"
                    size={24}
                    color={selectedAward === award.id ? award.color : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.awardName,
                      selectedAward === award.id && { color: award.color },
                    ]}
                  >
                    {award.name}
                  </Text>
                  <Text style={styles.awardTagline}>{award.tagline}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coach's Note (Optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Add a personal message for the player..."
            placeholderTextColor="#6B7280"
            multiline
            numberOfLines={4}
            value={coachNote}
            onChangeText={setCoachNote}
            textAlignVertical="top"
          />
        </View>

        {/* Signature Toggle */}
        <TouchableOpacity
          style={styles.signatureToggle}
          onPress={() => setIncludeSignature(!includeSignature)}
        >
          <View style={styles.visibilityLeft}>
            <Ionicons
              name={includeSignature ? 'create' : 'create-outline'}
              size={24}
              color={includeSignature ? '#8B5CF6' : '#6B7280'}
            />
            <View>
              <Text style={styles.visibilityTitle}>Include My Signature</Text>
              <Text style={styles.visibilitySubtitle}>
                {includeSignature
                  ? `Signed by ${user?.user_metadata?.full_name || 'Coach'}`
                  : 'No signature will be added'}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.toggleTrack,
              includeSignature && styles.toggleTrackActive,
              includeSignature && { backgroundColor: '#8B5CF6' },
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                includeSignature && styles.toggleThumbActive,
              ]}
            />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.visibilityToggle}
          onPress={() => setIsVisibleToPlayer(!isVisibleToPlayer)}
        >
          <View style={styles.visibilityLeft}>
            <Ionicons
              name={isVisibleToPlayer ? 'eye' : 'eye-off'}
              size={24}
              color={isVisibleToPlayer ? '#10B981' : '#6B7280'}
            />
            <View>
              <Text style={styles.visibilityTitle}>Share with Player</Text>
              <Text style={styles.visibilitySubtitle}>
                {isVisibleToPlayer
                  ? 'Player will see this evaluation'
                  : 'Only visible to coaches'}
              </Text>
            </View>
          </View>
          <View style={[styles.toggleTrack, isVisibleToPlayer && styles.toggleTrackActive]}>
            <View style={[styles.toggleThumb, isVisibleToPlayer && styles.toggleThumbActive]} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Save Evaluation</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Position Selection Modal */}
      <Modal
        visible={showPositionModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPositionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.positionModalContainer}>
            <View style={styles.positionModalHeader}>
              <Text style={styles.positionModalTitle}>Select Positions</Text>
              <TouchableOpacity onPress={() => setShowPositionModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.positionModalHint}>
              Tap positions in order (1st = primary, max 4)
            </Text>

            <ScrollView style={styles.positionModalScroll}>
              {POSITION_GROUPS.map((group) => (
                <View key={group.label} style={styles.positionGroup}>
                  <Text style={styles.positionGroupLabel}>{group.label}</Text>
                  <View style={styles.positionGroupRow}>
                    {group.positions.map((pos) => {
                      const rank = getPositionRank(pos.id);
                      const isSelected = rank !== null;
                      return (
                        <TouchableOpacity
                          key={pos.id}
                          style={[
                            styles.positionModalChip,
                            isSelected && {
                              backgroundColor: getPositionColor(rank!) + '20',
                              borderColor: getPositionColor(rank!),
                            },
                          ]}
                          onPress={() => togglePosition(pos.id)}
                        >
                          {isSelected && (
                            <View
                              style={[
                                styles.positionRankBadge,
                                { backgroundColor: getPositionColor(rank!) },
                              ]}
                            >
                              <Text style={styles.positionRankText}>{rank}</Text>
                            </View>
                          )}
                          <Text
                            style={[
                              styles.positionModalChipText,
                              isSelected && { color: getPositionColor(rank!) },
                            ]}
                          >
                            {pos.id}
                          </Text>
                          <Text style={styles.positionModalChipLabel}>{pos.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            {selectedPositions.length > 0 && (
              <View style={styles.positionSummary}>
                <Text style={styles.positionSummaryText}>
                  Selected: {selectedPositions.map((p, i) => `${i + 1}.${p}`).join('  ')}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.positionDoneButton,
                selectedPositions.length === 0 && styles.positionDoneButtonDisabled,
              ]}
              onPress={() => setShowPositionModal(false)}
              disabled={selectedPositions.length === 0}
            >
              <Text style={styles.positionDoneButtonText}>
                Done ({selectedPositions.length} selected)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1F2937',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  playerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  playerName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  jerseyNumber: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 2,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#1F2937',
  },
  tabActive: {
    backgroundColor: '#374151',
    borderWidth: 1,
    borderColor: '#06B6D4',
  },
  tabIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tabLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
  },
  tabAverage: {
    color: '#06B6D4',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  slidersSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  sliderContainer: {
    marginBottom: 2,
    paddingVertical: 0,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
    paddingVertical: 0,
  },
  attributeName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  scoreValue: {
    color: '#A78BFA',
    fontSize: 18,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'right',
  },
  slider: {
    width: '100%',
    height: 24,
    marginVertical: 0,
  },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 0,
    marginTop: -2,
    marginBottom: 0,
  },
  sliderLabel: {
    color: '#6B7280',
    fontSize: 11,
  },
  section: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  sessionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sessionChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  sessionChipActive: {
    backgroundColor: '#8B5CF620',
    borderColor: '#8B5CF6',
  },
  sessionChipText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  sessionChipTextActive: {
    color: '#8B5CF6',
  },
  awardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  awardCard: {
    width: 100,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1F2937',
    borderWidth: 2,
    borderColor: '#374151',
    alignItems: 'center',
  },
  awardName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  awardTagline: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  noteInput: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#374151',
  },
  fieldLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
  },
  fieldHint: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 8,
  },
  positionSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  positionPlaceholder: {
    color: '#6B7280',
    fontSize: 15,
  },
  selectedPositionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  selectedPositionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectedPositionRank: {
    fontSize: 12,
    fontWeight: '700',
    marginRight: 2,
  },
  selectedPositionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  positionModalContainer: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 30,
  },
  positionModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  positionModalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  positionModalHint: {
    color: '#9CA3AF',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  positionModalScroll: {
    padding: 16,
  },
  positionGroup: {
    marginBottom: 20,
  },
  positionGroupLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  positionGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  positionModalChip: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    minWidth: 70,
    position: 'relative',
  },
  positionRankBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionRankText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  positionModalChipText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  positionModalChipLabel: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 2,
  },
  positionSummary: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111827',
  },
  positionSummaryText: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
  },
  positionDoneButton: {
    backgroundColor: '#8B5CF6',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  positionDoneButtonDisabled: {
    backgroundColor: '#4B5563',
  },
  positionDoneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  signatureToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginHorizontal: 16,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    marginTop: 8,
  },
  visibilityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginHorizontal: 16,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    marginTop: 8,
  },
  visibilityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  visibilityTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  visibilitySubtitle: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  toggleTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#374151',
    padding: 2,
  },
  toggleTrackActive: {
    backgroundColor: '#10B981',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useInvitation } from '../../hooks/useInvitation';
import InvitationStepIndicator from '../../components/invitation/InvitationStepIndicator';
import QuestionField from '../../components/invitation/QuestionField';

interface SelectedPlayer {
  placementId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  packageId: string;
  packageName: string;
  packagePrice: number;
}

interface RouteParams {
  token: string;
  packageId?: string;
  selectedPlayers?: SelectedPlayer[];
}

export default function InvitationQuestionsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const {
    token,
    packageId: paramPackageId,
    selectedPlayers: paramSelectedPlayers,
  } = route.params as RouteParams;

  const { invitation, loading: invLoading } = useInvitation(token);

  // Build players list from params or single player from invitation
  const selectedPlayers = useMemo((): SelectedPlayer[] => {
    if (paramSelectedPlayers && paramSelectedPlayers.length > 0) {
      return paramSelectedPlayers;
    }
    if (invitation) {
      const pkg = invitation.packages?.[0];
      const pkgId = paramPackageId || pkg?.id;
      return [
        {
          placementId: invitation.placement.id,
          playerId: invitation.player.id,
          playerName: `${invitation.player.first_name} ${invitation.player.last_name}`,
          teamId: invitation.team.id,
          teamName: invitation.team.name,
          packageId: pkgId || '',
          packageName: pkg?.name || '',
          packagePrice: pkg?.price || 0,
        },
      ];
    }
    return [];
  }, [paramSelectedPlayers, invitation, paramPackageId]);

  const questions = invitation?.questions ?? [];
  const clubName = invitation?.club?.name ?? '';
  const volunteerPositions = invitation?.volunteer_positions ?? [];
  const programSettings = invitation?.program_settings ?? {
    donations_enabled: false,
    financial_aid_enabled: false,
  };
  const loading = invLoading;

  const [answers, setAnswers] = useState<Record<string, Record<string, any>>>({});
  const [familyAnswers, setFamilyAnswers] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shouldSkip, setShouldSkip] = useState(false);

  // Separate family vs player questions (support DB values: program, family, player)
  const familyScopes = ['per_family', 'program', 'family'];
  const familyQuestions = useMemo(
    () =>
      questions.filter(
        (q) =>
          !q.question_scope ||
          familyScopes.includes(q.question_scope as string),
      ),
    [questions],
  );

  const playerScopes = ['per_player', 'player'];
  const playerQuestions = useMemo(
    () =>
      questions.filter((q) =>
        playerScopes.includes(q.question_scope as string),
      ),
    [questions],
  );

  const totalQuestions = familyQuestions.length + playerQuestions.length;

  const packageId = paramPackageId || invitation?.packages?.[0]?.id || '';

  // Auto-skip if no questions
  useEffect(() => {
    if (!loading && totalQuestions === 0 && selectedPlayers.length > 0) {
      setShouldSkip(true);
      (navigation as any).replace('InvitationPayment', {
        token,
        packageId,
        selectedPlayers,
      });
    }
  }, [loading, totalQuestions, navigation, token, packageId, selectedPlayers]);

  const steps = useMemo(
    () => [
      { number: 1, label: 'Review', enabled: true },
      { number: 2, label: 'Questions', enabled: true },
      { number: 3, label: 'Payment', enabled: true },
      {
        number: 4,
        label: 'Volunteer',
        enabled: volunteerPositions.length > 0,
      },
      {
        number: 5,
        label: 'Donate',
        enabled: programSettings.donations_enabled,
      },
      {
        number: 6,
        label: 'Aid',
        enabled: programSettings.financial_aid_enabled,
      },
      { number: 7, label: 'Checkout', enabled: true },
    ],
    [volunteerPositions.length, programSettings],
  );

  const handleFamilyAnswerChange = (questionId: string, value: any) => {
    setFamilyAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (errors[`family_${questionId}`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`family_${questionId}`];
        return next;
      });
    }
  };

  const handlePlayerAnswerChange = (
    playerId: string,
    questionId: string,
    value: any,
  ) => {
    setAnswers((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] || {}), [questionId]: value },
    }));
    if (errors[`${playerId}_${questionId}`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`${playerId}_${questionId}`];
        return next;
      });
    }
  };

  const validateAnswers = (): boolean => {
    const nextErrors: Record<string, string> = {};

    // Validate family questions
    for (const q of familyQuestions) {
      if (q.is_required) {
        const answer = familyAnswers[q.id];
        if (!answer || (Array.isArray(answer) && answer.length === 0)) {
          nextErrors[`family_${q.id}`] = 'Required';
        }
      }
    }

    // Validate player questions for each selected player
    for (const player of selectedPlayers) {
      for (const q of playerQuestions) {
        if (q.is_required) {
          const answer = answers[player.playerId]?.[q.id];
          if (!answer || (Array.isArray(answer) && answer.length === 0)) {
            nextErrors[`${player.playerId}_${q.id}`] = 'Required';
          }
        }
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleContinue = () => {
    if (!validateAnswers()) return;

    const combinedAnswers = {
      family: familyAnswers,
      players: answers,
    };

    (navigation as any).navigate('InvitationPayment', {
      token,
      packageId,
      selectedPlayers,
      answers: combinedAnswers,
    });
  };

  if (loading || shouldSkip) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ade80" />
          <Text style={styles.loadingText}>
            {shouldSkip ? '' : 'Loading...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Registration Questions</Text>
          <Text style={styles.headerSub}>{clubName}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <InvitationStepIndicator currentStep={2} steps={steps} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Family Questions */}
        {familyQuestions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="people" size={20} color="#4ade80" />
              <Text style={styles.sectionTitle}>General Questions</Text>
            </View>
            <Text style={styles.sectionSubtitle}>
              These apply to your entire registration
            </Text>

            {familyQuestions.map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                value={familyAnswers[question.id]}
                onChange={(v) => handleFamilyAnswerChange(question.id, v)}
                error={errors[`family_${question.id}`]}
              />
            ))}
          </View>
        )}

        {/* Player-Specific Questions - one section per player */}
        {playerQuestions.length > 0 &&
          selectedPlayers.map((player) => (
            <View key={player.playerId} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="person" size={20} color="#4ade80" />
                <Text style={styles.sectionTitle}>
                  Questions for {player.playerName}
                </Text>
              </View>
              <View style={styles.playerBadge}>
                <Text style={styles.playerBadgeText}>{player.teamName}</Text>
              </View>

              {playerQuestions.map((question) => (
                <QuestionField
                  key={`${player.playerId}_${question.id}`}
                  question={question}
                  value={answers[player.playerId]?.[question.id]}
                  onChange={(v) =>
                    handlePlayerAnswerChange(player.playerId, question.id, v)
                  }
                  error={errors[`${player.playerId}_${question.id}`]}
                />
              ))}
            </View>
          ))}

        <View style={styles.requiredNote}>
          <Text style={styles.requiredNoteText}>
            <Text style={styles.requiredStar}>*</Text> Required fields
          </Text>
        </View>
      </ScrollView>

      <View style={styles.bottom}>
        <TouchableOpacity style={styles.continueBtn} onPress={handleContinue}>
          <Text style={styles.continueBtnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color="#000" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerSub: {
    color: '#888',
    fontSize: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionSubtitle: {
    color: '#888',
    fontSize: 12,
    marginBottom: 16,
  },
  playerBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  playerBadgeText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '500',
  },
  requiredNote: {
    alignItems: 'center',
    marginTop: 8,
  },
  requiredNoteText: {
    color: '#888',
    fontSize: 12,
  },
  requiredStar: {
    color: '#ef4444',
  },
  bottom: {
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  continueBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#4ade80',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  continueBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});

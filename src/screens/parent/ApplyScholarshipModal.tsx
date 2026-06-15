import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type HouseholdStructure = 'single_parent' | 'two_parent' | 'guardian' | 'other';
type IncomeRange =
  | 'under_30k'
  | '30k_to_60k'
  | '60k_to_100k'
  | 'over_100k'
  | 'prefer_not_to_say';

const HOUSEHOLD_OPTIONS: { value: HouseholdStructure; label: string }[] = [
  { value: 'single_parent', label: 'Single parent' },
  { value: 'two_parent', label: 'Two parents' },
  { value: 'guardian', label: 'Guardian / other arrangement' },
  { value: 'other', label: 'Other' },
];

const INCOME_OPTIONS: { value: IncomeRange; label: string }[] = [
  { value: 'under_30k', label: 'Under $30,000' },
  { value: '30k_to_60k', label: '$30,000 - $60,000' },
  { value: '60k_to_100k', label: '$60,000 - $100,000' },
  { value: 'over_100k', label: 'Over $100,000' },
  { value: 'prefer_not_to_say', label: 'Prefer not to disclose' },
];

interface ApplyScholarshipModalProps {
  visible: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  onSubmitted: () => void;
}

export default function ApplyScholarshipModal({
  visible,
  onClose,
  playerId,
  playerName,
  onSubmitted,
}: ApplyScholarshipModalProps) {
  const { user } = useAuth();

  const [reasonText, setReasonText] = useState('');
  const [householdStructure, setHouseholdStructure] = useState<HouseholdStructure | null>(null);
  const [householdSize, setHouseholdSize] = useState('');
  const [kidsInClub, setKidsInClub] = useState('');
  const [incomeRange, setIncomeRange] = useState<IncomeRange | null>(null);
  const [additionalContext, setAdditionalContext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setReasonText('');
      setHouseholdStructure(null);
      setHouseholdSize('');
      setKidsInClub('');
      setIncomeRange(null);
      setAdditionalContext('');
      setErrorMessage(null);
      setSubmitting(false);
    }
  }, [visible]);

  const householdSizeNum = parseInt(householdSize, 10);
  const kidsInClubNum = parseInt(kidsInClub, 10);

  const isValid = useMemo(() => {
    return (
      reasonText.trim().length >= 10 &&
      householdStructure !== null &&
      !Number.isNaN(householdSizeNum) &&
      householdSizeNum >= 1 &&
      householdSizeNum <= 30 &&
      !Number.isNaN(kidsInClubNum) &&
      kidsInClubNum >= 1 &&
      kidsInClubNum <= 20
    );
  }, [reasonText, householdStructure, householdSizeNum, kidsInClubNum]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async () => {
    if (!isValid || !user?.id || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const { data: regData, error: regError } = await supabase
        .from('program_registrations')
        .select('id')
        .eq('player_id', playerId)
        .eq('parent_id', user.id)
        .in('status', ['completed', 'active'])
        .gt('amount_paid', 0)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (regError || !regData?.id) {
        setErrorMessage('Could not find an eligible registration for this player.');
        setSubmitting(false);
        return;
      }

      const { data, error } = await (supabase as any).rpc('submit_scholarship_application', {
        p_player_id: playerId,
        p_registration_id: regData.id,
        p_reason_text: reasonText.trim(),
        p_household_size: householdSizeNum,
        p_household_structure: householdStructure,
        p_kids_in_club: kidsInClubNum,
        p_income_range: incomeRange ?? null,
        p_additional_context: additionalContext.trim() || null,
      });

      if (error) {
        setErrorMessage(error.message || 'Failed to submit application. Please try again.');
        setSubmitting(false);
        return;
      }

      const result = data as {
        success?: boolean;
        application_id?: string;
        club_id?: string;
        registration_id?: string;
        status?: string;
      };

      if (!result?.success || !result.application_id) {
        setErrorMessage('Failed to submit application. Please try again.');
        setSubmitting(false);
        return;
      }

      try {
        await supabase.functions.invoke('send-email', {
          body: {
            template: 'scholarship-received',
            data: { application_id: result.application_id },
          },
        });
      } catch (emailErr) {
        console.error('scholarship parent confirmation email failed:', emailErr);
      }

      if (result.club_id) {
        try {
          const { data: admins } = await (supabase as any).rpc('get_club_admin_emails', {
            p_club_id: result.club_id,
          });
          for (const admin of admins ?? []) {
            if (!admin.email) continue;
            supabase.functions
              .invoke('send-email', {
                body: {
                  template: 'scholarship-admin-alert',
                  to: admin.email,
                  data: { application_id: result.application_id },
                },
              })
              .catch((err: unknown) =>
                console.error('admin alert failed:', admin.email, err),
              );
          }
        } catch (adminErr) {
          console.error('fetching club admin emails failed:', adminErr);
        }
      }

      Alert.alert(
        'Application submitted',
        "We'll respond within 3-5 business days",
      );
      onSubmitted();
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.keyboardAvoid}
            >
              <SafeAreaView edges={['bottom']} style={styles.sheet}>
                <View style={styles.header}>
                  <View style={styles.headerTextBlock}>
                    <Text style={styles.title}>Apply for Scholarship</Text>
                    <Text style={styles.subtitle}>{playerName}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleClose}
                    style={styles.closeBtn}
                    hitSlop={12}
                    disabled={submitting}
                  >
                    <Ionicons name="close" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/* Reason */}
                  <Text style={styles.label}>Briefly explain why you're applying for help</Text>
                  <Text style={styles.help}>A short explanation helps us understand your situation.</Text>
                  <TextInput
                    style={[styles.input, styles.multiline]}
                    value={reasonText}
                    onChangeText={setReasonText}
                    placeholder="Tell us about your situation..."
                    placeholderTextColor="#666"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    editable={!submitting}
                  />

                  {/* Household structure */}
                  <Text style={styles.label}>Household structure</Text>
                  <View style={styles.optionGroup}>
                    {HOUSEHOLD_OPTIONS.map((opt) => {
                      const selected = householdStructure === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.optionBtn, selected && styles.optionBtnSelected]}
                          onPress={() => setHouseholdStructure(opt.value)}
                          disabled={submitting}
                          activeOpacity={0.7}
                        >
                          <View
                            style={[styles.radioOuter, selected && styles.radioOuterSelected]}
                          >
                            {selected && <View style={styles.radioInner} />}
                          </View>
                          <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Household size */}
                  <Text style={styles.label}>
                    Total household size (including parents and kids)
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={householdSize}
                    onChangeText={setHouseholdSize}
                    placeholder="e.g. 4"
                    placeholderTextColor="#666"
                    keyboardType="number-pad"
                    editable={!submitting}
                  />

                  {/* Kids in club */}
                  <Text style={styles.label}>How many of your kids are enrolled in the club?</Text>
                  <TextInput
                    style={styles.input}
                    value={kidsInClub}
                    onChangeText={setKidsInClub}
                    placeholder="e.g. 2"
                    placeholderTextColor="#666"
                    keyboardType="number-pad"
                    editable={!submitting}
                  />

                  {/* Income range (optional) */}
                  <Text style={styles.label}>Annual household income (optional)</Text>
                  <Text style={styles.help}>
                    This helps us prioritize, but won't gate your application.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.optionBtn,
                      incomeRange === null && styles.optionBtnSelected,
                    ]}
                    onPress={() => setIncomeRange(null)}
                    disabled={submitting}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.radioOuter,
                        incomeRange === null && styles.radioOuterSelected,
                      ]}
                    >
                      {incomeRange === null && <View style={styles.radioInner} />}
                    </View>
                    <Text
                      style={[
                        styles.optionText,
                        incomeRange === null && styles.optionTextSelected,
                      ]}
                    >
                      No selection
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.optionGroup}>
                    {INCOME_OPTIONS.map((opt) => {
                      const selected = incomeRange === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.optionBtn, selected && styles.optionBtnSelected]}
                          onPress={() => setIncomeRange(opt.value)}
                          disabled={submitting}
                          activeOpacity={0.7}
                        >
                          <View
                            style={[styles.radioOuter, selected && styles.radioOuterSelected]}
                          >
                            {selected && <View style={styles.radioInner} />}
                          </View>
                          <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Additional context */}
                  <Text style={styles.label}>
                    Anything else you'd like the club to know (optional)
                  </Text>
                  <TextInput
                    style={[styles.input, styles.multiline]}
                    value={additionalContext}
                    onChangeText={setAdditionalContext}
                    placeholder="Optional additional details..."
                    placeholderTextColor="#666"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    editable={!submitting}
                  />

                  {errorMessage ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  ) : null}
                </ScrollView>

                <View style={styles.footer}>
                  <TouchableOpacity
                    style={[styles.submitBtn, (!isValid || submitting) && styles.submitBtnDisabled]}
                    onPress={() => void handleSubmit()}
                    disabled={!isValid || submitting}
                    activeOpacity={0.85}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.submitBtnText}>Submit Application</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </SafeAreaView>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  keyboardAvoid: {
    maxHeight: '92%',
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  headerTextBlock: { flex: 1 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  subtitle: { color: '#888', fontSize: 13, marginTop: 2 },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flexGrow: 0 },
  scrollContent: { padding: 16, paddingBottom: 8 },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 12,
  },
  help: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 17,
  },
  input: {
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  multiline: {
    minHeight: 96,
    paddingTop: 12,
  },
  optionGroup: { gap: 6, marginTop: 4 },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
  },
  optionBtnSelected: {
    borderColor: '#8b5cf6',
    backgroundColor: '#8b5cf622',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: { borderColor: '#8b5cf6' },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#8b5cf6',
  },
  optionText: { color: '#aaa', fontSize: 14, flex: 1 },
  optionTextSelected: { color: '#fff', fontWeight: '500' },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  errorText: { color: '#ef4444', fontSize: 13, lineHeight: 18 },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  submitBtn: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitBtnDisabled: { backgroundColor: '#444', opacity: 0.7 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
  Modal,
  FlatList,
  Linking,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import type { RootStackParamList } from '../../navigation/linking';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'ProgramRegistration'>;

interface Program {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  registration_start: string | null;
  registration_end: string | null;
  club: {
    id: string;
    name: string;
    logo_url: string | null;
  } | null;
  season: {
    id: string;
    name: string;
  } | null;
}

interface Package {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  email?: string;
  jersey_number?: string;
}

interface ProgramQuestion {
  id: string;
  label: string;
  field_type: string;
  is_required: boolean;
  options: string[];
  question_scope: string;
}

interface PlayerRegistration {
  player: Player;
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
  };
  medicalInfo: {
    allergies: string;
    medicalNotes: string;
  };
  questionAnswers: Record<string, string | string[]>;
  isNew: boolean;
}

type RegistrationStep = 'auth' | 'package' | 'players' | 'review' | 'complete';

const STEPS: { key: RegistrationStep; label: string; description: string }[] = [
  { key: 'auth', label: 'Sign In', description: 'Create or sign into your account' },
  { key: 'package', label: 'Select Package', description: 'Choose your registration option' },
  { key: 'players', label: 'Select Players', description: 'Choose which players to register' },
  { key: 'review', label: 'Review & Pay', description: 'Complete registration' },
];

export const ProgramRegistrationScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId } = route.params;
  const { user } = useAuth();
  const { setPendingProgramId } = useRegistration();

  // Screen state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);

  // Registration state
  const [currentStep, setCurrentStep] = useState<RegistrationStep>('auth');
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);

  // Player state
  const [existingPlayers, setExistingPlayers] = useState<Player[]>([]);
  const [programQuestions, setProgramQuestions] = useState<ProgramQuestion[]>([]);
  const [registrations, setRegistrations] = useState<PlayerRegistration[]>([]);

  // Add player form state
  const [showAddPlayerForm, setShowAddPlayerForm] = useState(false);
  const [editingPlayerIndex, setEditingPlayerIndex] = useState<number | null>(null);

  // New player form fields
  const [playerFirstName, setPlayerFirstName] = useState('');
  const [playerLastName, setPlayerLastName] = useState('');
  const [playerDOB, setPlayerDOB] = useState('');
  const [playerGender, setPlayerGender] = useState('');
  const [playerEmail, setPlayerEmail] = useState('');
  const [playerJerseyNumber, setPlayerJerseyNumber] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [questionAnswers, setQuestionAnswers] = useState<
    Record<string, string | string[]>
  >({});
  const [playerFormErrors, setPlayerFormErrors] = useState<Record<string, string>>(
    {}
  );

  // Gender picker
  const [showGenderPicker, setShowGenderPicker] = useState(false);

  // Checkout state
  const [discountCode, setDiscountCode] = useState('');
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
  const [discountApplied, setDiscountApplied] = useState<{
    code: string;
    amount: number;
  } | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [savePaymentMethod, setSavePaymentMethod] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Checkout URL state
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  useEffect(() => {
    fetchProgramData();
  }, [programId]);

  useEffect(() => {
    // Auto-advance past auth step if already logged in
    if (user && currentStep === 'auth') {
      setCurrentStep('package');
    }
  }, [user, currentStep]);

  const fetchProgramData = async () => {
    try {
      if (__DEV__) console.log('[ProgramReg] Fetching program:', programId);

      // Fetch program details
      const { data: programData, error: programError } = await supabase
        .from('programs')
        .select(
          `
          id, name, description, type, status, registration_start, registration_end,
          club:clubs (id, name, logo_url),
          season:seasons (id, name)
        `
        )
        .eq('id', programId)
        .single();

      if (programError) {
        if (__DEV__) console.error('[ProgramReg] Program fetch error:', programError);
        setError('Program not found');
        return;
      }

      if (programData.status !== 'registration_open') {
        setError('Registration is not currently open for this program');
        return;
      }

      setProgram(programData);

      // Fetch packages for this program
      const { data: packagesData, error: packagesError } = await supabase
        .from('packages')
        .select('id, name, description, price, is_active')
        .eq('program_id', programId)
        .eq('is_active', true)
        .order('sort_order');

      if (packagesError) {
        if (__DEV__) console.error('[ProgramReg] Packages fetch error:', packagesError);
      }

      setPackages(packagesData || []);

      if (__DEV__)
        console.log(
          '[ProgramReg] Loaded program:',
          programData.name,
          'Packages:',
          packagesData?.length
        );
    } catch (err) {
      if (__DEV__) console.error('[ProgramReg] Error:', err);
      setError('Failed to load program information');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchExistingPlayers = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('players')
        .select(
          'id, first_name, last_name, date_of_birth, gender, email, jersey_number'
        )
        .eq('parent_email', user.email)
        .order('first_name');

      if (error) {
        if (__DEV__) console.error('[ProgramReg] Error fetching players:', error);
        return;
      }

      setExistingPlayers(data || []);
      if (__DEV__) console.log('[ProgramReg] Found existing players:', data?.length);
    } catch (err) {
      if (__DEV__) console.error('[ProgramReg] Error:', err);
    }
  };

  const fetchProgramQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('program_questions')
        .select('id, label, field_type, is_required, options, question_scope')
        .eq('program_id', programId)
        .eq('is_active', true)
        .order('sort_order');

      if (error) {
        if (__DEV__)
          console.error('[ProgramReg] Error fetching questions:', error);
        return;
      }

      setProgramQuestions(data || []);
      if (__DEV__)
        console.log('[ProgramReg] Found program questions:', data?.length);
    } catch (err) {
      if (__DEV__) console.error('[ProgramReg] Error:', err);
    }
  };

  useEffect(() => {
    if (currentStep === 'players' && user) {
      fetchExistingPlayers();
      fetchProgramQuestions();
    }
  }, [currentStep, user]);

  // Handle deep link returns from Stripe
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      if (__DEV__) console.log('[ProgramReg] Deep link received:', url);

      if (url.includes('registration-success')) {
        setRegistrationComplete(true);
      } else if (url.includes('registration-cancel')) {
        setRegistrationError(
          'Payment was cancelled. Your registration is saved - you can complete payment later.'
        );
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const resetPlayerForm = () => {
    setPlayerFirstName('');
    setPlayerLastName('');
    setPlayerDOB('');
    setPlayerGender('');
    setPlayerEmail('');
    setPlayerJerseyNumber('');
    setEmergencyName('');
    setEmergencyPhone('');
    setEmergencyRelationship('');
    setAllergies('');
    setMedicalNotes('');
    setQuestionAnswers({});
    setPlayerFormErrors({});
    setEditingPlayerIndex(null);
  };

  const validatePlayerForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!playerFirstName.trim()) errors.firstName = 'First name is required';
    if (!playerLastName.trim()) errors.lastName = 'Last name is required';
    if (!playerDOB.trim()) errors.dob = 'Date of birth is required';
    if (!playerGender) errors.gender = 'Gender is required';

    programQuestions.forEach((q) => {
      if (q.is_required && q.question_scope === 'player') {
        const answer = questionAnswers[q.id];
        if (!answer || (Array.isArray(answer) && answer.length === 0)) {
          errors[`question_${q.id}`] = `${q.label} is required`;
        }
      }
    });

    setPlayerFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSavePlayer = () => {
    if (!validatePlayerForm()) return;

    const playerData: PlayerRegistration = {
      player: {
        id:
          editingPlayerIndex !== null
            ? registrations[editingPlayerIndex].player.id
            : `new_${Date.now()}`,
        first_name: playerFirstName.trim(),
        last_name: playerLastName.trim(),
        date_of_birth: playerDOB,
        gender: playerGender,
        email: playerEmail.trim() || undefined,
        jersey_number: playerJerseyNumber.trim() || undefined,
      },
      emergencyContact: {
        name: emergencyName.trim(),
        phone: emergencyPhone.trim(),
        relationship: emergencyRelationship.trim(),
      },
      medicalInfo: {
        allergies: allergies.trim(),
        medicalNotes: medicalNotes.trim(),
      },
      questionAnswers,
      isNew:
        editingPlayerIndex !== null
          ? registrations[editingPlayerIndex].isNew
          : true,
    };

    if (editingPlayerIndex !== null) {
      const updated = [...registrations];
      updated[editingPlayerIndex] = playerData;
      setRegistrations(updated);
    } else {
      setRegistrations([...registrations, playerData]);
    }

    resetPlayerForm();
    setShowAddPlayerForm(false);
  };

  const handleSelectExistingPlayer = (player: Player) => {
    if (registrations.some((r) => r.player.id === player.id)) {
      setRegistrations(registrations.filter((r) => r.player.id !== player.id));
    } else {
      setRegistrations([
        ...registrations,
        {
          player,
          emergencyContact: { name: '', phone: '', relationship: '' },
          medicalInfo: { allergies: '', medicalNotes: '' },
          questionAnswers: {},
          isNew: false,
        },
      ]);
    }
  };

  const handleEditRegistration = (index: number) => {
    const reg = registrations[index];
    setPlayerFirstName(reg.player.first_name);
    setPlayerLastName(reg.player.last_name);
    setPlayerDOB(reg.player.date_of_birth);
    setPlayerGender(reg.player.gender);
    setPlayerEmail(reg.player.email || '');
    setPlayerJerseyNumber(reg.player.jersey_number || '');
    setEmergencyName(reg.emergencyContact.name);
    setEmergencyPhone(reg.emergencyContact.phone);
    setEmergencyRelationship(reg.emergencyContact.relationship);
    setAllergies(reg.medicalInfo.allergies);
    setMedicalNotes(reg.medicalInfo.medicalNotes);
    setQuestionAnswers(reg.questionAnswers);
    setEditingPlayerIndex(index);
    setShowAddPlayerForm(true);
  };

  const handleRemoveRegistration = (index: number) => {
    setRegistrations(registrations.filter((_, i) => i !== index));
  };

  const renderQuestionInput = (question: ProgramQuestion) => {
    const value = questionAnswers[question.id];

    if (question.field_type === 'checkbox' && question.options?.length > 0) {
      return (
        <View key={question.id} style={styles.questionContainer}>
          <Text style={styles.questionLabel}>
            {question.label} {question.is_required && '*'}
          </Text>
          <View style={styles.checkboxGroup}>
            {question.options.map((option) => {
              const selected = Array.isArray(value) && value.includes(option);
              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.checkboxOption,
                    selected && styles.checkboxOptionSelected,
                  ]}
                  onPress={() => {
                    const current = Array.isArray(value) ? value : [];
                    if (selected) {
                      setQuestionAnswers({
                        ...questionAnswers,
                        [question.id]: current.filter((v) => v !== option),
                      });
                    } else {
                      setQuestionAnswers({
                        ...questionAnswers,
                        [question.id]: [...current, option],
                      });
                    }
                  }}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={selected ? '#8B5CF6' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.checkboxLabel,
                      selected && styles.checkboxLabelSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {playerFormErrors[`question_${question.id}`] && (
            <Text style={styles.fieldError}>
              {playerFormErrors[`question_${question.id}`]}
            </Text>
          )}
        </View>
      );
    }

    return (
      <View key={question.id} style={styles.questionContainer}>
        <Text style={styles.questionLabel}>
          {question.label} {question.is_required && '*'}
        </Text>
        <TextInput
          style={[
            styles.textInput,
            playerFormErrors[`question_${question.id}`] &&
              styles.textInputError,
          ]}
          value={typeof value === 'string' ? value : ''}
          onChangeText={(text) =>
            setQuestionAnswers({ ...questionAnswers, [question.id]: text })
          }
          placeholder={`Enter ${question.label.toLowerCase()}`}
          placeholderTextColor="#6B7280"
        />
        {playerFormErrors[`question_${question.id}`] && (
          <Text style={styles.fieldError}>
            {playerFormErrors[`question_${question.id}`]}
          </Text>
        )}
      </View>
    );
  };

  const calculateSubtotal = (): number => {
    return (selectedPackage?.price || 0) * registrations.length;
  };

  const calculateDiscount = (): number => {
    return discountApplied?.amount || 0;
  };

  const calculateTotal = (): number => {
    return Math.max(0, calculateSubtotal() - calculateDiscount());
  };

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) {
      setDiscountError('Please enter a discount code');
      return;
    }

    setIsApplyingDiscount(true);
    setDiscountError('');

    try {
      if (__DEV__)
        console.log('[ProgramReg] Validating discount code:', discountCode);

      await new Promise((resolve) => setTimeout(resolve, 500));

      if (discountCode.toUpperCase() === 'TEST10') {
        const discountAmount = calculateSubtotal() * 0.1;
        setDiscountApplied({
          code: discountCode.toUpperCase(),
          amount: discountAmount,
        });
        setDiscountError('');
      } else {
        setDiscountError('Invalid discount code');
        setDiscountApplied(null);
      }
    } catch (err) {
      if (__DEV__) console.error('[ProgramReg] Discount error:', err);
      setDiscountError('Failed to validate discount code');
    } finally {
      setIsApplyingDiscount(false);
    }
  };

  const handleRemoveDiscount = () => {
    setDiscountApplied(null);
    setDiscountCode('');
    setDiscountError('');
  };

  const handleProceedToPayment = async () => {
    if (!agreedToTerms) {
      alert('Please agree to the terms and conditions');
      return;
    }

    if (!user || !program || !selectedPackage) {
      alert('Missing required information. Please try again.');
      return;
    }

    setIsProcessingPayment(true);
    setRegistrationError(null);

    try {
      if (__DEV__) {
        console.log('[ProgramReg] Starting checkout process...');
      }

      // Step 1: Create program_registrations for each player
      const registrationIds: string[] = [];

      for (const reg of registrations) {
        let playerId = reg.player.id;

        if (reg.isNew || reg.player.id.startsWith('new_')) {
          const { data: newPlayer, error: playerError } = await supabase
            .from('players')
            .insert({
              first_name: reg.player.first_name,
              last_name: reg.player.last_name,
              date_of_birth: reg.player.date_of_birth,
              gender: reg.player.gender,
              email: reg.player.email || null,
              jersey_number: reg.player.jersey_number
                ? parseInt(reg.player.jersey_number, 10)
                : null,
              parent_email: user.email,
              parent_first_name:
                user.user_metadata?.full_name?.split(' ')[0] || '',
              parent_last_name:
                user.user_metadata?.full_name?.split(' ').slice(1).join(' ') ||
                '',
              emergency_contact_name: reg.emergencyContact.name || null,
              emergency_contact_phone: reg.emergencyContact.phone || null,
              emergency_contact_relation:
                reg.emergencyContact.relationship || null,
              allergies: reg.medicalInfo.allergies || null,
              medical_notes: reg.medicalInfo.medicalNotes || null,
              status: 'active',
              is_solo_player: true,
            })
            .select()
            .single();

          if (playerError) {
            if (__DEV__)
              console.error('[ProgramReg] Error creating player:', playerError);
            throw new Error(
              `Failed to create player ${reg.player.first_name}: ${playerError.message}`
            );
          }

          playerId = newPlayer.id;
          if (__DEV__) console.log('[ProgramReg] Created player:', playerId);
        }

        const { data: registration, error: regError } = await supabase
          .from('program_registrations')
          .insert({
            program_id: program.id,
            package_id: selectedPackage.id,
            player_id: playerId,
            parent_id: user.id,
            status: 'pending',
            payment_status: 'unpaid',
            total_amount: selectedPackage.price,
            discount_amount: discountApplied
              ? discountApplied.amount / registrations.length
              : 0,
            discount_code: discountApplied?.code || null,
          })
          .select()
          .single();

        if (regError) {
          if (__DEV__)
            console.error('[ProgramReg] Error creating registration:', regError);
          throw new Error(
            `Failed to create registration: ${regError.message}`
          );
        }

        registrationIds.push(registration.id);
        if (__DEV__)
          console.log('[ProgramReg] Created registration:', registration.id);

        if (Object.keys(reg.questionAnswers).length > 0) {
          const answersToInsert = Object.entries(reg.questionAnswers).map(
            ([questionId, answer]) => ({
              registration_id: registration.id,
              question_id: questionId,
              answer: Array.isArray(answer) ? answer.join(', ') : answer,
            })
          );

          const { error: answersError } = await supabase
            .from('program_question_answers')
            .insert(answersToInsert);

          if (answersError) {
            if (__DEV__)
              console.log(
                '[ProgramReg] Warning - answers not saved:',
                answersError
              );
          }
        }
      }

      if (__DEV__)
        console.log('[ProgramReg] Created registrations:', registrationIds);

      const totalAmount = calculateTotal();

      if (totalAmount === 0) {
        for (const regId of registrationIds) {
          await supabase
            .from('program_registrations')
            .update({
              status: 'completed',
              payment_status: 'paid',
            })
            .eq('id', regId);
        }

        setRegistrationComplete(true);
        if (__DEV__) console.log('[ProgramReg] Free registration completed!');
        return;
      }

      if (__DEV__)
        console.log('[ProgramReg] Calling create-program-checkout...');

      const { data: checkoutData, error: checkoutError } =
        await supabase.functions.invoke('create-program-checkout', {
          body: {
            registration_ids: registrationIds,
            success_url: 'thryvyng://registration-success',
            cancel_url: 'thryvyng://registration-cancel',
            save_payment_method: savePaymentMethod,
          },
        });

      if (checkoutError) {
        if (__DEV__)
          console.error('[ProgramReg] Checkout error:', checkoutError);
        throw new Error('Failed to create checkout session');
      }

      if (!checkoutData?.url) {
        throw new Error('No checkout URL received');
      }

      if (__DEV__)
        console.log('[ProgramReg] Opening Stripe checkout:', checkoutData.url);

      const supported = await Linking.canOpenURL(checkoutData.url);

      if (supported) {
        await Linking.openURL(checkoutData.url);
        alert(
          'Complete your payment in the browser. You will be redirected back to the app after payment.'
        );
      } else {
        throw new Error('Cannot open checkout URL');
      }
    } catch (err: unknown) {
      if (__DEV__) console.error('[ProgramReg] Payment error:', err);
      setRegistrationError(
        err instanceof Error ? err.message : 'Failed to process payment. Please try again.'
      );
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleBack = () => {
    if (currentStep === 'auth') {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Welcome');
      }
    } else if (currentStep === 'package') {
      if (!user) {
        setCurrentStep('auth');
      } else {
        navigation.navigate('Welcome');
      }
    } else if (currentStep === 'players') {
      setCurrentStep('package');
    } else if (currentStep === 'review') {
      setCurrentStep('players');
    }
  };

  const getStepIndex = (step: RegistrationStep): number => {
    return STEPS.findIndex((s) => s.key === step);
  };

  // Step Indicator Component
  const StepIndicator = () => (
    <View style={styles.stepIndicator}>
      {STEPS.map((step, index) => {
        const currentIndex = getStepIndex(currentStep);
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <React.Fragment key={step.key}>
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  isComplete && styles.stepCircleComplete,
                  isCurrent && styles.stepCircleCurrent,
                ]}
              >
                {isComplete ? (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      isCurrent && styles.stepNumberCurrent,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isCurrent && styles.stepLabelCurrent,
                ]}
              >
                {step.label}
              </Text>
            </View>
            {index < STEPS.length - 1 && (
              <View
                style={[styles.stepLine, isComplete && styles.stepLineComplete]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );

  // SUCCESS SCREEN
  if (registrationComplete) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.successContainer}
      >
        <View style={styles.successCard}>
          <View style={styles.successIconContainer}>
            <Ionicons name="checkmark-circle" size={80} color="#22C55E" />
          </View>

          <Text style={styles.successTitle}>Registration Complete!</Text>
          <Text style={styles.successSubtitle}>
            Thank you for registering for {program?.name}
          </Text>

          <View style={styles.successSummaryCard}>
            <View style={styles.successSummaryHeader}>
              {program?.club?.logo_url ? (
                <Image
                  source={{ uri: program.club.logo_url }}
                  style={styles.successClubLogo}
                />
              ) : (
                <View style={styles.successClubLogoPlaceholder}>
                  <Ionicons
                    name="shield-outline"
                    size={24}
                    color="#6B7280"
                  />
                </View>
              )}
              <View style={styles.successSummaryInfo}>
                <Text style={styles.successProgramName}>{program?.name}</Text>
                <Text style={styles.successClubName}>
                  {program?.club?.name}
                </Text>
              </View>
            </View>

            <View style={styles.successDivider} />

            <Text style={styles.successPlayersTitle}>Registered Players</Text>
            {registrations.map((reg) => (
              <View key={reg.player.id} style={styles.successPlayerRow}>
                <Ionicons name="person" size={16} color="#9CA3AF" />
                <Text style={styles.successPlayerName}>
                  {reg.player.first_name} {reg.player.last_name}
                </Text>
                <Text style={styles.successPlayerPackage}>
                  {selectedPackage?.name}
                </Text>
              </View>
            ))}

            <View style={styles.successDivider} />

            <View style={styles.successTotalRow}>
              <Text style={styles.successTotalLabel}>Total Paid</Text>
              <Text style={styles.successTotalAmount}>
                ${calculateTotal().toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.whatsNextCard}>
            <Text style={styles.whatsNextTitle}>What's Next?</Text>
            <View style={styles.whatsNextItem}>
              <View style={styles.whatsNextNumber}>
                <Text style={styles.whatsNextNumberText}>1</Text>
              </View>
              <Text style={styles.whatsNextText}>
                You'll receive a confirmation email shortly
              </Text>
            </View>
            <View style={styles.whatsNextItem}>
              <View style={styles.whatsNextNumber}>
                <Text style={styles.whatsNextNumberText}>2</Text>
              </View>
              <Text style={styles.whatsNextText}>
                Attend the tryout session at the scheduled time
              </Text>
            </View>
            <View style={styles.whatsNextItem}>
              <View style={styles.whatsNextNumber}>
                <Text style={styles.whatsNextNumberText}>3</Text>
              </View>
              <Text style={styles.whatsNextText}>
                Team placements will be announced after evaluations
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.successPrimaryButton}
            onPress={() =>
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }],
              })
            }
          >
            <Text style={styles.successPrimaryButtonText}>
              Go to Dashboard
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.successSecondaryButton}
            onPress={() => {
              setRegistrationComplete(false);
              setCurrentStep('package');
              setRegistrations([]);
              setSelectedPackage(null);
              setDiscountApplied(null);
              setDiscountCode('');
              setAgreedToTerms(false);
              setSavePaymentMethod(false);
            }}
          >
            <Text style={styles.successSecondaryButtonText}>
              Register Another Player
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading program...</Text>
      </View>
    );
  }

  // Error state
  if (error || !program) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={64} color="#EF4444" />
        <Text style={styles.errorTitle}>Unable to Load Program</Text>
        <Text style={styles.errorText}>{error || 'Program not found'}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate('Welcome')}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Back button */}
      <TouchableOpacity style={styles.backNav} onPress={handleBack}>
        <Ionicons name="arrow-back" size={24} color="#9CA3AF" />
        <Text style={styles.backNavText}>Back</Text>
      </TouchableOpacity>

      {/* Program Header */}
      <View style={styles.programHeader}>
        <View style={styles.programBadges}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{program.type}</Text>
          </View>
          {program.season && (
            <View style={styles.seasonBadge}>
              <Text style={styles.seasonBadgeText}>{program.season.name}</Text>
            </View>
          )}
        </View>
        <Text style={styles.programName}>{program.name}</Text>
        {program.club && (
          <View style={styles.clubInfo}>
            {program.club.logo_url ? (
              <Image
                source={{ uri: program.club.logo_url }}
                style={styles.clubLogo}
              />
            ) : (
              <View style={styles.clubLogoPlaceholder}>
                <Ionicons name="shield-outline" size={16} color="#6B7280" />
              </View>
            )}
            <Text style={styles.clubName}>{program.club.name}</Text>
          </View>
        )}
      </View>

      {/* Step Indicator */}
      <StepIndicator />

      {/* STEP: AUTH */}
      {currentStep === 'auth' && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Sign In to Continue</Text>
          <Text style={styles.stepSubtitle}>
            Create an account or sign in to complete your registration. You'll
            be able to manage all your registrations in one place.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              setPendingProgramId(programId);
              navigation.navigate('Login');
            }}
          >
            <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>

          <View style={styles.orDivider}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
          </View>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setPendingProgramId(programId);
              navigation.navigate('Login');
            }}
          >
            <Ionicons name="person-add-outline" size={20} color="#8B5CF6" />
            <Text style={styles.secondaryButtonText}>Create Account</Text>
          </TouchableOpacity>

          <Text style={styles.returnNote}>
            You'll return to this registration after signing in
          </Text>
        </View>
      )}

      {/* STEP: PACKAGE */}
      {currentStep === 'package' && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Select Registration Package</Text>
          <Text style={styles.stepSubtitle}>
            Choose the option that best fits your needs
          </Text>

          {packages.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={48} color="#6B7280" />
              <Text style={styles.emptyStateText}>No packages available</Text>
              <Text style={styles.emptyStateSubtext}>
                Registration packages have not been set up for this program yet.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.packagesList}>
                {packages.map((pkg) => (
                  <TouchableOpacity
                    key={pkg.id}
                    style={[
                      styles.packageCard,
                      selectedPackage?.id === pkg.id && styles.packageCardSelected,
                    ]}
                    onPress={() => setSelectedPackage(pkg)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.packageCardContent}>
                      <View style={styles.packageIconContainer}>
                        <Ionicons
                          name="cube-outline"
                          size={24}
                          color={
                            selectedPackage?.id === pkg.id ? '#8B5CF6' : '#6B7280'
                          }
                        />
                      </View>
                      <View style={styles.packageInfo}>
                        <Text style={styles.packageCardName}>{pkg.name}</Text>
                        {pkg.description && (
                          <Text style={styles.packageDescription}>
                            {pkg.description}
                          </Text>
                        )}
                      </View>
                      <View style={styles.packagePriceContainer}>
                        <Text
                          style={[
                            styles.packageCardPrice,
                            selectedPackage?.id === pkg.id &&
                              styles.packageCardPriceSelected,
                          ]}
                        >
                          ${pkg.price.toFixed(2)}
                        </Text>
                      </View>
                    </View>

                    {/* Radio indicator */}
                    <View
                      style={[
                        styles.radioOuter,
                        selectedPackage?.id === pkg.id &&
                          styles.radioOuterSelected,
                      ]}
                    >
                      {selectedPackage?.id === pkg.id && (
                        <View style={styles.radioInner} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Selected Package Summary */}
              {selectedPackage && (
                <View style={styles.selectedSummary}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Selected Package</Text>
                    <Text style={styles.summaryValue}>
                      {selectedPackage.name}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Price per Player</Text>
                    <Text style={styles.summaryValuePrice}>
                      ${selectedPackage.price.toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Continue Button */}
              <TouchableOpacity
                style={[
                  styles.continueButton,
                  !selectedPackage && styles.continueButtonDisabled,
                ]}
                onPress={() => {
                  if (selectedPackage) {
                    setCurrentStep('players');
                  }
                }}
                disabled={!selectedPackage}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* STEP: PLAYERS */}
      {currentStep === 'players' && !showAddPlayerForm && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Select Players to Register</Text>
          <Text style={styles.stepSubtitle}>
            Add or select players for {program?.name}
          </Text>

          {/* Existing Players */}
          {existingPlayers.length > 0 && (
            <View style={styles.existingPlayersSection}>
              <Text style={styles.sectionLabel}>Your Players</Text>
              {existingPlayers.map((player) => {
                const isSelected = registrations.some(
                  (r) => r.player.id === player.id
                );
                return (
                  <TouchableOpacity
                    key={player.id}
                    style={[
                      styles.existingPlayerCard,
                      isSelected && styles.existingPlayerCardSelected,
                    ]}
                    onPress={() => handleSelectExistingPlayer(player)}
                  >
                    <View style={styles.playerAvatar}>
                      <Ionicons name="person" size={20} color="#9CA3AF" />
                    </View>
                    <View style={styles.playerDetails}>
                      <Text style={styles.playerName}>
                        {player.first_name} {player.last_name}
                      </Text>
                      <Text style={styles.playerMeta}>
                        {player.gender} • Born {player.date_of_birth}
                      </Text>
                    </View>
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={isSelected ? '#8B5CF6' : '#6B7280'}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* No Players Yet */}
          {existingPlayers.length === 0 && registrations.length === 0 && (
            <View style={styles.noPlayersCard}>
              <Ionicons name="people-outline" size={48} color="#6B7280" />
              <Text style={styles.noPlayersText}>
                No players found in your account yet.
              </Text>
            </View>
          )}

          {/* Add Player Button */}
          <TouchableOpacity
            style={styles.addPlayerButton}
            onPress={() => {
              resetPlayerForm();
              setShowAddPlayerForm(true);
            }}
          >
            <Ionicons name="person-add" size={20} color="#FFFFFF" />
            <Text style={styles.addPlayerButtonText}>
              {existingPlayers.length === 0 && registrations.length === 0
                ? 'Add Your First Player'
                : 'Add Another Player'}
            </Text>
          </TouchableOpacity>

          {/* Registration Summary */}
          {registrations.length > 0 && (
            <View style={styles.registrationSummary}>
              <Text style={styles.summaryTitle}>Registration Summary</Text>
              {registrations.map((reg, index) => (
                <View key={reg.player.id} style={styles.registrationItem}>
                  <View style={styles.registrationInfo}>
                    <Text style={styles.registrationName}>
                      {reg.player.first_name} {reg.player.last_name}
                    </Text>
                    <Text style={styles.registrationPackage}>
                      {selectedPackage?.name} - $
                      {selectedPackage?.price.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.registrationActions}>
                    <TouchableOpacity
                      onPress={() => handleEditRegistration(index)}
                    >
                      <Ionicons name="pencil" size={18} color="#8B5CF6" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleRemoveRegistration(index)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  {registrations.length} player(s)
                </Text>
                <Text style={styles.totalAmount}>
                  $
                  {(
                    (selectedPackage?.price || 0) * registrations.length
                  ).toFixed(2)}
                </Text>
              </View>
            </View>
          )}

          {/* Continue Button */}
          <TouchableOpacity
            style={[
              styles.continueButton,
              registrations.length === 0 && styles.continueButtonDisabled,
            ]}
            onPress={() => {
              if (registrations.length > 0) {
                setCurrentStep('review');
              }
            }}
            disabled={registrations.length === 0}
          >
            <Text style={styles.continueButtonText}>Continue to Review</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* ADD PLAYER FORM */}
      {currentStep === 'players' && showAddPlayerForm && (
        <ScrollView
          style={styles.playerFormContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formHeader}>
            <TouchableOpacity
              onPress={() => {
                resetPlayerForm();
                setShowAddPlayerForm(false);
              }}
            >
              <Ionicons name="arrow-back" size={24} color="#9CA3AF" />
            </TouchableOpacity>
            <Text style={styles.formTitle}>
              {editingPlayerIndex !== null ? 'Edit Player' : 'Add Player'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Player Information */}
          <View style={styles.formSection}>
            <View style={styles.formSectionHeader}>
              <Ionicons name="person-outline" size={20} color="#8B5CF6" />
              <Text style={styles.formSectionTitle}>Player Information</Text>
            </View>

            <View style={styles.formRow}>
              <View style={styles.formFieldHalf}>
                <Text style={styles.fieldLabel}>First Name *</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    playerFormErrors.firstName && styles.textInputError,
                  ]}
                  value={playerFirstName}
                  onChangeText={setPlayerFirstName}
                  placeholder="First name"
                  placeholderTextColor="#6B7280"
                />
                {playerFormErrors.firstName && (
                  <Text style={styles.fieldError}>
                    {playerFormErrors.firstName}
                  </Text>
                )}
              </View>
              <View style={styles.formFieldHalf}>
                <Text style={styles.fieldLabel}>Last Name *</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    playerFormErrors.lastName && styles.textInputError,
                  ]}
                  value={playerLastName}
                  onChangeText={setPlayerLastName}
                  placeholder="Last name"
                  placeholderTextColor="#6B7280"
                />
                {playerFormErrors.lastName && (
                  <Text style={styles.fieldError}>
                    {playerFormErrors.lastName}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={styles.formFieldHalf}>
                <Text style={styles.fieldLabel}>Date of Birth *</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    playerFormErrors.dob && styles.textInputError,
                  ]}
                  value={playerDOB}
                  onChangeText={setPlayerDOB}
                  placeholder="MM/DD/YYYY"
                  placeholderTextColor="#6B7280"
                  keyboardType="numbers-and-punctuation"
                />
                {playerFormErrors.dob && (
                  <Text style={styles.fieldError}>{playerFormErrors.dob}</Text>
                )}
              </View>
              <View style={styles.formFieldHalf}>
                <Text style={styles.fieldLabel}>Gender *</Text>
                <TouchableOpacity
                  style={[
                    styles.selector,
                    playerFormErrors.gender && styles.selectorError,
                  ]}
                  onPress={() => setShowGenderPicker(true)}
                >
                  <Text
                    style={
                      playerGender ? styles.selectorText : styles.selectorPlaceholder
                    }
                  >
                    {playerGender || 'Select'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#6B7280" />
                </TouchableOpacity>
                {playerFormErrors.gender && (
                  <Text style={styles.fieldError}>
                    {playerFormErrors.gender}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={styles.formFieldHalf}>
                <Text style={styles.fieldLabel}>Player Email (optional)</Text>
                <TextInput
                  style={styles.textInput}
                  value={playerEmail}
                  onChangeText={setPlayerEmail}
                  placeholder="player@email.com"
                  placeholderTextColor="#6B7280"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.formFieldHalf}>
                <Text style={styles.fieldLabel}>Jersey # (optional)</Text>
                <TextInput
                  style={styles.textInput}
                  value={playerJerseyNumber}
                  onChangeText={setPlayerJerseyNumber}
                  placeholder="12"
                  placeholderTextColor="#6B7280"
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>

          {/* Parent/Guardian Information */}
          <View style={styles.formSection}>
            <View style={styles.formSectionHeader}>
              <Ionicons name="people-outline" size={20} color="#8B5CF6" />
              <Text style={styles.formSectionTitle}>
                Parent/Guardian Information
              </Text>
              <View style={styles.autoFilledBadge}>
                <Text style={styles.autoFilledText}>From your account</Text>
              </View>
            </View>

            <View style={styles.parentInfoCard}>
              <Text style={styles.parentName}>
                {user?.user_metadata?.full_name || 'Parent Name'}
              </Text>
              <Text style={styles.parentEmail}>{user?.email}</Text>
              <TouchableOpacity>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Emergency Contact */}
          <View style={styles.formSection}>
            <View style={styles.formSectionHeader}>
              <Ionicons name="call-outline" size={20} color="#8B5CF6" />
              <Text style={styles.formSectionTitle}>
                Emergency Contact (optional)
              </Text>
            </View>

            <View style={styles.formRow}>
              <View style={styles.formFieldThird}>
                <Text style={styles.fieldLabel}>Contact Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={emergencyName}
                  onChangeText={setEmergencyName}
                  placeholder="Name"
                  placeholderTextColor="#6B7280"
                />
              </View>
              <View style={styles.formFieldThird}>
                <Text style={styles.fieldLabel}>Contact Phone</Text>
                <TextInput
                  style={styles.textInput}
                  value={emergencyPhone}
                  onChangeText={setEmergencyPhone}
                  placeholder="Phone"
                  placeholderTextColor="#6B7280"
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.formFieldThird}>
                <Text style={styles.fieldLabel}>Relationship</Text>
                <TextInput
                  style={styles.textInput}
                  value={emergencyRelationship}
                  onChangeText={setEmergencyRelationship}
                  placeholder="e.g., Granny"
                  placeholderTextColor="#6B7280"
                />
              </View>
            </View>
          </View>

          {/* Medical Information */}
          <View style={styles.formSection}>
            <View style={styles.formSectionHeader}>
              <Ionicons name="medkit-outline" size={20} color="#8B5CF6" />
              <Text style={styles.formSectionTitle}>
                Medical Information (optional)
              </Text>
            </View>

            <Text style={styles.fieldLabel}>Allergies</Text>
            <TextInput
              style={styles.textInput}
              value={allergies}
              onChangeText={setAllergies}
              placeholder="List any allergies"
              placeholderTextColor="#6B7280"
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
              Medical Notes / Conditions
            </Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={medicalNotes}
              onChangeText={setMedicalNotes}
              placeholder="Any medical conditions we should know about"
              placeholderTextColor="#6B7280"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Additional Questions */}
          {programQuestions.filter((q) => q.question_scope === 'player').length >
            0 && (
            <View style={styles.formSection}>
              <View style={styles.formSectionHeader}>
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color="#8B5CF6"
                />
                <Text style={styles.formSectionTitle}>
                  Additional Questions
                </Text>
              </View>

              {programQuestions
                .filter((q) => q.question_scope === 'player')
                .map((question) => renderQuestionInput(question))}
            </View>
          )}

          {/* Save Button */}
          <TouchableOpacity
            style={styles.savePlayerButton}
            onPress={handleSavePlayer}
          >
            <Text style={styles.savePlayerButtonText}>
              {editingPlayerIndex !== null ? 'Save Changes' : 'Add Player'}
            </Text>
          </TouchableOpacity>

          {/* Cancel Link */}
          <TouchableOpacity
            style={styles.cancelLink}
            onPress={() => {
              resetPlayerForm();
              setShowAddPlayerForm(false);
            }}
          >
            <Text style={styles.cancelLinkText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Gender Picker Modal */}
      <Modal visible={showGenderPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Gender</Text>
              <TouchableOpacity onPress={() => setShowGenderPicker(false)}>
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            {['Male', 'Female', 'Other', 'Prefer not to say'].map((gender) => (
              <TouchableOpacity
                key={gender}
                style={[
                  styles.pickerItem,
                  playerGender === gender && styles.pickerItemSelected,
                ]}
                onPress={() => {
                  setPlayerGender(gender);
                  setShowGenderPicker(false);
                }}
              >
                <Text style={styles.pickerItemText}>{gender}</Text>
                {playerGender === gender && (
                  <Ionicons name="checkmark" size={20} color="#8B5CF6" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* STEP: REVIEW */}
      {currentStep === 'review' && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Review & Pay</Text>
          <Text style={styles.stepSubtitle}>
            Review your registration and complete payment
          </Text>

          {/* Players to Register */}
          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>
              Players to Register ({registrations.length})
            </Text>
            {registrations.map((reg) => (
              <View key={reg.player.id} style={styles.reviewPlayerCard}>
                <View style={styles.reviewPlayerInfo}>
                  <View style={styles.reviewPlayerAvatar}>
                    <Ionicons name="person" size={18} color="#9CA3AF" />
                  </View>
                  <View style={styles.reviewPlayerDetails}>
                    <Text style={styles.reviewPlayerName}>
                      {reg.player.first_name} {reg.player.last_name}
                    </Text>
                    <Text style={styles.reviewPlayerPackage}>
                      {selectedPackage?.name}
                    </Text>
                  </View>
                </View>
                <Text style={styles.reviewPlayerPrice}>
                  ${selectedPackage?.price.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>

          {/* Registration Details */}
          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>
              Registration Details
            </Text>
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Program</Text>
                <Text style={styles.detailValue}>{program?.name}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Club</Text>
                <Text style={styles.detailValue}>{program?.club?.name}</Text>
              </View>
            </View>
          </View>

          {/* Order Summary */}
          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>Order Summary</Text>
            <View style={styles.orderSummaryCard}>
              {registrations.map((reg) => (
                <View key={reg.player.id} style={styles.orderLineItem}>
                  <Text style={styles.orderItemName}>
                    {reg.player.first_name} {reg.player.last_name}
                  </Text>
                  <Text style={styles.orderItemPrice}>
                    ${selectedPackage?.price.toFixed(2)}
                  </Text>
                </View>
              ))}

              {discountApplied && (
                <View style={styles.orderLineItem}>
                  <View style={styles.discountAppliedRow}>
                    <Text style={styles.discountAppliedText}>
                      Discount ({discountApplied.code})
                    </Text>
                    <TouchableOpacity onPress={handleRemoveDiscount}>
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color="#EF4444"
                      />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.discountAmount}>
                    -${discountApplied.amount.toFixed(2)}
                  </Text>
                </View>
              )}

              <View style={styles.orderTotalRow}>
                <Text style={styles.orderTotalLabel}>Total</Text>
                <Text style={styles.orderTotalAmount}>
                  ${calculateTotal().toFixed(2)}
                </Text>
              </View>
            </View>
          </View>

          {/* Discount Code */}
          {!discountApplied && (
            <View style={styles.discountSection}>
              <View style={styles.discountInputRow}>
                <TextInput
                  style={[
                    styles.discountInput,
                    discountError && styles.discountInputError,
                  ]}
                  value={discountCode}
                  onChangeText={(text) => {
                    setDiscountCode(text.toUpperCase());
                    setDiscountError('');
                  }}
                  placeholder="Discount code"
                  placeholderTextColor="#6B7280"
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[
                    styles.applyButton,
                    isApplyingDiscount && styles.applyButtonDisabled,
                  ]}
                  onPress={handleApplyDiscount}
                  disabled={isApplyingDiscount}
                >
                  {isApplyingDiscount ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.applyButtonText}>Apply</Text>
                  )}
                </TouchableOpacity>
              </View>
              {discountError && (
                <Text style={styles.discountErrorText}>{discountError}</Text>
              )}
            </View>
          )}

          {/* Save Payment Method */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setSavePaymentMethod(!savePaymentMethod)}
          >
            <Ionicons
              name={savePaymentMethod ? 'checkbox' : 'square-outline'}
              size={24}
              color={savePaymentMethod ? '#8B5CF6' : '#6B7280'}
            />
            <View style={styles.checkboxContent}>
              <Text style={styles.checkboxTitle}>
                Save payment method for future payments
              </Text>
              <Text style={styles.checkboxDescription}>
                Securely save your card for scheduled installment payments. You
                can remove it anytime from your account settings.
              </Text>
            </View>
          </TouchableOpacity>

          {/* Terms Agreement */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setAgreedToTerms(!agreedToTerms)}
          >
            <Ionicons
              name={agreedToTerms ? 'checkbox' : 'square-outline'}
              size={24}
              color={agreedToTerms ? '#8B5CF6' : '#6B7280'}
            />
            <View style={styles.checkboxContent}>
              <Text style={styles.checkboxTitle}>
                I agree to the {program?.club?.name || 'club'} registration
                terms, liability waiver, and understand that registration fees
                are non-refundable unless otherwise stated.
              </Text>
            </View>
          </TouchableOpacity>

          {/* Pay Button */}
          <TouchableOpacity
            style={[
              styles.payButton,
              (!agreedToTerms || isProcessingPayment) &&
                styles.payButtonDisabled,
            ]}
            onPress={handleProceedToPayment}
            disabled={!agreedToTerms || isProcessingPayment}
          >
            {isProcessingPayment ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="card-outline" size={20} color="#FFFFFF" />
                <Text style={styles.payButtonText}>
                  Pay ${calculateTotal().toFixed(2)}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {registrationError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={20} color="#EF4444" />
              <Text style={styles.errorBannerText}>{registrationError}</Text>
              <TouchableOpacity onPress={() => setRegistrationError(null)}>
                <Ionicons name="close" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}

          {/* Stripe Badge */}
          <View style={styles.stripeBadge}>
            <Ionicons name="lock-closed" size={14} color="#6B7280" />
            <Text style={styles.stripeBadgeText}>
              Secure payment powered by Stripe
            </Text>
          </View>

          {/* Back to Players */}
          <TouchableOpacity
            style={styles.backToPlayersButton}
            onPress={() => setCurrentStep('players')}
          >
            <Ionicons name="arrow-back" size={18} color="#8B5CF6" />
            <Text style={styles.backToPlayersText}>
              Back to Player Selection
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#374151',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  backNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  backNavText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  programHeader: {
    marginBottom: 24,
  },
  programBadges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  typeBadge: {
    backgroundColor: '#065F46',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: {
    color: '#6EE7B7',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  seasonBadge: {
    backgroundColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  seasonBadgeText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '500',
  },
  programName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  clubInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clubLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  clubLogoPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clubName: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  stepItem: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepCircleComplete: {
    backgroundColor: '#22C55E',
  },
  stepCircleCurrent: {
    backgroundColor: '#8B5CF6',
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  stepNumberCurrent: {
    color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 10,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 60,
  },
  stepLabelCurrent: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  stepLine: {
    width: 24,
    height: 2,
    backgroundColor: '#374151',
    marginHorizontal: 4,
    marginBottom: 16,
  },
  stepLineComplete: {
    backgroundColor: '#22C55E',
  },
  stepContent: {
    marginTop: 8,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#374151',
  },
  orText: {
    color: '#6B7280',
    fontSize: 14,
    marginHorizontal: 16,
  },
  secondaryButton: {
    backgroundColor: '#1F2937',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  secondaryButtonText: {
    color: '#8B5CF6',
    fontSize: 16,
    fontWeight: '600',
  },
  returnNote: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyStateText: {
    color: '#6B7280',
    fontSize: 16,
    marginTop: 12,
  },
  emptyStateSubtext: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 250,
  },
  // Package Selection Styles
  packagesList: {
    marginBottom: 20,
  },
  packageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#374151',
  },
  packageCardSelected: {
    borderColor: '#8B5CF6',
    backgroundColor: '#1F2937',
  },
  packageCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  packageIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  packageInfo: {
    flex: 1,
  },
  packageCardName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  packageDescription: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  packagePriceContainer: {
    marginRight: 12,
  },
  packageCardPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#22C55E',
  },
  packageCardPriceSelected: {
    color: '#22C55E',
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6B7280',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: '#8B5CF6',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#8B5CF6',
  },
  selectedSummary: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  summaryValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  summaryValuePrice: {
    fontSize: 18,
    color: '#22C55E',
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  continueButtonDisabled: {
    backgroundColor: '#4B5563',
    opacity: 0.6,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  packagesPlaceholder: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 20,
  },
  placeholderText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  packagePreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  packageName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  packagePrice: {
    color: '#22C55E',
    fontSize: 16,
    fontWeight: '600',
  },
  placeholderStep: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#1F2937',
    borderRadius: 12,
  },

  // Player Selection Styles
  existingPlayersSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  existingPlayerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#374151',
  },
  existingPlayerCardSelected: {
    borderColor: '#8B5CF6',
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playerDetails: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  playerMeta: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  noPlayersCard: {
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 32,
    marginBottom: 20,
  },
  noPlayersText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 12,
  },
  addPlayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 20,
  },
  addPlayerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  registrationSummary: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  registrationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  registrationInfo: {
    flex: 1,
  },
  registrationName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  registrationPackage: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  registrationActions: {
    flexDirection: 'row',
    gap: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#22C55E',
  },

  // Player Form Styles
  playerFormContainer: {
    flex: 1,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  formSection: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  formSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  formSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  formFieldHalf: {
    flex: 1,
  },
  formFieldThird: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#D1D5DB',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#374151',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#374151',
  },
  textInputError: {
    borderColor: '#EF4444',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  fieldError: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#374151',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  selectorError: {
    borderColor: '#EF4444',
  },
  selectorText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  selectorPlaceholder: {
    fontSize: 16,
    color: '#6B7280',
  },
  autoFilledBadge: {
    backgroundColor: '#065F46',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  autoFilledText: {
    color: '#6EE7B7',
    fontSize: 11,
    fontWeight: '500',
  },
  parentInfoCard: {
    backgroundColor: '#374151',
    borderRadius: 8,
    padding: 12,
  },
  parentName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  parentEmail: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  editLink: {
    color: '#8B5CF6',
    fontSize: 13,
    marginTop: 8,
  },
  questionContainer: {
    marginBottom: 16,
  },
  questionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#D1D5DB',
    marginBottom: 8,
  },
  checkboxGroup: {
    gap: 8,
  },
  checkboxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  checkboxOptionSelected: {},
  checkboxLabel: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  checkboxLabelSelected: {
    color: '#FFFFFF',
  },
  savePlayerButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  savePlayerButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  cancelLinkText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  pickerItemSelected: {
    backgroundColor: '#2D2050',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#FFFFFF',
  },

  // Review & Checkout Styles
  reviewSection: {
    marginBottom: 20,
  },
  reviewSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  reviewPlayerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  reviewPlayerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  reviewPlayerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reviewPlayerDetails: {
    flex: 1,
  },
  reviewPlayerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  reviewPlayerPackage: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  reviewPlayerPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailsCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  detailValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  orderSummaryCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
  },
  orderLineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  orderItemName: {
    fontSize: 14,
    color: '#D1D5DB',
  },
  orderItemPrice: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  discountAppliedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  discountAppliedText: {
    fontSize: 14,
    color: '#22C55E',
  },
  discountAmount: {
    fontSize: 14,
    color: '#22C55E',
    fontWeight: '500',
  },
  orderTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 8,
  },
  orderTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  orderTotalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#22C55E',
  },
  discountSection: {
    marginBottom: 20,
  },
  discountInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  discountInput: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#374151',
  },
  discountInputError: {
    borderColor: '#EF4444',
  },
  applyButton: {
    backgroundColor: '#374151',
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyButtonDisabled: {
    opacity: 0.6,
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  discountErrorText: {
    color: '#EF4444',
    fontSize: 13,
    marginTop: 6,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  checkboxContent: {
    flex: 1,
  },
  checkboxTitle: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  checkboxDescription: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    lineHeight: 18,
  },
  payButton: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  payButtonDisabled: {
    backgroundColor: '#4B5563',
    opacity: 0.7,
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  stripeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  stripeBadgeText: {
    fontSize: 12,
    color: '#6B7280',
  },
  backToPlayersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 8,
    gap: 6,
  },
  backToPlayersText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '500',
  },

  // Success Screen Styles
  successContainer: {
    padding: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  successCard: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  successIconContainer: {
    marginBottom: 24,
    marginTop: 40,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 32,
  },
  successSummaryCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 20,
  },
  successSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  successClubLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  successClubLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successSummaryInfo: {
    marginLeft: 12,
    flex: 1,
  },
  successProgramName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  successClubName: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  successDivider: {
    height: 1,
    backgroundColor: '#374151',
    marginVertical: 16,
  },
  successPlayersTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  successPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  successPlayerName: {
    fontSize: 15,
    color: '#FFFFFF',
    flex: 1,
  },
  successPlayerPackage: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  successTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successTotalLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  successTotalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#22C55E',
  },
  whatsNextCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 24,
  },
  whatsNextTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  whatsNextItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  whatsNextNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  whatsNextNumberText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  whatsNextText: {
    fontSize: 14,
    color: '#D1D5DB',
    flex: 1,
    lineHeight: 20,
  },
  successPrimaryButton: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  successPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  successSecondaryButton: {
    paddingVertical: 12,
  },
  successSecondaryButtonText: {
    color: '#8B5CF6',
    fontSize: 16,
    fontWeight: '500',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    gap: 8,
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 14,
    flex: 1,
  },
});

export default ProgramRegistrationScreen;

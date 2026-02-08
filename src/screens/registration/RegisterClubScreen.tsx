import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../../navigation/linking';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'RegisterClub'>;

const BENEFITS = [
  {
    icon: 'cash-outline',
    title: 'Sustainable Fundraising',
    description:
      'Create ongoing revenue streams through courses and products',
  },
  {
    icon: 'school-outline',
    title: 'Premium Training Content',
    description: 'Access courses from experienced athletes and coaches',
  },
  {
    icon: 'people-outline',
    title: 'Team Management',
    description: 'Organize teams, track players, and communicate easily',
  },
  {
    icon: 'stats-chart-outline',
    title: 'Player Development',
    description: 'Evaluations, progress tracking, and skill assessments',
  },
  {
    icon: 'trophy-outline',
    title: 'Gamification',
    description: 'Keep players engaged with XP, achievements, and leaderboards',
  },
  {
    icon: 'wallet-outline',
    title: 'Commission System',
    description:
      'Earn from every course and product purchased by your community',
  },
];

export const RegisterClubScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  const handleContactUs = () => {
    Linking.openURL(
      'mailto:clubs@thryvyng.com?subject=Club Partnership Inquiry&body=Hi Thryvyng Team,%0D%0A%0D%0AI am interested in bringing Thryvyng to my club.%0D%0A%0D%0AClub Name:%0D%0AContact Name:%0D%0APhone:%0D%0ANumber of Teams:%0D%0A%0D%0AThank you!'
    );
  };

  const handleLearnMore = () => {
    Linking.openURL('https://thryvyng.com');
  };

  const handleGoBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Welcome');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <TouchableOpacity style={styles.backNav} onPress={handleGoBack}>
        <Ionicons name="arrow-back" size={24} color="#9CA3AF" />
        <Text style={styles.backNavText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.heroSection}>
        <View style={styles.iconContainer}>
          <Ionicons name="shield-checkmark" size={64} color="#8B5CF6" />
        </View>
        <Text style={styles.heroTitle}>Bring Thryvyng to Your Club</Text>
        <Text style={styles.heroSubtitle}>
          Partner with us to transform your club's fundraising and player
          development
        </Text>
      </View>

      <View style={styles.benefitsSection}>
        <Text style={styles.sectionTitle}>What You Get</Text>
        {BENEFITS.map((benefit, index) => (
          <View key={index} style={styles.benefitCard}>
            <View style={styles.benefitIcon}>
              <Ionicons
                name={benefit.icon as any}
                size={24}
                color="#8B5CF6"
              />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>{benefit.title}</Text>
              <Text style={styles.benefitDescription}>
                {benefit.description}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.howItWorksSection}>
        <Text style={styles.sectionTitle}>How It Works</Text>
        <View style={styles.step}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>1</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Contact Our Team</Text>
            <Text style={styles.stepDescription}>
              We'll discuss your club's needs and goals
            </Text>
          </View>
        </View>
        <View style={styles.stepConnector} />
        <View style={styles.step}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>2</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Custom Setup</Text>
            <Text style={styles.stepDescription}>
              We configure your club with branding and settings
            </Text>
          </View>
        </View>
        <View style={styles.stepConnector} />
        <View style={styles.step}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>3</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Launch & Grow</Text>
            <Text style={styles.stepDescription}>
              Start registering teams and earning commissions
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.statsSection}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>5%</Text>
          <Text style={styles.statLabel}>Platform Fee</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>15%</Text>
          <Text style={styles.statLabel}>Club Earnings</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>10%</Text>
          <Text style={styles.statLabel}>Team Earnings</Text>
        </View>
      </View>

      <View style={styles.ctaSection}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleContactUs}
        >
          <Ionicons name="mail-outline" size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Contact Our Team</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleLearnMore}
        >
          <Ionicons name="globe-outline" size={20} color="#8B5CF6" />
          <Text style={styles.secondaryButtonText}>Visit Our Website</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.existingClubSection}>
        <Text style={styles.existingClubText}>
          Already have a club on Thryvyng?
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.signInLink}>Sign in to your account</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.teamManagerSection}>
        <Text style={styles.teamManagerText}>Are you a team manager?</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('RegisterTeam')}
        >
          <Text style={styles.registerTeamLink}>
            Register your team under an existing club →
          </Text>
        </TouchableOpacity>
      </View>
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
  backNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  backNavText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#2D2050',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 24,
  },
  benefitsSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  benefitCard: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 16,
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2D2050',
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  benefitDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  howItWorksSection: {
    marginBottom: 32,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  stepContent: {
    flex: 1,
    paddingTop: 4,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  stepConnector: {
    width: 2,
    height: 24,
    backgroundColor: '#374151',
    marginLeft: 15,
    marginVertical: 8,
  },
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B5CF6',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  ctaSection: {
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
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
  existingClubSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  existingClubText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  signInLink: {
    fontSize: 14,
    color: '#8B5CF6',
    fontWeight: '500',
  },
  teamManagerSection: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  teamManagerText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  registerTeamLink: {
    fontSize: 14,
    color: '#22C55E',
    fontWeight: '500',
  },
});

export default RegisterClubScreen;

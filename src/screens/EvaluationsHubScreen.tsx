import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

export default function EvaluationsHubScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { teamId, teamName } = route.params || {};

  const cards = [
    {
      id: 'evaluations',
      icon: 'clipboard-outline' as keyof typeof Ionicons.glyphMap,
      accentColor: '#22c55e',
      title: 'Player Evaluations',
      subtitle: 'Create and review player assessments',
      onPress: () =>
        navigation.navigate('EvaluationRoster', {
          teamId,
          team_id: teamId,
          teamName: teamName || '',
        }),
    },
    {
      id: 'certificates',
      icon: 'trophy-outline' as keyof typeof Ionicons.glyphMap,
      accentColor: '#f59e0b',
      title: 'Certificates',
      subtitle: 'View and share player certificates',
      onPress: () => navigation.navigate('TeamCertificates', { teamId }),
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Evaluations Hub</Text>
          <Text style={styles.headerSubtitle}>Player assessments and achievements</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {cards.map((card) => (
          <TouchableOpacity
            key={card.id}
            style={styles.card}
            onPress={card.onPress}
            activeOpacity={0.75}
          >
            <View style={[styles.iconCircle, { backgroundColor: card.accentColor + '33' }]}>
              <Ionicons name={card.icon} size={26} color={card.accentColor} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#475569" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backBtn: {
    padding: 2,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
  },
});

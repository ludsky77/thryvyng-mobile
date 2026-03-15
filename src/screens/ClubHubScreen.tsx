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

interface HubCard {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

export default function ClubHubScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { teamId, clubId } = route.params || {};

  const cards: HubCard[] = [
    {
      id: 'training',
      icon: 'heart-circle-outline',
      accentColor: '#06b6d4',
      title: 'Training Studio',
      subtitle: 'Season plans, curriculum, and drills',
      onPress: () => navigation.navigate('TrainingStudio', { teamId, clubId }),
    },
    ...(clubId
      ? [
          {
            id: 'surveys',
            icon: 'bar-chart-outline' as keyof typeof Ionicons.glyphMap,
            accentColor: '#8b5cf6',
            title: 'Survey Results',
            subtitle: 'View results shared by your club director',
            onPress: () => navigation.navigate('SurveyList', { clubId }),
          },
        ]
      : []),
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Club Hub</Text>
          <Text style={styles.headerSubtitle}>Club tools and resources</Text>
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

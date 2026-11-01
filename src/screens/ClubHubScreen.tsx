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
import { playbookVisible } from '../constants/playbookLaunch';

interface HubCard {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  /**
   * Presentational only, fork PLAYBOOK-CARD-INVITING: the tile wears the
   * accent as a rule around a raised face, and shows `cue` under its
   * subtitle. Set on the Playbook tile so it reads as the same feature as the
   * Courses featured card and the dashboard card. Its shape, its press target
   * and its route are untouched.
   */
  featured?: boolean;
  cue?: string;
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
    // The PAC Playbook — the coaches' and directors' way in (placement ruling
    // Oct 28-29: players and parents enter from the dashboard and the course
    // list, staff from Club Hub). One more card in this array, lazy-routed, so
    // none of the book is in this screen's bundle. Hidden until release by the
    // launch switch (src/constants/playbookLaunch.ts).
    ...(playbookVisible
      ? [
          {
            id: 'playbook',
            icon: 'book-outline' as keyof typeof Ionicons.glyphMap,
            // The book's green, not the generic violet — `color.green`
            // `#10b981` (src/features/pac-playbook/theme.ts:79), written out
            // because the book is a lazy route and importing its theme here
            // would put its module graph in this screen's bundle.
            accentColor: '#10b981',
            title: 'PAC Playbook',
            // THE SHARED TAGLINE and the shared cue — the cover's own opening
            // words (features/pac-playbook/screens/CoverScreen.tsx:139).
            subtitle: 'How we see the game, how we play it and how we think',
            cue: 'Open the book ›',
            featured: true,
            onPress: () => navigation.navigate('Playbook'),
          },
        ]
      : []),
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
            style={[styles.card, card.featured ? styles.cardFeatured : null]}
            onPress={card.onPress}
            activeOpacity={0.75}
          >
            <View style={[styles.iconCircle, { backgroundColor: card.accentColor + '33' }]}>
              <Ionicons name={card.icon} size={26} color={card.accentColor} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
              {card.cue ? (
                <Text style={[styles.cardCue, { color: card.accentColor }]}>{card.cue}</Text>
              ) : null}
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={card.featured ? card.accentColor : '#475569'}
            />
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
  // Fork PLAYBOOK-CARD-INVITING: a featured tile keeps the row shape above and
  // gains the playbook's RAISED FACE inside a rule in its own accent — the
  // device the book's quiz card uses (`pbk.quizcard`: `lineWidth.mid` of
  // `color.green` around `color.card2`). Written out, not imported: the book
  // is a lazy route. card2 `#1c2637` (theme.ts:63), green `#10b981`
  // (theme.ts:79), mid `1.5` (theme.ts:255). The rule's colour is written here
  // rather than taken from the card's `accentColor` at the call site, because
  // that would be an inline style and this screen's lint forbids them; today
  // the Playbook tile is the only featured one and the two agree.
  cardFeatured: {
    backgroundColor: '#1c2637',
    borderWidth: 1.5,
    borderColor: '#10b981',
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
  // The shared cue. Same words in all three ways in; the colour is the
  // card's accent, applied at the call site.
  cardCue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
});

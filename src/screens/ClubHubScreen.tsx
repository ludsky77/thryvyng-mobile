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
  /** Optional since ACCENT-A: a tile whose `kicker` names it needs no title. */
  title?: string;
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
  /**
   * An uppercase, accent-coloured eyebrow above the subtitle — ruling
   * ACCENT-A: the Playbook's SIGN is identical on all three doors into the
   * book, and the kicker is the line that names it. A tile that sets `kicker`
   * drops `title`, because the kicker IS the name and printing both said it
   * twice. No other hub tile sets it, and none of them changes.
   */
  kicker?: string;
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
            // THE SIGN — ruling ACCENT-A. The kicker carries the name on all
            // three doors, so there is no `title` here; the tagline below is
            // the tile's headline. The book's glyph stays in the icon circle
            // every hub tile has, which is this host's own furniture.
            kicker: 'PAC Playbook',
            // THE SHARED TAGLINE and the shared cue — the cover's own opening
            // words (features/pac-playbook/screens/CoverScreen.tsx:139). The
            // cue lost its `›`: the tile's chevron is its one tap cue.
            subtitle: 'How we see the game, how we play it and how we think',
            cue: 'Open the book',
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
              {card.kicker ? (
                <Text style={[styles.cardKicker, { color: card.accentColor }]}>
                  {card.kicker}
                </Text>
              ) : null}
              {card.title ? <Text style={styles.cardTitle}>{card.title}</Text> : null}
              <Text style={[styles.cardSubtitle, card.kicker ? styles.cardSubtitleLead : null]}>
                {card.subtitle}
              </Text>
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
  // THE SIGN'S KICKER — ruling ACCENT-A, identical on all three doors into
  // the book. The book's own green eyebrow, by value: `role.labelAccent` at
  // `fs.hitEyebrow` (`src/features/pac-playbook/type.ts`) — 11.5pt, 700,
  // `capsWide` tracking (11.5 × 0.08 = 0.92), uppercase. The COLOUR comes
  // from the tile's `accentColor` at the call site, which for the Playbook is
  // `color.green` `#10b981`. `fontWeight` and not a face: Archivo is loaded
  // by the book alone (`font.ts`), so a hub tile asking for it would silently
  // get the system font.
  cardKicker: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.92,
    textTransform: 'uppercase',
  },
  // A kicker'd tile has no title, so its subtitle is the headline and takes
  // the sign's own ink and size — `color.chalk2` `#d7dde6` (theme.ts), the
  // same line the other two doors print.
  cardSubtitleLead: {
    color: '#d7dde6',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  // The shared cue. Same words in all three ways in; the colour is the
  // card's accent, applied at the call site.
  cardCue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
});

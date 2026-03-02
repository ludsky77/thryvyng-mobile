import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useIsFemaleAthlete } from '../hooks/useWellness';

interface HealthItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  route: string;
  femaleOnly?: boolean;
}

const healthItems: HealthItem[] = [
  {
    id: 'wellness',
    title: "Women's Wellness",
    subtitle: 'Training, nutrition & tips for female athletes',
    icon: 'heart',
    iconBg: '#ec4899',
    iconColor: '#fff',
    route: 'WellnessHub',
    femaleOnly: true,
  },
  {
    id: 'skills',
    title: 'Skills Library',
    subtitle: 'Drills and technique videos',
    icon: 'play-circle',
    iconBg: '#8b5cf6',
    iconColor: '#fff',
    route: 'SkillsLibrary',
  },
];

export default function HealthScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { playerId, userId } = route.params || {};

  const { isFemale, loading: checkingGender } = useIsFemaleAthlete(playerId);

  const handleItemPress = (item: HealthItem) => {
    if (item.route === 'WellnessHub') {
      navigation.navigate('WellnessHub', { playerId, userId });
    } else if (item.route === 'SkillsLibrary') {
      navigation.navigate('SkillsLibrary', { playerId, userId });
    }
  };

  const visibleItems = healthItems.filter((item) => {
    if (item.femaleOnly) return isFemale;
    return true;
  });

  if (checkingGender) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Health</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {visibleItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.itemCard}
            onPress={() => handleItemPress(item)}
            activeOpacity={0.7}
          >
            <View style={[styles.itemIcon, { backgroundColor: item.iconBg }]}>
              <Ionicons
                name={item.icon as any}
                size={28}
                color={item.iconColor}
              />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  headerSpacer: { width: 40 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: { flex: 1, marginLeft: 16 },
  itemTitle: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  itemSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
});

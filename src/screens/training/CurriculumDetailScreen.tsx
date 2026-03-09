import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

interface SessionRef {
  id: string;
  session_id?: string | null;
  session?: {
    id: string;
    title?: string | null;
    title_es?: string | null;
    topic?: string | null;
  } | null;
}

interface CurriculumItem {
  id: string;
  name: string;
  name_es?: string | null;
  description?: string | null;
  description_es?: string | null;
  age_group?: string | null;
  total_weeks?: number | null;
  club_id?: string | null;
  sessions?: SessionRef[] | null;
}

export default function CurriculumDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const curriculum = (route.params as { curriculum?: CurriculumItem })?.curriculum;

  if (!curriculum) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Curriculum</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Curriculum not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleSessionPress = (sessionId: string) => {
    navigation.navigate('SessionDetail', { sessionId });
  };

  const sessions = curriculum.sessions || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {curriculum.name}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.curriculumHeader}>
          {curriculum.description && (
            <Text style={styles.description}>{curriculum.description}</Text>
          )}
          <View style={styles.metaRow}>
            {curriculum.age_group && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{curriculum.age_group}</Text>
              </View>
            )}
            {curriculum.total_weeks != null && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {curriculum.total_weeks} weeks
                </Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Linked Sessions</Text>

        {sessions.length === 0 ? (
          <Text style={styles.noSessions}>No linked sessions</Text>
        ) : (
          sessions.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.sessionCard}
              onPress={() => handleSessionPress(s.session?.id || '')}
              activeOpacity={0.7}
            >
              <View style={styles.sessionCardContent}>
                <Text style={styles.sessionTitle}>
                  {s.session?.title || 'Session'}
                </Text>
                {s.session?.topic && (
                  <Text style={styles.sessionTopic} numberOfLines={1}>
                    {s.session.topic}
                  </Text>
                )}
              </View>
              <Feather name="chevron-right" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  curriculumHeader: {
    marginBottom: 24,
  },
  description: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 22,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  noSessions: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sessionCardContent: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sessionTopic: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

function ageFromDob(dob: string | null | undefined): string {
  if (!dob) return '';
  const dayPart = dob.split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayPart);
  let birth: Date | null = null;
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const dt = new Date(y, mo, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d) birth = dt;
  }
  if (!birth) {
    const dt = new Date(dob);
    if (Number.isNaN(dt.getTime())) return '';
    birth = dt;
  }
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age -= 1;
  if (age < 0) return '';
  return `Age ${age}`;
}

export default function MyFamilyScreen({ navigation }: { navigation: any }) {
  const { user, profile } = useAuth();
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !profile?.email) {
      setChildren([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetchChildren = async () => {
      const { data } = await supabase
        .from('players')
        .select('id, first_name, last_name, date_of_birth, photo_url, team_id, teams(name)')
        .eq('parent_email', profile.email)
        .order('first_name');
      setChildren(data || []);
      setLoading(false);
    };
    void fetchChildren();
  }, [user?.id, profile?.email]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Family</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      ) : children.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="users" size={48} color="#4b5563" />
          <Text style={styles.emptyText}>No players linked to your account</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {children.map((child) => {
            const teamRaw = child.teams;
            const team = Array.isArray(teamRaw) ? teamRaw[0] : teamRaw;
            const name = [child.first_name, child.last_name].filter(Boolean).join(' ') || 'Player';
            const ageLabel = ageFromDob(child.date_of_birth);
            return (
              <TouchableOpacity
                key={child.id}
                style={styles.familyCard}
                onPress={() => navigation.navigate('EditChild', { playerId: child.id })}
                activeOpacity={0.75}
              >
                {child.photo_url ? (
                  <Image source={{ uri: child.photo_url }} style={styles.familyPhoto} />
                ) : (
                  <View style={styles.familyPhotoPlaceholder}>
                    <Text style={styles.familyPhotoLetter}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.familyCardCenter}>
                  <Text style={styles.familyName}>{name}</Text>
                  {team?.name ? <Text style={styles.familyTeam}>{team.name}</Text> : null}
                  {ageLabel ? <Text style={styles.familyAge}>{ageLabel}</Text> : null}
                </View>
                <Feather name="chevron-right" size={20} color="#4b5563" />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0a0a1a',
  },
  headerButton: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  headerSpacer: { width: 32 },
  scroll: { flex: 1, backgroundColor: '#0a0a1a' },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#0a0a1a',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: '#0a0a1a',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  familyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  familyPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  familyPhotoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  familyPhotoLetter: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  familyCardCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  familyName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  familyTeam: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 2,
  },
  familyAge: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
});

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type ResourceCategory =
  | 'rules'
  | 'schedules'
  | 'weather'
  | 'contacts'
  | 'forms'
  | 'links';

interface ClubResource {
  id: string;
  club_id: string;
  title: string;
  description: string | null;
  url: string;
  category: ResourceCategory;
  visibility: 'everyone' | 'staff_only';
  display_order: number;
  is_active: boolean;
}

const CATEGORY_CONFIG: Record<
  ResourceCategory,
  { label: string; icon: keyof typeof Feather.glyphMap; color: string; bgColor: string }
> = {
  rules: {
    label: 'Rules & Policies',
    icon: 'file-text',
    color: '#8b5cf6',
    bgColor: 'rgba(139, 92, 246, 0.15)',
  },
  schedules: {
    label: 'Schedules & Standings',
    icon: 'calendar',
    color: '#06b6d4',
    bgColor: 'rgba(6, 182, 212, 0.15)',
  },
  weather: {
    label: 'Weather Protocols',
    icon: 'cloud',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
  },
  contacts: {
    label: 'Contacts',
    icon: 'users',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
  },
  forms: {
    label: 'Forms',
    icon: 'edit-3',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.15)',
  },
  links: {
    label: 'External Links',
    icon: 'link',
    color: '#64748b',
    bgColor: 'rgba(100, 116, 139, 0.15)',
  },
};

export default function TeamResourcesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { user } = useAuth();
  const params = (route.params as any) || {};

  const teamId = params.teamId ?? params.team_id ?? null;
  const playerId = params.playerId ?? null;

  const [resources, setResources] = useState<ClubResource[]>([]);
  const [resolvedTeamId, setResolvedTeamId] = useState<string | null>(teamId);
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'everyone' | 'staff_only'>('everyone');

  useEffect(() => {
    if (teamId) {
      setResolvedTeamId(teamId);
    } else if (playerId) {
      const resolveTeamFromPlayer = async () => {
        const { data } = await supabase
          .from('players')
          .select('team_id')
          .eq('id', playerId)
          .single();
        setResolvedTeamId(data?.team_id ?? null);
      };
      resolveTeamFromPlayer();
    } else {
      setResolvedTeamId(null);
    }
  }, [teamId, playerId]);

  useEffect(() => {
    fetchResources();
  }, [resolvedTeamId, user?.id]);

  const fetchResources = async () => {
    if (!resolvedTeamId || !user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: team } = await supabase
        .from('teams')
        .select('club_id')
        .eq('id', resolvedTeamId)
        .single();

      if (!team?.club_id) {
        setLoading(false);
        return;
      }

      let staffInClub = false;
      try {
        const { data: rpcResult } = await supabase.rpc('is_club_team_staff', {
          _user_id: user.id,
          _club_id: team.club_id,
        });
        staffInClub = !!rpcResult;
      } catch {
        const { data: clubTeams } = await supabase
          .from('teams')
          .select('id')
          .eq('club_id', team.club_id);
        const teamIds = (clubTeams || []).map((t: any) => t.id);
        if (teamIds.length > 0) {
          const { data: staffData } = await supabase
            .from('team_staff')
            .select('id')
            .eq('user_id', user.id)
            .in('team_id', teamIds)
            .limit(1)
            .maybeSingle();
          staffInClub = !!staffData;
        }
      }

      setIsStaff(staffInClub);

      let query = supabase
        .from('club_resources')
        .select('*')
        .eq('club_id', team.club_id)
        .eq('is_active', true)
        .order('category')
        .order('display_order');

      if (!staffInClub) {
        query = query.eq('visibility', 'everyone');
      }

      const { data, error } = await query;

      if (error) throw error;
      setResources(data || []);
    } catch (err) {
      console.error('Error fetching resources:', err);
    } finally {
      setLoading(false);
    }
  };

  const groupedResources = useMemo(() => {
    const filtered = isStaff
      ? resources.filter((r) => r.visibility === activeTab)
      : resources;

    return filtered.reduce(
      (acc, resource) => {
        if (!acc[resource.category]) {
          acc[resource.category] = [];
        }
        acc[resource.category].push(resource);
        return acc;
      },
      {} as Record<ResourceCategory, ClubResource[]>
    );
  }, [resources, activeTab, isStaff]);

  const openResource = (url: string) => {
    Linking.openURL(url).catch((err) => {
      console.error('Failed to open URL:', err);
      Alert.alert('Error', 'Could not open this link');
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team Resources</Text>
        <View style={{ width: 24 }} />
      </View>

      {isStaff && (
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'everyone' && styles.activeTab]}
            onPress={() => setActiveTab('everyone')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'everyone' && styles.activeTabText,
              ]}
            >
              Everyone
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'staff_only' && styles.activeTab]}
            onPress={() => setActiveTab('staff_only')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'staff_only' && styles.activeTabText,
              ]}
            >
              Staff Only
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      ) : Object.keys(groupedResources).length === 0 ? (
        <View style={styles.centerContainer}>
          <Feather name="file-text" size={48} color="#64748b" />
          <Text style={styles.emptyTitle}>No resources available</Text>
          <Text style={styles.emptySubtitle}>
            Your club director will add helpful documents and links here.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {(Object.keys(groupedResources) as ResourceCategory[]).map(
            (category) => {
              const config = CATEGORY_CONFIG[category];
              return (
                <View key={category} style={styles.categorySection}>
                  <View style={styles.categoryHeader}>
                    <View
                      style={[
                        styles.categoryIconContainer,
                        { backgroundColor: config.bgColor },
                      ]}
                    >
                      <Feather
                        name={config.icon}
                        size={18}
                        color={config.color}
                      />
                    </View>
                    <Text style={styles.categoryTitle}>{config.label}</Text>
                  </View>

                  <View style={styles.resourcesList}>
                    {groupedResources[category].map((resource) => (
                      <TouchableOpacity
                        key={resource.id}
                        style={styles.resourceItem}
                        onPress={() => openResource(resource.url)}
                      >
                        <View style={styles.resourceContent}>
                          <Text style={styles.resourceTitle}>
                            {resource.title}
                          </Text>
                          {resource.description && (
                            <Text style={styles.resourceDescription}>
                              {resource.description}
                            </Text>
                          )}
                        </View>
                        <Feather name="chevron-right" size={20} color="#64748b" />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            }
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
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
  },
  tabContainer: {
    flexDirection: 'row',
    margin: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#8b5cf6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
  },
  activeTabText: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resourcesList: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  resourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  resourceContent: {
    flex: 1,
  },
  resourceTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  resourceDescription: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
});

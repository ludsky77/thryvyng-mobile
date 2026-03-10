import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';

interface LineupItem {
  id: string;
  name: string;
  field_type?: string | null;
  formation_template?: string | null;
  status?: string | null;
  opponent_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  event?: { id: string; title?: string | null; event_date?: string | null; start_time?: string | null } | null;
  team?: { id: string; name?: string | null } | null;
}

export default function LineupListScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params as { teamId?: string; clubId?: string }) || {};
  const { teamId, clubId } = params;

  const [lineups, setLineups] = useState<LineupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const isDirector = !teamId && !!clubId;

  const fetchLineups = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const col = teamId ? 'team_id' : 'club_id';
        const val = teamId || clubId;
        if (!val) {
          setLineups([]);
          return;
        }

        const { data, error } = await supabase
          .from('lineup_formations')
          .select(
            'id, name, field_type, formation_template, status, opponent_name, notes, created_at, updated_at, event:cal_events(id, title, event_date, start_time), team:teams(id, name)'
          )
          .eq(col, val)
          .order('updated_at', { ascending: false })
          .limit(20);

        if (error) throw error;
        setLineups((data || []) as LineupItem[]);
      } catch (err) {
        console.error('Error fetching lineups:', err);
        setLineups([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [teamId, clubId]
  );

  useEffect(() => {
    fetchLineups();
  }, [fetchLineups]);

  const totalLineups = lineups.length;
  const publishedCount = lineups.filter((l) => l.status === 'published').length;
  const linkedCount = lineups.filter((l) => l.event?.id).length;

  const handleCardPress = (lineup: LineupItem) => {
    const tid = lineup.team?.id || teamId;
    if (!tid) return;
    navigation.navigate('LineupEditor', { lineupId: lineup.id, teamId: tid });
  };

  const handleDelete = (lineup: LineupItem) => {
    Alert.alert(
      'Delete Lineup',
      'Delete this lineup?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('lineup_formations')
                .delete()
                .eq('id', lineup.id);
              if (error) throw error;
              setLineups((prev) => prev.filter((l) => l.id !== lineup.id));
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  const handleCreateSuccess = (newId: string, createdTeamId?: string) => {
    setCreateModalVisible(false);
    const tid = createdTeamId || teamId || lineups[0]?.team?.id;
    if (tid) {
      navigation.navigate('LineupEditor', { lineupId: newId, teamId: tid });
    } else {
      fetchLineups(true);
    }
  };

  if (loading && lineups.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Lineup Master</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lineup Master</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={lineups}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{totalLineups}</Text>
              <Text style={styles.statLabel}>Total Lineups</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{publishedCount}</Text>
              <Text style={styles.statLabel}>Published</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{linkedCount}</Text>
              <Text style={styles.statLabel}>Linked</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => handleCardPress(item)}
            onLongPress={() => handleDelete(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.cardTitle}>{item.name}</Text>
            <View style={styles.pillsRow}>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{item.formation_template || '—'}</Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{item.field_type || '11v11'}</Text>
              </View>
            </View>
            {item.opponent_name && (
              <Text style={styles.opponent}>vs {item.opponent_name}</Text>
            )}
            {item.event?.event_date && (
              <Text style={styles.eventDate}>
                {new Date(item.event.event_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {item.event.start_time ? `, ${item.event.start_time}` : ''}
              </Text>
            )}
            <View style={styles.cardFooter}>
              <View
                style={[
                  styles.statusBadge,
                  item.status === 'published' ? styles.statusPublished : styles.statusDraft,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    item.status === 'published' ? styles.statusTextPublished : styles.statusTextDraft,
                  ]}
                >
                  {item.status || 'draft'}
                </Text>
              </View>
              <Text style={styles.updated}>
                {new Date(item.updated_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="grid" size={48} color="#64748b" />
            <Text style={styles.emptyTitle}>No lineups yet</Text>
            <Text style={styles.emptySubtitle}>Create your first lineup</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setCreateModalVisible(true)}
            >
              <Text style={styles.emptyButtonText}>+ New Lineup</Text>
            </TouchableOpacity>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchLineups(true)}
            tintColor="#8b5cf6"
          />
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setCreateModalVisible(true)}
      >
        <Feather name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      {createModalVisible && (
        <CreateLineupModal
          teamId={teamId}
          clubId={clubId}
          isDirector={isDirector}
          onClose={() => setCreateModalVisible(false)}
          onSuccess={(id, tid) => handleCreateSuccess(id, tid)}
        />
      )}
    </SafeAreaView>
  );
}

const CreateLineupModal = ({
  teamId,
  clubId,
  isDirector,
  onClose,
  onSuccess,
}: {
  teamId?: string;
  clubId?: string;
  isDirector: boolean;
  onClose: () => void;
  onSuccess: (id: string, teamId?: string) => void;
}) => {
  const [name, setName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(teamId || null);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [fieldType, setFieldType] = useState('11v11');
  const [formation, setFormation] = useState('4-3-3');
  const [eventId, setEventId] = useState<string | null>(null);
  const [events, setEvents] = useState<{ id: string; title?: string; event_date?: string }[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { FORMATIONS_BY_FIELD } = require('../../data/formationPositions') as {
    FORMATIONS_BY_FIELD: Record<string, string[]>;
  };

  useEffect(() => {
    if (isDirector && clubId) {
      supabase
        .from('teams')
        .select('id, name')
        .eq('club_id', clubId)
        .order('name')
        .then(({ data }) => {
          const list = (data || []) as { id: string; name: string }[];
          setTeams(list);
          if (list.length > 0) setSelectedTeamId((prev) => prev || list[0].id);
        });
    } else if (teamId) {
      setSelectedTeamId(teamId);
    }
  }, [isDirector, clubId, teamId]);

  useEffect(() => {
    const tid = selectedTeamId || teamId;
    if (!tid) return;
    const today = new Date().toISOString().split('T')[0];
    supabase
      .from('cal_events')
      .select('id, title, event_date')
      .eq('team_id', tid)
      .eq('event_type', 'game')
      .gte('event_date', today)
      .order('event_date')
      .limit(20)
      .then(({ data }) => setEvents((data || []) as any[]));
  }, [selectedTeamId, teamId]);

  const formations = FORMATIONS_BY_FIELD[fieldType] || FORMATIONS_BY_FIELD['11v11'];

  const handleCreate = async () => {
    const tid = selectedTeamId || teamId;
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a lineup name');
      return;
    }
    if (!tid) {
      Alert.alert('Error', 'Please select a team');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('lineup_formations')
        .insert({
          name: name.trim(),
          team_id: tid,
          club_id: clubId || null,
          field_type: fieldType,
          formation_template: formation,
          status: 'draft',
          event_id: eventId || null,
          notes: notes.trim() || null,
        })
        .select('id')
        .single();

      if (error) throw error;
      onSuccess(data.id, tid);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create lineup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TouchableOpacity
      style={styles.modalOverlay}
      activeOpacity={1}
      onPress={onClose}
    >
      <TouchableOpacity
        style={styles.modal}
        activeOpacity={1}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Lineup</Text>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.inputLabel}>Lineup Name</Text>
        <TextInput
          style={styles.input}
          placeholder="vs Celtic — Starting XI"
          placeholderTextColor="#64748b"
          value={name}
          onChangeText={setName}
        />

        {isDirector && (
          <>
            <Text style={styles.inputLabel}>Team</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamScroll}>
              {teams.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.teamPill,
                    selectedTeamId === t.id && styles.teamPillActive,
                  ]}
                  onPress={() => setSelectedTeamId(t.id)}
                >
                  <Text
                    style={[
                      styles.teamPillText,
                      selectedTeamId === t.id && styles.teamPillTextActive,
                    ]}
                  >
                    {t.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={styles.inputLabel}>Field Type</Text>
        <View style={styles.fieldTypeRow}>
          {['11v11', '9v9', '7v7', '5v5'].map((ft) => (
            <TouchableOpacity
              key={ft}
              style={[styles.fieldTypeBtn, fieldType === ft && styles.fieldTypeBtnActive]}
              onPress={() => setFieldType(ft)}
            >
              <Text style={[styles.fieldTypeText, fieldType === ft && styles.fieldTypeTextActive]}>
                {ft}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.inputLabel}>Formation</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.formationScroll}>
          {formations.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.formationPill, formation === f && styles.formationPillActive]}
              onPress={() => setFormation(f)}
            >
              <Text
                style={[
                  styles.formationPillText,
                  formation === f && styles.formationPillTextActive,
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.inputLabel}>Link to Event</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventScroll}>
          <TouchableOpacity
            style={[styles.eventPill, !eventId && styles.eventPillActive]}
            onPress={() => setEventId(null)}
          >
            <Text style={[styles.eventPillText, !eventId && styles.eventPillTextActive]}>
              None
            </Text>
          </TouchableOpacity>
          {events.map((e) => (
            <TouchableOpacity
              key={e.id}
              style={[styles.eventPill, eventId === e.id && styles.eventPillActive]}
              onPress={() => setEventId(e.id)}
            >
              <Text
                style={[
                  styles.eventPillText,
                  eventId === e.id && styles.eventPillTextActive,
                ]}
                numberOfLines={1}
              >
                {e.title || new Date(e.event_date || '').toLocaleDateString()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.inputLabel}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Add notes..."
          placeholderTextColor="#64748b"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <TouchableOpacity
          style={[styles.createBtn, saving && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createBtnText}>Create</Text>
          )}
        </TouchableOpacity>
        </ScrollView>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  pill: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pillText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  opponent: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusDraft: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  statusPublished: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  statusTextDraft: {
    color: '#f59e0b',
  },
  statusTextPublished: {
    color: '#10b981',
  },
  updated: {
    fontSize: 12,
    color: '#64748b',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
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
    marginTop: 8,
  },
  emptyButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
    width: '100%',
  },
  modalScroll: {
    maxHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  fieldTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  fieldTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  fieldTypeBtnActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  fieldTypeText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  fieldTypeTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  formationScroll: {
    marginBottom: 16,
  },
  formationPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#475569',
  },
  formationPillActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  formationPillText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  formationPillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  teamScroll: {
    marginBottom: 16,
  },
  teamPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#475569',
  },
  teamPillActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  teamPillText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  teamPillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  eventScroll: {
    marginBottom: 16,
  },
  eventPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#475569',
  },
  eventPillActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  eventPillText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  eventPillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  createBtn: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  createBtnDisabled: {
    opacity: 0.8,
  },
  createBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

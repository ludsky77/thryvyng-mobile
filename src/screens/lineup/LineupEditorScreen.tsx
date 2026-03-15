import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
  FlatList,
  Modal,
  Dimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { LineupFieldEditor, type PositionSlot, type JerseyConfig } from '../../components/lineup/LineupFieldEditor';
import { getFormationPositions } from '../../data/formationPositions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const JERSEY_COLORS = ['#8b5cf6', '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#ffffff', '#1f2937'];

interface Player {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  jersey_number: number | null;
}

function getPlayerDisplayName(p: Player): string {
  return p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown';
}

interface LineupPlayer {
  id: string;
  player_id: string | null;
  guest_name: string | null;
  jersey_number: number | null;
  position_code: string;
  position_x: number;
  position_y: number;
  is_starter: boolean;
  is_captain: boolean;
  sort_order: number;
  player_profile?: { first_name: string; last_name: string; jersey_number?: number | null } | null;
}

interface LineupFormation {
  id: string;
  name: string;
  team_id: string;
  event_id: string | null;
  status: string;
  field_type: string;
  formation_template: string;
  jersey_config?: JerseyConfig | null;
  notes?: string | null;
  event?: { title?: string | null; id?: string; event_date?: string } | null;
  players?: LineupPlayer[];
}

interface Assignment {
  positionIndex: number;
  playerId: string | null;
  guestName: string | null;
  jerseyNumber: number | null;
  isCaptain: boolean;
}

function MiniJerseyIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 36">
      <Path
        d="M8,0 L16,0 L20,4 L24,0 L32,0 L40,8 L34,14 L30,10 L30,36 L10,36 L10,10 L6,14 L0,8 Z"
        fill={color}
        stroke="#fff"
        strokeWidth={0.5}
      />
    </Svg>
  );
}

const FORMATIONS: Record<string, string[]> = {
  '11v11': ['4-3-3', '4-4-2', '4-4-2 Diamond', '4-2-3-1', '3-5-2', '3-4-3', '4-1-4-1', '4-5-1', '5-3-2', '5-4-1', '4-1-2-1-2'],
  '9v9': ['3-3-2', '3-2-3', '2-3-3', '3-1-2-2', '2-4-2', '1-3-2-2'],
  '7v7': ['2-3-1', '3-2-1', '2-1-2-1', '1-2-1-2', '3-1-2', '1-3-2', '2-2-2'],
  '5v5': ['2-1-1', '1-2-1', 'Diamond', '2-2', '1-1-2'],
};

export default function LineupEditorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params as { lineupId?: string; teamId?: string }) || {};
  const { lineupId, teamId } = params;

  const [lineup, setLineup] = useState<LineupFormation | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [events, setEvents] = useState<{ id: string; title?: string; event_date?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [eventId, setEventId] = useState<string | null>(null);
  const [jerseyConfig, setJerseyConfig] = useState<JerseyConfig>({});
  const [assignments, setAssignments] = useState<Map<number, Assignment>>(new Map());
  const [benchPlayers, setBenchPlayers] = useState<Assignment[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [jerseyModalVisible, setJerseyModalVisible] = useState(false);
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestNumber, setGuestNumber] = useState('');
  const [assigningFromBench, setAssigningFromBench] = useState<{ type: 'roster'; player: Player } | { type: 'guest'; idx: number } | null>(null);
  const [visualSettingsVisible, setVisualSettingsVisible] = useState(false);
  const [formationPickerVisible, setFormationPickerVisible] = useState(false);
  const [fieldTypePickerVisible, setFieldTypePickerVisible] = useState(false);
  const [visualConfig, setVisualConfig] = useState({ jerseySize: 100, jerseyOutline: 3, fieldLines: 50, nameSize: 100 });
  const [positionOverrides, setPositionOverrides] = useState<Map<number, { x: number; y: number }>>(new Map());
  const { profile: authProfile } = useAuth();


  const fetchData = useCallback(async () => {
    if (!lineupId) return;
    setLoading(true);
    setError(null);
    try {
      const lineupRes = await supabase
        .from('lineup_formations')
        .select(
          `*, players:lineup_players(*, player_profile:players(id, first_name, last_name, jersey_number)),
          event:cal_events(id, title, event_date)`
        )
        .eq('id', lineupId)
        .single();

      if (lineupRes.error) throw lineupRes.error;
      const lf = lineupRes.data as LineupFormation;
      const teamIdFromLineup = lf.team_id;
      setLineup(lf);
      setName(lf.name || '');
      setNotes(lf.notes || '');
      setEventId(lf.event_id);
      setStatus(lf.status === 'published' ? 'published' : 'draft');
      setJerseyConfig(lf.jersey_config || {});
      setVisualConfig((lf.jersey_config as any)?.visual || { jerseySize: 100, jerseyOutline: 3, fieldLines: 50, nameSize: 100 });

      console.log('Fetching roster for teamId:', teamIdFromLineup);
      const [rosterRes, eventsRes] = await Promise.all([
        supabase
          .from('players')
          .select('id, first_name, last_name, jersey_number, status')
          .eq('team_id', teamIdFromLineup)
          .order('jersey_number', { ascending: true }),
        supabase
          .from('cal_events')
          .select('id, title, event_date')
          .eq('team_id', teamIdFromLineup)
          .eq('event_type', 'game')
          .gte('event_date', new Date().toISOString().split('T')[0])
          .order('event_date')
          .limit(20),
      ]);

      console.log('Roster result:', rosterRes.data?.length ?? 0, 'players, error:', rosterRes.error);
      setRoster((rosterRes.data || []) as Player[]);
      setEvents((eventsRes.data || []) as any[]);

      const loadedPositions = getFormationPositions(lf.formation_template, lf.field_type);
      const assignMap = new Map<number, Assignment>();
      const overrides = new Map<number, { x: number; y: number }>();
      const bench: Assignment[] = [];
      const usedIndices = new Set<number>();

      (lf.players || []).forEach((lp: LineupPlayer) => {
        const profile = lp.player_profile;
        const a: Assignment = {
          positionIndex: -1,
          playerId: lp.player_id,
          guestName: lp.guest_name,
          jerseyNumber: lp.jersey_number ?? profile?.jersey_number ?? null,
          isCaptain: lp.is_captain,
        };
        if (!lp.is_starter) {
          bench.push({ ...a, positionIndex: -1 });
          return;
        }
        const idx = loadedPositions.findIndex((p, i) => p.code === lp.position_code && !usedIndices.has(i));
        if (idx >= 0) {
          usedIndices.add(idx);
          const defaultPos = loadedPositions[idx];
          if (Math.abs((lp.position_x ?? 0) - defaultPos.x) > 0.5 || Math.abs((lp.position_y ?? 0) - defaultPos.y) > 0.5) {
            overrides.set(idx, { x: lp.position_x ?? defaultPos.x, y: lp.position_y ?? defaultPos.y });
          }
          assignMap.set(idx, { ...a, positionIndex: idx });
        }
      });
      setAssignments(assignMap);
      setPositionOverrides(overrides);
      setBenchPlayers(bench);
    } catch (err: any) {
      setError(err?.message || 'Lineup not found');
    } finally {
      setLoading(false);
    }
  }, [lineupId]);

  const hasLoaded = useRef(false);
  useEffect(() => {
    hasLoaded.current = false;
  }, [lineupId]);
  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      fetchData();
    }
  }, [fetchData]);

  const basePositions = useMemo(() => {
    if (!lineup) return [];
    return getFormationPositions(lineup.formation_template, lineup.field_type);
  }, [lineup?.formation_template, lineup?.field_type]);

  const positions: PositionSlot[] = useMemo(() => {
    return basePositions.map((pos, i) => {
      const override = positionOverrides.get(i);
      const a = assignments.get(i);
      let fullName = '';
      let lastName = '';
      if (a) {
        const p = a.playerId ? roster.find((r) => r.id === a.playerId) : null;
        fullName = a.guestName || (p ? getPlayerDisplayName(p) : '');
        lastName = p ? (p.last_name || p.full_name?.split(' ').pop() || '') : (a.guestName ? a.guestName.split(' ').pop() || '' : '');
      }
      return {
        ...pos,
        x: override?.x ?? pos.x,
        y: override?.y ?? pos.y,
        assignedPlayer: a
          ? { id: a.playerId || `g-${i}`, fullName, lastName, jerseyNumber: a.jerseyNumber, isCaptain: a.isCaptain }
          : undefined,
      };
    });
  }, [basePositions, assignments, roster, positionOverrides]);

  const assignedIds = useMemo(() => {
    const s = new Set<string>();
    assignments.forEach((a) => a.playerId && s.add(a.playerId));
    return s;
  }, [assignments]);

  const availablePlayers = useMemo(() => {
    return roster.filter((p) => !assignedIds.has(p.id));
  }, [roster, assignedIds]);

  const filteredPickerPlayers = useMemo(() => {
    const sortByLastName = (list: Player[]) =>
      [...list].sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
    if (!pickerSearch.trim()) return sortByLastName(availablePlayers);
    const q = pickerSearch.toLowerCase();
    const filtered = availablePlayers.filter(
      (p) =>
        getPlayerDisplayName(p).toLowerCase().includes(q) || String(p.jersey_number || '').includes(q)
    );
    return sortByLastName(filtered);
  }, [availablePlayers, pickerSearch]);

  const benchTiles = useMemo(() => {
    const unassignedRoster = roster.filter((p) => !assignedIds.has(p.id));
    type BenchTile = { type: 'roster'; player: Player } | { type: 'guest'; guestName: string; jerseyNumber: number | null; guestIdx: number };
    const tiles: BenchTile[] = [
      ...unassignedRoster.map((p) => ({ type: 'roster' as const, player: p })),
      ...benchPlayers.map((b, i) => ({ type: 'guest' as const, guestName: b.guestName || '', jerseyNumber: b.jerseyNumber, guestIdx: i })),
    ];
    return tiles;
  }, [roster, assignedIds, benchPlayers]);

  const handlePositionTap = (index: number) => {
    if (assigningFromBench !== null) {
      if (assigningFromBench.type === 'roster') {
        setAssignments((prev) => {
          const n = new Map(prev);
          n.set(index, {
            positionIndex: index,
            playerId: assigningFromBench.player.id,
            guestName: null,
            jerseyNumber: assigningFromBench.player.jersey_number,
            isCaptain: false,
          });
          return n;
        });
      } else {
        const bench = benchPlayers[assigningFromBench.idx];
        if (bench) {
          setAssignments((prev) => {
            const n = new Map(prev);
            n.set(index, { ...bench, positionIndex: index, isCaptain: false });
            return n;
          });
          setBenchPlayers((prev) => prev.filter((_, i) => i !== assigningFromBench.idx));
        }
      }
      setAssigningFromBench(null);
      return;
    }
    const a = assignments.get(index);
    if (a) {
      const p = a.playerId ? roster.find((r) => r.id === a.playerId) : null;
      const name = a.guestName || (p ? getPlayerDisplayName(p) : '');
      const currentCaptainCount = Array.from(assignments.values()).filter((x) => x.isCaptain).length;
      const captainOption =
        a.isCaptain
          ? { text: 'Remove Captain', onPress: () => setAssignments((prev) => { const n = new Map(prev); const cur = n.get(index); if (cur) n.set(index, { ...cur, isCaptain: false }); return n; }) }
          : currentCaptainCount >= 4
            ? { text: 'Set as Captain (max reached)' as const, onPress: () => Alert.alert('Maximum Captains', 'You can assign up to 4 captains per lineup.') }
            : { text: 'Set as Captain' as const, onPress: () => setAssignments((prev) => { const n = new Map(prev); const cur = n.get(index); if (cur) n.set(index, { ...cur, isCaptain: true }); return n; }) };
      Alert.alert(
        `${name} #${a.jerseyNumber ?? '?'}`,
        '',
        [
          { text: 'Cancel', style: 'cancel' },
          captainOption,
          {
            text: 'Move to Bench',
            onPress: () => {
              setAssignments((prev) => {
                const n = new Map(prev);
                const removed = n.get(index);
                n.delete(index);
                if (removed?.guestName)
                  setBenchPlayers((b) => [...b, { ...removed, positionIndex: -1 }]);
                return n;
              });
            },
          },
          {
            text: 'Reset Position',
            onPress: () => {
              setPositionOverrides((prev) => {
                const n = new Map(prev);
                n.delete(index);
                return n;
              });
            },
          },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              setAssignments((prev) => {
                const n = new Map(prev);
                const removed = n.get(index);
                n.delete(index);
                if (removed?.guestName)
                  setBenchPlayers((b) => [...b, { ...removed, positionIndex: -1 }]);
                return n;
              });
              setPositionOverrides((prev) => {
                const n = new Map(prev);
                n.delete(index);
                return n;
              });
            },
          },
        ]
      );
    } else {
      setSelectedPosition(index);
      setPickerVisible(true);
    }
  };

  const assignPlayer = (player: Player) => {
    if (selectedPosition === null) return;
    setAssignments((prev) => {
      const n = new Map(prev);
      n.set(selectedPosition, {
        positionIndex: selectedPosition,
        playerId: player.id,
        guestName: null,
        jerseyNumber: player.jersey_number,
        isCaptain: false,
      });
      return n;
    });
    setSelectedPosition(null);
    setPickerVisible(false);
  };

  const assignGuest = (gn: string, gnum: string | null) => {
    if (selectedPosition === null) return;
    const num = gnum ? parseInt(gnum, 10) : null;
    setAssignments((prev) => {
      const n = new Map(prev);
      n.set(selectedPosition, {
        positionIndex: selectedPosition,
        playerId: null,
        guestName: gn,
        jerseyNumber: Number.isNaN(num as number) ? null : num,
        isCaptain: false,
      });
      return n;
    });
    setSelectedPosition(null);
    setGuestModalVisible(false);
    setGuestName('');
    setGuestNumber('');
  };

  const addGuestToBench = () => {
    if (!guestName.trim()) return Alert.alert('Error', 'Enter name');
    const num = guestNumber.trim() ? parseInt(guestNumber, 10) : null;
    setBenchPlayers((prev) => [
      ...prev,
      {
        positionIndex: -1,
        playerId: null,
        guestName: guestName.trim(),
        jerseyNumber: Number.isNaN(num as number) ? null : num,
        isCaptain: false,
      },
    ]);
    setGuestModalVisible(false);
    setGuestName('');
    setGuestNumber('');
  };

  const benchTileAction = (idx: number) => {
    const tile = benchTiles[idx];
    if (!tile) return;
    const name = tile.type === 'roster' ? getPlayerDisplayName(tile.player) : tile.guestName || 'Guest';
    const num = tile.type === 'roster' ? tile.player.jersey_number : tile.jerseyNumber;
    Alert.alert(
      `${name} #${num ?? '?'}`,
      '',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Assign to Position',
          onPress: () => {
            if (tile.type === 'roster') setAssigningFromBench({ type: 'roster', player: tile.player });
            else setAssigningFromBench({ type: 'guest', idx: tile.guestIdx });
          },
        },
        ...(tile.type === 'guest'
          ? [{
              text: 'Remove from Squad' as const,
              style: 'destructive' as const,
              onPress: () => setBenchPlayers((prev) => prev.filter((_, i) => i !== tile.guestIdx)),
            }]
          : []),
      ]
    );
  };

  const handleSave = async () => {
    if (!lineupId || !lineup || saving) return;
    const previousStatus = lineup.status;
    setSaving(true);
    try {
      const updateResult = await supabase
        .from('lineup_formations')
        .update({
          name: name.trim(),
          status,
          formation_template: lineup.formation_template,
          field_type: lineup.field_type,
          jersey_config: { ...jerseyConfig, visual: visualConfig },
          notes: notes.trim() || null,
          event_id: eventId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lineupId);

      const deleteResult = await supabase.from('lineup_players').delete().eq('formation_id', lineupId);

      const inserts: any[] = [];
      let so = 0;
      const insertedPlayerIds = new Set<string>();

      basePositions.forEach((pos, i) => {
        const a = assignments.get(i);
        if (a) {
          if (a.playerId) insertedPlayerIds.add(a.playerId);
          const override = positionOverrides.get(i);
          inserts.push({
            formation_id: lineupId,
            player_id: a.playerId,
            guest_name: a.guestName,
            jersey_number: a.jerseyNumber,
            position_code: pos.code,
            position_x: override ? override.x : pos.x,
            position_y: override ? override.y : pos.y,
            is_starter: true,
            is_captain: a.isCaptain,
            sort_order: so++,
          });
        }
      });

      roster.filter((p) => !insertedPlayerIds.has(p.id)).forEach((p) => {
        insertedPlayerIds.add(p.id);
        inserts.push({
          formation_id: lineupId,
          player_id: p.id,
          guest_name: null,
          jersey_number: p.jersey_number,
          position_code: 'BENCH',
          position_x: 0,
          position_y: 0,
          is_starter: false,
          is_captain: false,
          sort_order: so++,
        });
      });

      benchPlayers.filter((b) => b.guestName).forEach((b) => {
        inserts.push({
          formation_id: lineupId,
          player_id: null,
          guest_name: b.guestName,
          jersey_number: b.jerseyNumber,
          position_code: 'BENCH',
          position_x: 0,
          position_y: 0,
          is_starter: false,
          is_captain: false,
          sort_order: so++,
        });
      });

      console.log('SAVE DEBUG - lineupId:', lineupId);
      console.log('SAVE DEBUG - formation_template:', lineup?.formation_template);
      console.log('SAVE DEBUG - assignments count:', assignments.size);
      console.log('SAVE DEBUG - inserts count:', inserts.length);
      console.log('SAVE DEBUG - first insert:', JSON.stringify(inserts[0]));
      console.log('SAVE DEBUG - update result:', updateResult.error);
      console.log('SAVE DEBUG - delete result:', deleteResult.error);

      if (inserts.length > 0) {
        const insertResult = await supabase.from('lineup_players').insert(inserts);
        console.log('SAVE DEBUG - insert result:', insertResult.error, 'inserted:', insertResult.data?.length);
      }

      setLineup((p) => (p ? { ...p, status, name: name.trim(), notes, jersey_config: { ...jerseyConfig, visual: visualConfig } } : null));
      if (previousStatus !== 'published' && status === 'published') {
        try {
          const { notifyLineupPublished } = await import('../../services/lineupNotificationService');
          notifyLineupPublished({
            lineupId,
            teamId: lineup.team_id || teamId || '',
            eventId: lineup.event_id || null,
            lineupName: name.trim(),
            eventTitle: lineup.event?.title ?? null,
            coachName: authProfile?.full_name || 'Coach',
          });
        } catch { /* share notification non-critical */ }
      }
      Alert.alert('Saved', 'Lineup updated successfully');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const switchFormation = (newFormation: string) => {
    if (!lineup) return;
    const newFieldType = lineup.field_type || '11v11';
    const oldPositions = basePositions;
    const newPositions = getFormationPositions(newFormation, newFieldType);
    const newAssignments = new Map<number, Assignment>();
    const usedNewIndices = new Set<number>();
    const unmatchedAssignments: { assignment: Assignment; oldIndex: number }[] = [];

    assignments.forEach((assignment, oldIndex) => {
      const oldCode = oldPositions[oldIndex]?.code;
      const newIndex = newPositions.findIndex((p, i) => p.code === oldCode && !usedNewIndices.has(i));
      if (newIndex >= 0) {
        newAssignments.set(newIndex, { ...assignment, positionIndex: newIndex });
        usedNewIndices.add(newIndex);
      } else {
        unmatchedAssignments.push({ assignment, oldIndex });
      }
    });

    const stillUnmatched: { assignment: Assignment; oldIndex: number }[] = [];
    unmatchedAssignments.forEach(({ assignment, oldIndex }) => {
      const oldRole = oldPositions[oldIndex]?.role;
      const newIndex = newPositions.findIndex((p, i) => p.role === oldRole && !usedNewIndices.has(i));
      if (newIndex >= 0) {
        newAssignments.set(newIndex, { ...assignment, positionIndex: newIndex });
        usedNewIndices.add(newIndex);
      } else {
        stillUnmatched.push({ assignment, oldIndex });
      }
    });

    stillUnmatched.forEach(({ assignment, oldIndex }) => {
      const oldPos = oldPositions[oldIndex];
      if (!oldPos) return;
      let bestIndex = -1;
      let bestDist = Infinity;
      newPositions.forEach((p, idx) => {
        if (usedNewIndices.has(idx)) return;
        const dist = Math.sqrt(Math.pow(p.x - oldPos.x, 2) + Math.pow(p.y - oldPos.y, 2));
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = idx;
        }
      });
      if (bestIndex >= 0) {
        newAssignments.set(bestIndex, { ...assignment, positionIndex: bestIndex });
        usedNewIndices.add(bestIndex);
      }
    });

    setAssignments(newAssignments);
    setPositionOverrides(new Map());
    setLineup((prev) => (prev ? { ...prev, formation_template: newFormation } : null));
    setFormationPickerVisible(false);
  };

  const switchFieldType = (selected: string) => {
    if (!lineup) return;
    const firstFormation = FORMATIONS[selected]?.[0] || '4-3-3';
    const guestsToBench = Array.from(assignments.values()).filter((a) => a.guestName);
    setAssignments(new Map());
    setPositionOverrides(new Map());
    if (guestsToBench.length > 0) setBenchPlayers((prev) => [...prev, ...guestsToBench.map((a) => ({ ...a, positionIndex: -1 }))]);
    setLineup((prev) => (prev ? { ...prev, field_type: selected, formation_template: firstFormation } : null));
    setFieldTypePickerVisible(false);
  };

  const showMenu = () => setMenuVisible(true);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Feather name="arrow-left" size={24} color="#fff" /></TouchableOpacity>
          <Text style={styles.headerTitle}>Lineup Editor</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loading}><ActivityIndicator size="large" color="#8b5cf6" /></View>
      </SafeAreaView>
    );
  }

  if (error || !lineup) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Feather name="arrow-left" size={24} color="#fff" /></TouchableOpacity>
          <Text style={styles.headerTitle}>Lineup Editor</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{error || 'Lineup not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const selectedCode = selectedPosition !== null ? basePositions[selectedPosition]?.code : '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow1}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Lineup Editor</Text>
          <TextInput style={styles.headerNameInput} value={name} onChangeText={setName} placeholder="vs Opponent" placeholderTextColor="#94a3b8" />
          <TouchableOpacity onPress={showMenu} style={styles.headerBtn}>
            <Feather name="more-vertical" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.headerRow2}>
          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statusPill, status === 'published' ? styles.statusPublished : styles.statusDraft]}
            onPress={() => setStatus((s) => (s === 'draft' ? 'published' : 'draft'))}
          >
            <Text style={[styles.statusPillText, status === 'published' ? styles.statusPublishedText : styles.statusDraftText]}>{status}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pill} onPress={() => setFormationPickerVisible(true)}>
            <Text style={styles.pillText}>{lineup.formation_template} ▾</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pill} onPress={() => setFieldTypePickerVisible(true)}>
            <Text style={styles.pillText}>{lineup.field_type} ▾</Text>
          </TouchableOpacity>
        </View>
      </View>

      {assigningFromBench !== null && (
        <View style={styles.assignBanner}>
          <Text style={styles.assignBannerText}>Tap a position on the field to assign</Text>
          <TouchableOpacity onPress={() => setAssigningFromBench(null)}><Text style={styles.assignBannerCancel}>Cancel</Text></TouchableOpacity>
        </View>
      )}

      <View style={styles.fieldWrapper}>
        <LineupFieldEditor
          fieldType={lineup.field_type}
          positions={positions}
          jerseyConfig={jerseyConfig}
          visualConfig={visualConfig}
          onPositionTap={handlePositionTap}
          onPositionDragEnd={(index, x, y) => setPositionOverrides((prev) => {
            const n = new Map(prev);
            n.set(index, { x, y });
            return n;
          })}
          selectedPositionIndex={selectedPosition}
        />
      </View>

      {pickerVisible && (
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => { setPickerVisible(false); setSelectedPosition(null); }} />
        </View>
      )}

      <View style={styles.benchStrip}>
        <Text style={styles.benchLabel}>BENCH ({benchTiles.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.benchScroll}>
          {benchTiles.length === 0 ? (
            <Text style={styles.benchEmpty}>All players assigned</Text>
          ) : (
            benchTiles.map((t, idx) => {
              const disp = t.type === 'roster' ? getPlayerDisplayName(t.player) : t.guestName;
              const initials = disp ? disp.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase() : '?';
              const num = t.type === 'roster' ? t.player.jersey_number : t.jerseyNumber;
              const teamColor = jerseyConfig.team_color || '#8b5cf6';
              return (
                <TouchableOpacity key={t.type === 'roster' ? t.player.id : `g-${idx}`} style={styles.benchTile} onPress={() => benchTileAction(idx)}>
                  <View style={styles.benchTileJersey}><MiniJerseyIcon color={teamColor} size={28} /></View>
                  <Text style={styles.benchTileNum}>{num ?? '?'}</Text>
                  <Text style={styles.benchTileInit}>{initials}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      <Modal visible={pickerVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>Select player for {selectedCode}</Text>
              <TouchableOpacity onPress={() => { setPickerVisible(false); setSelectedPosition(null); }}>
                <Feather name="x" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder="Search..."
              placeholderTextColor="#64748b"
            />
            {filteredPickerPlayers.length === 0 ? (
              <Text style={styles.emptyText}>
                {roster.length === 0 ? 'No players found for this team' : availablePlayers.length === 0 ? 'All players assigned' : 'No players match search'}
              </Text>
            ) : (
              <FlatList
                data={filteredPickerPlayers}
                keyExtractor={(p) => p.id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.playerRow} onPress={() => assignPlayer(item)}>
                    <View style={styles.playerNumBox}><Text style={styles.playerNum}>{item.jersey_number ?? '—'}</Text></View>
                    <Text style={styles.playerName}>{getPlayerDisplayName(item)}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={formationPickerVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, styles.formationPickerOverlay]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setFormationPickerVisible(false)} />
          <View style={styles.formationPickerContent}>
            <Text style={styles.modalTitle}>Select Formation</Text>
            <FlatList
              data={FORMATIONS[lineup.field_type] || []}
              keyExtractor={(f) => f}
              style={styles.formationPickerList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.formationPickerOption, lineup.formation_template === item && styles.formationPickerOptionActive]}
                  onPress={() => switchFormation(item)}
                >
                  <Text style={styles.formationPickerOptionText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={() => setFormationPickerVisible(false)}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={fieldTypePickerVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, styles.formationPickerOverlay]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setFieldTypePickerVisible(false)} />
          <View style={styles.formationPickerContent}>
            <Text style={styles.modalTitle}>Select Field Type</Text>
            {(['11v11', '9v9', '7v7', '5v5'] as const).map((ft) => (
              <TouchableOpacity
                key={ft}
                style={[styles.formationPickerOption, lineup.field_type === ft && styles.formationPickerOptionActive]}
                onPress={() => switchFieldType(ft)}
              >
                <Text style={styles.formationPickerOptionText}>{ft}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={() => setFieldTypePickerVisible(false)}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={jerseyModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Jersey Colors</Text>
            <Text style={styles.modalLabel}>Team</Text>
            <View style={styles.colorRow}>
              {JERSEY_COLORS.map((c) => (
                <TouchableOpacity key={c} style={[styles.colorCircle, { backgroundColor: c }, jerseyConfig.team_color === c && styles.colorCircleActive]} onPress={() => setJerseyConfig((j) => ({ ...j, team_color: c }))} />
              ))}
            </View>
            <Text style={styles.modalLabel}>GK</Text>
            <View style={styles.colorRow}>
              {JERSEY_COLORS.map((c) => (
                <TouchableOpacity key={c} style={[styles.colorCircle, { backgroundColor: c }, jerseyConfig.gk_color === c && styles.colorCircleActive]} onPress={() => setJerseyConfig((j) => ({ ...j, gk_color: c }))} />
              ))}
            </View>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setJerseyModalVisible(false)}><Text style={styles.modalBtnText}>Done</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={notesModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Coach Notes</Text>
            <TextInput style={styles.notesInput} value={notes} onChangeText={setNotes} placeholder="Notes..." placeholderTextColor="#64748b" multiline />
            <TouchableOpacity style={styles.modalBtn} onPress={() => setNotesModalVisible(false)}><Text style={styles.modalBtnText}>Done</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={eventModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Link to Event</Text>
            <TouchableOpacity style={styles.eventOption} onPress={() => { setEventId(null); setEventModalVisible(false); }}>
              <Text style={styles.eventOptionText}>None</Text>
            </TouchableOpacity>
            {events.map((e) => (
              <TouchableOpacity key={e.id} style={styles.eventOption} onPress={() => { setEventId(e.id); setEventModalVisible(false); }}>
                <Text style={styles.eventOptionText}>{e.title || new Date(e.event_date || '').toLocaleDateString()}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalBtn} onPress={() => setEventModalVisible(false)}><Text style={styles.modalBtnText}>Done</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={guestModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Guest Player</Text>
            <TextInput style={styles.input} value={guestName} onChangeText={setGuestName} placeholder="Name" placeholderTextColor="#64748b" />
            <TextInput style={styles.input} value={guestNumber} onChangeText={setGuestNumber} placeholder="Number" placeholderTextColor="#64748b" keyboardType="number-pad" />
            <TouchableOpacity style={styles.modalBtn} onPress={addGuestToBench}><Text style={styles.modalBtnText}>Add to Bench</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={() => setGuestModalVisible(false)}><Text style={styles.modalBtnText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={{ backgroundColor: '#1e293b', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 34 }}>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <View style={{ width: 40, height: 4, backgroundColor: '#475569', borderRadius: 2 }} />
            </View>
            {[
              { icon: 'sliders', label: 'Visual Settings', onPress: () => { setMenuVisible(false); setVisualSettingsVisible(true); } },
              { icon: 'droplet', label: 'Jersey Colors', onPress: () => { setMenuVisible(false); setJerseyModalVisible(true); } },
              { icon: 'user-plus', label: 'Add Guest Player', onPress: () => { setMenuVisible(false); setGuestModalVisible(true); } },
              { icon: 'file-text', label: 'Coach Notes', onPress: () => { setMenuVisible(false); setNotesModalVisible(true); } },
              { icon: 'link', label: 'Link to Event', onPress: () => { setMenuVisible(false); setEventModalVisible(true); } },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                style={{ flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#334155' }}
                onPress={item.onPress}
              >
                <Feather name={item.icon as any} size={20} color="#94a3b8" />
                <Text style={{ fontSize: 16, color: '#fff', marginLeft: 14, flex: 1 }}>{item.label}</Text>
                <Feather name="chevron-right" size={18} color="#475569" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 20 }}
              onPress={() => {
                setMenuVisible(false);
                Alert.alert('Delete Lineup', 'Are you sure?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      if (lineupId) await supabase.from('lineup_formations').delete().eq('id', lineupId);
                      navigation.goBack();
                    },
                  },
                ]);
              }}
            >
              <Feather name="trash-2" size={20} color="#ef4444" />
              <Text style={{ fontSize: 16, color: '#ef4444', marginLeft: 14, flex: 1 }}>Delete Lineup</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={visualSettingsVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.visualModalContent}>
            <View style={styles.visualModalHeader}>
              <Text style={styles.modalTitle}>Visual Settings</Text>
              <TouchableOpacity onPress={() => setVisualSettingsVisible(false)}><Feather name="x" size={24} color="#fff" /></TouchableOpacity>
            </View>

            <View style={styles.visualSliderSection}>
              <View style={styles.visualSliderLabelRow}>
                <Text style={styles.visualSliderLabel}>Jersey Size</Text>
                <Text style={styles.visualSliderValue}>{visualConfig.jerseySize}%</Text>
              </View>
              <Slider minimumValue={50} maximumValue={150} step={5} value={visualConfig.jerseySize} onValueChange={(v) => setVisualConfig((c) => ({ ...c, jerseySize: v }))} minimumTrackTintColor="#8b5cf6" maximumTrackTintColor="#334155" thumbTintColor="#fff" />
              <View style={styles.visualSliderCaps}>
                <Text style={styles.visualSliderCap}>Small</Text>
                <Text style={styles.visualSliderCap}>Large</Text>
              </View>
            </View>

            <View style={styles.visualSliderSection}>
              <View style={styles.visualSliderLabelRow}>
                <Text style={styles.visualSliderLabel}>Jersey Outline</Text>
                <Text style={styles.visualSliderValue}>{(visualConfig.jerseyOutline / 10).toFixed(1)}px</Text>
              </View>
              <Slider minimumValue={0} maximumValue={20} step={1} value={visualConfig.jerseyOutline} onValueChange={(v) => setVisualConfig((c) => ({ ...c, jerseyOutline: v }))} minimumTrackTintColor="#8b5cf6" maximumTrackTintColor="#334155" thumbTintColor="#fff" />
              <View style={styles.visualSliderCaps}>
                <Text style={styles.visualSliderCap}>None</Text>
                <Text style={styles.visualSliderCap}>Thick</Text>
              </View>
            </View>

            <View style={styles.visualSliderSection}>
              <View style={styles.visualSliderLabelRow}>
                <Text style={styles.visualSliderLabel}>Field Lines</Text>
                <Text style={styles.visualSliderValue}>{visualConfig.fieldLines}%</Text>
              </View>
              <Slider minimumValue={10} maximumValue={100} step={5} value={visualConfig.fieldLines} onValueChange={(v) => setVisualConfig((c) => ({ ...c, fieldLines: v }))} minimumTrackTintColor="#8b5cf6" maximumTrackTintColor="#334155" thumbTintColor="#fff" />
              <View style={styles.visualSliderCaps}>
                <Text style={styles.visualSliderCap}>Faint</Text>
                <Text style={styles.visualSliderCap}>Bold</Text>
              </View>
            </View>

            <View style={styles.visualSliderSection}>
              <View style={styles.visualSliderLabelRow}>
                <Text style={styles.visualSliderLabel}>Player Names</Text>
                <Text style={styles.visualSliderValue}>{visualConfig.nameSize === 0 ? 'Hidden' : `${visualConfig.nameSize}%`}</Text>
              </View>
              <Slider minimumValue={0} maximumValue={150} step={10} value={visualConfig.nameSize} onValueChange={(v) => setVisualConfig((c) => ({ ...c, nameSize: v }))} minimumTrackTintColor="#8b5cf6" maximumTrackTintColor="#334155" thumbTintColor="#fff" />
              <View style={styles.visualSliderCaps}>
                <Text style={styles.visualSliderCap}>Hidden</Text>
                <Text style={styles.visualSliderCap}>Large</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.visualResetBtn} onPress={() => setVisualConfig(DEFAULT_VISUAL_CONFIG)}>
              <Text style={styles.modalBtnText}>Reset to Defaults</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setVisualSettingsVisible(false)}>
              <Text style={styles.modalBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const BOTTOM_TAB_PADDING = 88;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingBottom: BOTTOM_TAB_PADDING },
  header: {
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  headerNameInput: { flex: 1, fontSize: 14, color: '#fff', paddingVertical: 4, paddingHorizontal: 0 },
  headerRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  pill: { backgroundColor: '#334155', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  pillText: { fontSize: 12, color: '#94a3b8' },
  saveBtn: { backgroundColor: '#8b5cf6', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  statusDraft: { backgroundColor: '#f59e0b20' },
  statusPublished: { backgroundColor: '#10b98120' },
  statusDraftText: { color: '#f59e0b', fontSize: 12, fontWeight: '600' },
  statusPublishedText: { color: '#10b981', fontSize: 12, fontWeight: '600' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#94a3b8' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  assignBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, backgroundColor: '#06b6d420', gap: 12 },
  assignBannerText: { color: '#06b6d4', fontSize: 14, fontWeight: '600' },
  assignBannerCancel: { color: '#06b6d4', fontSize: 14, textDecorationLine: 'underline' },
  fieldWrapper: { width: SCREEN_WIDTH },
  benchStrip: {
    minHeight: 100,
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  benchLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600', marginBottom: 8 },
  benchScroll: { paddingRight: 16 },
  benchEmpty: { color: '#64748b', fontSize: 14 },
  benchTile: {
    width: 56,
    height: 70,
    backgroundColor: '#334155',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#475569',
    marginRight: 10,
    alignItems: 'center',
    paddingTop: 6,
  },
  benchTileJersey: { marginBottom: 2 },
  benchTileNum: { fontSize: 14, fontWeight: '700', color: '#fff' },
  benchTileInit: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  bottomSheet: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
    paddingBottom: 24,
  },
  bottomSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  bottomSheetTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  searchInput: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#334155', borderRadius: 10, padding: 12, fontSize: 14, color: '#fff' },
  emptyText: { color: '#64748b', textAlign: 'center', padding: 24 },
  playerRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  playerNumBox: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#8b5cf620', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  playerNum: { fontSize: 14, fontWeight: '700', color: '#8b5cf6' },
  playerName: { flex: 1, fontSize: 15, color: '#fff' },
  posPill: { backgroundColor: '#334155', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  posPillText: { fontSize: 11, color: '#94a3b8' },
  formationPickerOverlay: { justifyContent: 'center', alignItems: 'stretch', paddingHorizontal: 20 },
  formationPickerContent: { backgroundColor: '#1e293b', borderRadius: 16, maxHeight: '60%', padding: 20 },
  formationPickerList: { maxHeight: 280 },
  formationPickerOption: { width: '100%', padding: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  formationPickerOptionActive: { backgroundColor: '#8b5cf640' },
  formationPickerOptionText: { fontSize: 15, color: '#fff' },
  modalContent: { backgroundColor: '#1e293b', margin: 20, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 16 },
  modalLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 8 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  colorCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  colorCircleActive: { borderColor: '#fff' },
  modalBtn: { backgroundColor: '#8b5cf6', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  modalBtnSecondary: { backgroundColor: '#334155' },
  modalBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  input: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 14, fontSize: 14, color: '#fff', marginBottom: 12 },
  notesInput: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 14, fontSize: 14, color: '#fff', minHeight: 100, textAlignVertical: 'top', marginBottom: 12 },
  eventOption: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  eventOptionText: { fontSize: 15, color: '#fff' },
  visualModalContent: { backgroundColor: '#1e293b', margin: 20, borderRadius: 16, padding: 20 },
  visualModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  visualSliderSection: { marginBottom: 20 },
  visualSliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  visualSliderLabel: { fontSize: 14, color: '#fff', fontWeight: '600' },
  visualSliderValue: { fontSize: 14, color: '#fff', fontWeight: '700' },
  visualSliderCaps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  visualSliderCap: { fontSize: 11, color: '#64748b' },
  visualResetBtn: { backgroundColor: '#334155', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8, marginBottom: 8 },
});

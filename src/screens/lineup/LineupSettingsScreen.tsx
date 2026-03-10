import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';

type SettingsAction =
  | 'visualSettings'
  | 'jerseyColors'
  | 'addGuest'
  | 'coachNotes'
  | 'linkEvent';

interface SettingsRow {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  action: SettingsAction | 'delete';
  danger?: boolean;
}

const SETTINGS_ROWS: SettingsRow[] = [
  { icon: 'sliders', label: 'Visual Settings', action: 'visualSettings' },
  { icon: 'droplet', label: 'Jersey Colors', action: 'jerseyColors' },
  { icon: 'user-plus', label: 'Add Guest Player', action: 'addGuest' },
  { icon: 'file-text', label: 'Coach Notes', action: 'coachNotes' },
  { icon: 'link', label: 'Link to Event', action: 'linkEvent' },
  { icon: 'trash-2', label: 'Delete Lineup', action: 'delete', danger: true },
];

export default function LineupSettingsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params as { lineupId?: string; teamId?: string }) || {};
  const { lineupId, teamId } = params;

  const handleRowPress = (row: SettingsRow) => {
    if (row.action === 'delete') {
      Alert.alert(
        'Delete Lineup',
        'Are you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              if (lineupId) {
                await supabase.from('lineup_formations').delete().eq('id', lineupId);
              }
              navigation.navigate('LineupList', { teamId: teamId || undefined });
            },
          },
        ]
      );
      return;
    }
    navigation.navigate('LineupEditor', { lineupId, teamId, action: row.action as SettingsAction });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.content}>
        {SETTINGS_ROWS.map((row) => (
          <TouchableOpacity
            key={row.action}
            style={styles.settingsRow}
            onPress={() => handleRowPress(row)}
            activeOpacity={0.7}
          >
            <View style={styles.settingsIcon}>
              <Feather name={row.icon} size={22} color={row.danger ? '#ef4444' : '#94a3b8'} />
            </View>
            <Text style={row.danger ? styles.settingsLabelDanger : styles.settingsLabel}>{row.label}</Text>
            <Feather name="chevron-right" size={20} color="#64748b" />
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  content: { flex: 1 },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  settingsIcon: { width: 32, alignItems: 'center' },
  settingsLabel: { fontSize: 16, color: '#fff', flex: 1, marginLeft: 14 },
  settingsLabelDanger: { fontSize: 16, color: '#ef4444', flex: 1, marginLeft: 14 },
});

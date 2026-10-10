/**
 * Who has read one message.
 *
 * This route was navigated to from the long-press action sheet for months and
 * never existed, so "View Read History" silently did nothing: React Navigation
 * treats a navigate to an unregistered route as a no-op.
 *
 * "Read" is defined by the same column the unread badges use:
 * comm_channel_members.last_read_at. A member has read this message when their
 * last_read_at is at or after the message's created_at. That is a per-channel
 * watermark, not a per-message receipt -- so it cannot distinguish "read this
 * one" from "read past this one", and the copy says "Read by" rather than
 * claiming a precise receipt.
 *
 * Names come from the SAME source the room uses (useChatSenderLabels ->
 * get_channel_member_names). No new RPC: a second name resolver would be a
 * second thing to disagree with the bubbles.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useChatSenderLabels } from '../hooks/useChatSenderLabels';
import { logError } from '../utils/logError';
import { formatDayDivider } from '../utils/chatDays';

interface MemberRow {
  user_id: string;
  last_read_at: string | null;
}

interface ReaderEntry {
  userId: string;
  name: string;
  /** null for the "Not yet" section. */
  readAt: string | null;
}

/** "3:42 pm" for today, "Tue, Oct 7 · 3:42 pm" for anything older. */
function formatReadAt(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const time = d
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .toLowerCase();
  const day = formatDayDivider(value);
  return day === 'Today' ? time : `${day} · ${time}`;
}

export default function MessageReadHistoryScreen({ route, navigation }: any) {
  const { channelId, messageId, messageCreatedAt, authorId } =
    route.params || {};

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { memberNames } = useChatSenderLabels(channelId ?? null);

  const fetchMembers = useCallback(async () => {
    if (!channelId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('comm_channel_members')
      .select('user_id, last_read_at')
      .eq('channel_id', channelId);

    if (error) {
      // Reported, not swallowed: an empty list and a failed read look
      // identical on screen otherwise.
      logError('MessageReadHistory.fetchMembers', error, { channelId, messageId });
      setMembers([]);
      setLoading(false);
      return;
    }
    setMembers((data || []) as MemberRow[]);
    setLoading(false);
  }, [channelId, messageId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const { readers, notYet } = useMemo(() => {
    const messageMs = messageCreatedAt
      ? new Date(messageCreatedAt).getTime()
      : NaN;

    const read: ReaderEntry[] = [];
    const unread: ReaderEntry[] = [];

    for (const m of members) {
      // The author is excluded from both lists -- they wrote it.
      if (!m.user_id || m.user_id === authorId) continue;

      const name = memberNames.get(m.user_id)?.name ?? 'Team member';
      const stampMs = m.last_read_at ? new Date(m.last_read_at).getTime() : NaN;

      // An unparseable or missing watermark counts as NOT read. Claiming
      // someone read a message on the strength of a bad timestamp is the one
      // error worth avoiding here.
      const hasRead =
        !Number.isNaN(messageMs) &&
        !Number.isNaN(stampMs) &&
        stampMs >= messageMs;

      if (hasRead) {
        read.push({ userId: m.user_id, name, readAt: m.last_read_at });
      } else {
        unread.push({ userId: m.user_id, name, readAt: null });
      }
    }

    // Newest first, as asked.
    read.sort(
      (a, b) =>
        new Date(b.readAt ?? 0).getTime() - new Date(a.readAt ?? 0).getTime()
    );
    unread.sort((a, b) => a.name.localeCompare(b.name));

    return { readers: read, notYet: unread };
  }, [members, memberNames, messageCreatedAt, authorId]);

  const sections = useMemo(
    () => [
      { key: 'read', title: `Read by ${readers.length}`, rows: readers },
      { key: 'unread', title: `Not yet (${notYet.length})`, rows: notYet },
    ],
    [readers, notYet]
  );

  // One flat list with inline section headers, so the whole thing scrolls as a
  // unit without pulling in SectionList's extra typing for two fixed groups.
  type Row =
    | { kind: 'header'; key: string; title: string; empty: boolean }
    | { kind: 'entry'; key: string; entry: ReaderEntry };

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const section of sections) {
      out.push({
        kind: 'header',
        key: `h:${section.key}`,
        title: section.title,
        empty: section.rows.length === 0,
      });
      for (const entry of section.rows) {
        out.push({ kind: 'entry', key: `${section.key}:${entry.userId}`, entry });
      }
    }
    return out;
  }, [sections]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Read history</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{item.title}</Text>
                  {item.empty ? (
                    <Text style={styles.sectionEmpty}>No one</Text>
                  ) : null}
                </View>
              );
            }
            const { entry } = item;
            return (
              <View style={styles.row}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {entry.name}
                </Text>
                {entry.readAt ? (
                  <Text style={styles.rowTime}>{formatReadAt(entry.readAt)}</Text>
                ) : null}
              </View>
            );
          }}
          ListFooterComponent={
            <Text style={styles.footnote}>
              Based on when each member last opened this conversation, so it can
              include messages read after this one.
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginLeft: 12,
  },
  headerSpacer: {
    width: 24,
  },
  listContent: {
    paddingBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionEmpty: {
    color: '#64748b',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  rowName: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
    marginRight: 12,
  },
  rowTime: {
    color: '#94a3b8',
    fontSize: 13,
  },
  footnote: {
    color: '#64748b',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 20,
    lineHeight: 17,
  },
});

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../lib/supabase';
import { fetchClubTeams } from '../hooks/usePendingStaffRequests';

const DECIDED_LIMIT = 10;

interface JoinRequest {
  id: string;
  team_id: string;
  user_id: string | null;
  applicant_name: string | null;
  applicant_email: string | null;
  applicant_phone: string | null;
  requested_role: string | null;
  status: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  team_manager: 'Team Manager',
};

const formatRole = (role: string | null) =>
  (role && ROLE_LABELS[role]) || role || 'Staff';

const getInitials = (name: string | null) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

const relativeTime = (dateStr: string | null) => {
  if (!dateStr) return '';
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '';
  }
};

// The RPCs answer json, which arrives as an object or as a raw string depending on
// how it is serialized. Tolerate both; anything unparseable stays {}.
const parseRpcJson = (raw: any): Record<string, any> => {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) ?? {};
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === 'object') return raw as Record<string, any>;
  return {};
};

export default function StaffRequestsScreen({ route, navigation }: any) {
  const teamId: string | undefined =
    route.params?.teamId ?? route.params?.team_id ?? undefined;
  const clubId: string | undefined = route.params?.clubId ?? undefined;
  // Coaches arrive scoped to one team; club admins arrive scoped to every team they own.
  const isClubMode = !teamId && !!clubId;

  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!teamId && !clubId) {
      setLoadError('No team or club was provided.');
      setLoading(false);
      return;
    }

    try {
      setLoadError(null);

      // Resolve the team scope and the id -> name map in one pass.
      let scopedTeamIds: string[];
      const nameMap: Record<string, string> = {};

      if (isClubMode) {
        const clubTeams = await fetchClubTeams(clubId as string);
        scopedTeamIds = clubTeams.map((t) => t.id);
        clubTeams.forEach((t) => {
          nameMap[t.id] = t.name;
        });
      } else {
        scopedTeamIds = [teamId as string];
        const { data: teamData } = await supabase
          .from('teams')
          .select('id, name')
          .eq('id', teamId as string)
          .maybeSingle();
        if (teamData) nameMap[(teamData as any).id] = (teamData as any).name;
      }

      setTeamNames(nameMap);

      if (!scopedTeamIds.length) {
        setRequests([]);
        return;
      }

      const { data, error } = await supabase
        .from('team_join_requests')
        .select('*')
        .in('team_id', scopedTeamIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data as JoinRequest[]) || [];
      setRequests(rows);

      // One batched lookup for every reviewer shown in "Recently decided".
      const reviewerIds = Array.from(
        new Set(
          rows
            .filter((r) => r.status !== 'pending' && r.reviewed_by)
            .map((r) => r.reviewed_by as string)
        )
      );

      if (reviewerIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, first_name, last_name')
          .in('id', reviewerIds);

        const resolved: Record<string, string> = {};
        (profiles || []).forEach((p: any) => {
          resolved[p.id] =
            p.full_name ||
            `${p.first_name || ''} ${p.last_name || ''}`.trim() ||
            'a reviewer';
        });
        setReviewerNames(resolved);
      } else {
        setReviewerNames({});
      }
    } catch (err: any) {
      console.error('Error fetching staff requests:', err);
      setLoadError(err?.message || 'Failed to load staff requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, clubId, isClubMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const teamNameFor = (id: string) => teamNames[id] || 'this team';

  const runApprove = async (req: JoinRequest) => {
    setActingId(req.id);
    try {
      const { data, error } = await supabase.rpc('approve_staff_join_request', {
        p_request_id: req.id,
      });

      if (error) throw error;

      // The server re-verifies authority, so a clean transport call can still be a
      // business-level refusal. Surface its reason rather than a generic failure.
      const parsed = parseRpcJson(data);
      if (parsed.success === false) {
        Alert.alert('Could not approve', parsed.error || 'The server declined this approval.');
        return;
      }

      // invoke() reports a failed function as a returned error, not a throw, so the
      // catch alone would let a silently undelivered welcome email look like success.
      let emailFailed = false;
      try {
        const { error: emailError } = await supabase.functions.invoke('send-email', {
          body: {
            to: req.applicant_email,
            template: 'staff-welcome',
            data: {
              staffName: req.applicant_name,
              teamName: teamNameFor(req.team_id),
              role: formatRole(req.requested_role),
            },
          },
        });
        if (emailError) {
          emailFailed = true;
          if (__DEV__) console.log('[StaffRequests] Welcome email error:', emailError);
        }
      } catch (emailErr) {
        emailFailed = true;
        if (__DEV__) console.log('[StaffRequests] Welcome email warning:', emailErr);
      }

      const approvedMessage = `${req.applicant_name || 'They'} joined ${teamNameFor(
        req.team_id
      )} as ${formatRole(req.requested_role)}.`;
      Alert.alert(
        'Approved',
        emailFailed
          ? `${approvedMessage} We could not send the welcome email — let them know directly.`
          : approvedMessage
      );
      await fetchData();
    } catch (err: any) {
      console.error('Approve staff request error:', err);
      Alert.alert('Could not approve', err?.message || 'Please try again.');
    } finally {
      setActingId(null);
    }
  };

  const runReject = async (req: JoinRequest, reason: string | null) => {
    setActingId(req.id);
    try {
      const { data, error } = await supabase.rpc('reject_staff_join_request', {
        p_request_id: req.id,
        p_reason: reason,
      });

      if (error) throw error;

      const parsed = parseRpcJson(data);
      if (parsed.success === false) {
        Alert.alert('Could not reject', parsed.error || 'The server declined this rejection.');
        return;
      }

      await fetchData();
    } catch (err: any) {
      console.error('Reject staff request error:', err);
      Alert.alert('Could not reject', err?.message || 'Please try again.');
    } finally {
      setActingId(null);
    }
  };

  const handleApprove = (req: JoinRequest) => {
    Alert.alert(
      'Approve request',
      `Add ${req.applicant_name || 'this person'} to ${teamNameFor(
        req.team_id
      )} as ${formatRole(req.requested_role)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => runApprove(req) },
      ]
    );
  };

  const handleReject = (req: JoinRequest) => {
    const who = req.applicant_name || 'this person';

    // Alert.prompt is iOS-only; elsewhere fall back to a plain confirm with no reason.
    if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
      Alert.prompt(
        'Reject request',
        `Reject ${who}? You can add an optional reason.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: (reason?: string) => runReject(req, reason?.trim() || null),
          },
        ],
        'plain-text'
      );
      return;
    }

    Alert.alert('Reject request', `Reject ${who}'s request to join?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => runReject(req, null) },
    ]);
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending').slice(0, DECIDED_LIMIT);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading requests...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Staff Requests
        </Text>
        <View style={styles.headerRight} />
      </View>

      <Text style={styles.countLine}>
        {pending.length} {pending.length === 1 ? 'request' : 'requests'} awaiting review
      </Text>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8b5cf6" />
        }
      >
        {loadError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{loadError}</Text>
          </View>
        )}

        {pending.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No pending requests</Text>
            <Text style={styles.emptyText}>
              Staff who use your team's join link will show up here for approval
            </Text>
          </View>
        ) : (
          pending.map((req) => {
            // Head coach appointments are a club-admin decision, so a coach can see the
            // request but cannot act on it.
            const needsClubAdmin = !isClubMode && req.requested_role === 'head_coach';
            const isActing = actingId === req.id;

            return (
              <View key={req.id} style={styles.requestCard}>
                <View style={styles.requestTop}>
                  <View style={styles.initialsCircle}>
                    <Text style={styles.initialsText}>{getInitials(req.applicant_name)}</Text>
                  </View>
                  <View style={styles.requestInfo}>
                    <Text style={styles.applicantName}>
                      {req.applicant_name || 'Unnamed applicant'}
                    </Text>
                    <Text style={styles.requestMeta}>
                      {formatRole(req.requested_role)} · {teamNameFor(req.team_id)} ·{' '}
                      {relativeTime(req.created_at)}
                    </Text>
                    {req.applicant_email && (
                      <Text style={styles.contactLine}>{req.applicant_email}</Text>
                    )}
                    {req.applicant_phone && (
                      <Text style={styles.contactLine}>{req.applicant_phone}</Text>
                    )}
                  </View>
                </View>

                {needsClubAdmin ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteText}>Head coach requests need a club admin</Text>
                  </View>
                ) : (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.rejectButton, isActing && styles.buttonDisabled]}
                      onPress={() => handleReject(req)}
                      disabled={isActing}
                    >
                      <Text style={styles.rejectButtonText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.approveButton, isActing && styles.buttonDisabled]}
                      onPress={() => handleApprove(req)}
                      disabled={isActing}
                    >
                      {isActing ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.approveButtonText}>Approve</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}

        {decided.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recently decided</Text>
            {decided.map((req) => {
              const approved = req.status === 'approved';
              const reviewer = req.reviewed_by ? reviewerNames[req.reviewed_by] : null;
              return (
                <View key={req.id} style={styles.decidedCard}>
                  <View style={styles.decidedInfo}>
                    <Text style={styles.decidedName}>
                      {req.applicant_name || 'Unnamed applicant'}
                    </Text>
                    <Text style={styles.decidedMeta}>
                      {formatRole(req.requested_role)} · {teamNameFor(req.team_id)}
                    </Text>
                    <Text style={styles.decidedMeta}>
                      {reviewer ? `by ${reviewer} · ` : ''}
                      {relativeTime(req.reviewed_at || req.created_at)}
                    </Text>
                    {!approved && req.reject_reason && (
                      <Text style={styles.reasonText}>“{req.reject_reason}”</Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      approved ? styles.statusApproved : styles.statusRejected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        approved ? styles.statusTextApproved : styles.statusTextRejected,
                      ]}
                    >
                      {approved ? 'Approved' : 'Rejected'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    // Clears the iOS status bar so the back arrow is tappable (same value as InviteCoParentModal).
    paddingTop: 56,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  countLine: {
    fontSize: 14,
    color: '#9CA3AF',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorBannerText: {
    color: '#f87171',
    fontSize: 13,
  },
  requestCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    marginBottom: 10,
    padding: 14,
  },
  requestTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  initialsCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3a3a6e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  initialsText: {
    color: '#a78bfa',
    fontSize: 18,
    fontWeight: '700',
  },
  requestInfo: {
    flex: 1,
    minWidth: 0,
  },
  applicantName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  requestMeta: {
    color: '#a78bfa',
    fontSize: 13,
    marginBottom: 4,
  },
  contactLine: {
    color: '#888',
    fontSize: 13,
  },
  noteBox: {
    marginTop: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  noteText: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  rejectButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonText: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '600',
  },
  approveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 10,
  },
  decidedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#232342',
    borderRadius: 12,
    marginBottom: 8,
    padding: 12,
  },
  decidedInfo: {
    flex: 1,
    minWidth: 0,
  },
  decidedName: {
    color: '#D1D5DB',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  decidedMeta: {
    color: '#888',
    fontSize: 12,
  },
  reasonText: {
    color: '#888',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 10,
  },
  statusApproved: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  statusRejected: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusTextApproved: {
    color: '#22c55e',
  },
  statusTextRejected: {
    color: '#f87171',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});

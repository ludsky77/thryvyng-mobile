import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { GROUP_LETTERS, TEAMS, teamByCode, type WcTeam } from '../constants/wcTeams';

const formatMountainDateTime = (iso?: string | null): string => {
  if (!iso) return 'TBD';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'TBD';
    const datePart = d.toLocaleDateString('en-US', {
      timeZone: 'America/Denver',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const timePart = d.toLocaleTimeString('en-US', {
      timeZone: 'America/Denver',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${datePart} · ${timePart} MT`;
  } catch {
    return 'TBD';
  }
};

type TabKey = 'groups' | 'knockouts' | 'leaderboard' | 'me';
type KoStage = 'R32' | 'R16' | 'QF' | 'SF' | 'Final';

interface WcMatch {
  id: string;
  stage: string;
  match_number: number;
  group?: string | null;
  home_team_code?: string | null;
  away_team_code?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  status?: string | null;
  match_date?: string | null;
  kickoff_time?: string | null;
  scheduled_at?: string | null;
  predictions_lock_at?: string | null;
}

interface WcGroupPrediction {
  id: string;
  user_id: string;
  match_id: string;
  home_score?: number | null;
  away_score?: number | null;
  is_submitted?: boolean | null;
  submitted?: boolean | null;
  points_earned?: number | null;
  pts_earned?: number | null;
}

interface WcKoPick {
  id: string;
  user_id: string;
  match_id: string;
  picked_team_code: string;
  submitted?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface WcReset {
  id: string;
  user_id: string;
  scope?: string | null;
  scope_detail?: string | null;
  penalty_pts?: number | null;
  created_at: string;
}

interface WcPlayerScore {
  user_id: string;
  club_id: string;
  total_pts: number;
  ko_picks_submitted?: number | null;
  reset_pts?: number | null;
}

interface ProfileRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}

interface UserRoleRow {
  user_id: string;
  role: string;
}

interface ClubRow {
  id: string;
  name: string;
}

interface StandingRow {
  code: string;
  pts: number;
  gd: number;
  gf: number;
  ga: number;
  w: number;
  d: number;
  l: number;
}

const KO_STAGES: KoStage[] = ['R32', 'R16', 'QF', 'SF', 'Final'];
const TOTAL_KO_MATCHES = 31;
const TOTAL_GROUP_MATCHES = 72;
const TOTAL_SUBMITTED_PICKS = TOTAL_GROUP_MATCHES + TOTAL_KO_MATCHES;
const SCORE_MIN = 0;
const SCORE_MAX = 20;

type GroupMatchUiState = 'completed' | 'locked' | 'open';

const BRACKET_FEEDERS: Record<KoStage, number[][] | null> = {
  R32: null,
  R16: [
    [1, 2], [3, 4], [5, 6], [7, 8],
    [9, 10], [11, 12], [13, 14], [15, 16],
  ],
  QF: [[1, 2], [3, 4], [5, 6], [7, 8]],
  SF: [[1, 2], [3, 4]],
  Final: [[1, 2]],
};

const PARENT_STAGE: Record<KoStage, KoStage | null> = {
  R32: null,
  R16: 'R32',
  QF: 'R16',
  SF: 'QF',
  Final: 'SF',
};

const ROLE_LABELS: Record<string, string> = {
  parent: 'Parent',
  player: 'Player',
  head_coach: 'Head Coach',
  assistant_coach: 'Asst. Coach',
  team_manager: 'Team Manager',
  club_admin: 'Club Admin',
  platform_admin: 'Admin',
};

function displayName(profile?: ProfileRow | null): string {
  if (!profile) return 'Unknown';
  if (profile.full_name?.trim()) return profile.full_name.trim();
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatMatchDate(match: WcMatch): string {
  if (!match.match_date) return 'TBD';
  const d = new Date(`${match.match_date}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function clampScore(value: number): number {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, value));
}

function matchesForGroup(allMatches: WcMatch[], letter: string): WcMatch[] {
  return allMatches
    .filter((m) => {
      if (m.group?.toUpperCase() === letter) return true;
      const home = teamByCode(m.home_team_code ?? '');
      const away = teamByCode(m.away_team_code ?? '');
      return home?.group === letter && away?.group === letter;
    })
    .sort((a, b) => a.match_number - b.match_number);
}

function getMatchUiState(match: WcMatch): GroupMatchUiState {
  if (match.status === 'completed') return 'completed';
  const lockAt = match.predictions_lock_at
    ? new Date(match.predictions_lock_at).getTime()
    : null;
  if (lockAt !== null && lockAt <= Date.now()) return 'locked';
  if (match.status === 'scheduled') return 'open';
  return 'locked';
}

function isPredictionSubmitted(pred?: WcGroupPrediction | null): boolean {
  return !!(pred?.is_submitted || pred?.submitted);
}

function predictionPoints(pred?: WcGroupPrediction | null): number {
  return pred?.points_earned ?? pred?.pts_earned ?? 0;
}

function hasPredictionScores(pred?: WcGroupPrediction | null): boolean {
  return pred?.home_score != null && pred?.away_score != null;
}

function computeStandings(groupMatches: WcMatch[], groupLetter: string): StandingRow[] {
  const teams = TEAMS.filter((t) => t.group === groupLetter);
  const stats: Record<string, StandingRow> = {};
  teams.forEach((t) => {
    stats[t.code] = { code: t.code, pts: 0, gd: 0, gf: 0, ga: 0, w: 0, d: 0, l: 0 };
  });

  groupMatches
    .filter(
      (m) =>
        m.status === 'completed' &&
        m.home_score != null &&
        m.away_score != null &&
        m.home_team_code &&
        m.away_team_code
    )
    .forEach((m) => {
      const home = stats[m.home_team_code!];
      const away = stats[m.away_team_code!];
      if (!home || !away) return;
      const hs = m.home_score!;
      const as = m.away_score!;
      home.gf += hs;
      home.ga += as;
      away.gf += as;
      away.ga += hs;
      if (hs > as) {
        home.w += 1;
        home.pts += 3;
        away.l += 1;
      } else if (hs < as) {
        away.w += 1;
        away.pts += 3;
        home.l += 1;
      } else {
        home.d += 1;
        away.d += 1;
        home.pts += 1;
        away.pts += 1;
      }
    });

  return Object.values(stats)
    .map((s) => ({ ...s, gd: s.gf - s.ga }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

function TeamFlag({
  team,
  size = 26,
  showCode = false,
}: {
  team?: WcTeam | null;
  size?: number;
  showCode?: boolean;
}) {
  if (!team) {
    return <Text style={{ fontSize: size, opacity: 0.4 }}>—</Text>;
  }
  return (
    <View style={styles.teamFlagWrap}>
      <Text style={{ fontSize: size }}>{team.flag}</Text>
      {showCode && <Text style={styles.teamCodeHint}>{team.code}</Text>}
    </View>
  );
}

export default function WorldCupPredictorScreen({ navigation }: { navigation: any }) {
  const { user, profile, currentRole } = useAuth();
  const userId = user?.id ?? '';

  const [activeTab, setActiveTab] = useState<TabKey>('knockouts');
  const [koStage, setKoStage] = useState<KoStage>('R32');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mutating, setMutating] = useState(false);

  const [groupMatches, setGroupMatches] = useState<WcMatch[]>([]);
  const [koMatches, setKoMatches] = useState<WcMatch[]>([]);
  const [koPicks, setKoPicks] = useState<WcKoPick[]>([]);
  const [localPicks, setLocalPicks] = useState<Record<string, string>>({});
  const [totalPts, setTotalPts] = useState(100);
  const [playerScore, setPlayerScore] = useState<{
    total_pts?: number;
    ko_picks_submitted?: number | null;
  } | null>(null);

  const [groupPredictions, setGroupPredictions] = useState<WcGroupPrediction[]>([]);
  const [localGroupScores, setLocalGroupScores] = useState<
    Record<string, { home: number | null; away: number | null }>
  >({});
  const [autoSavedMatchId, setAutoSavedMatchId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [clubIds, setClubIds] = useState<string[]>([]);
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [leaderboardScores, setLeaderboardScores] = useState<WcPlayerScore[]>([]);
  const [leaderboardProfiles, setLeaderboardProfiles] = useState<Record<string, ProfileRow>>({});
  const [leaderboardRoles, setLeaderboardRoles] = useState<Record<string, UserRoleRow[]>>({});

  const [resets, setResets] = useState<WcReset[]>([]);
  const [resetHistoryExpanded, setResetHistoryExpanded] = useState(false);

  const mergedPicks = useMemo(() => {
    const map: Record<string, WcKoPick> = {};
    koPicks.forEach((p) => {
      map[p.match_id] = p;
    });
    Object.entries(localPicks).forEach(([matchId, code]) => {
      const existing = map[matchId];
      map[matchId] = {
        ...(existing ?? {
          id: `local-${matchId}`,
          user_id: userId,
          match_id: matchId,
        }),
        picked_team_code: code,
        submitted: existing?.submitted ?? false,
      };
    });
    return map;
  }, [koPicks, localPicks, userId]);

  const groupPredictionsByMatchId = useMemo(() => {
    const map = new Map<string, WcGroupPrediction>();
    groupPredictions.forEach((p) => map.set(p.match_id, p));
    return map;
  }, [groupPredictions]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  const syncGroupScoresFromPredictions = useCallback((preds: WcGroupPrediction[]) => {
    const scoreMap: Record<string, { home: number | null; away: number | null }> = {};
    preds.forEach((p) => {
      if (p.home_score != null && p.away_score != null) {
        scoreMap[p.match_id] = { home: p.home_score, away: p.away_score };
      }
    });
    setLocalGroupScores(scoreMap);
  }, []);

  const applyPlayerScore = useCallback((row?: { total_pts?: number; ko_picks_submitted?: number | null } | null) => {
    setPlayerScore(row ?? null);
    setTotalPts(row?.total_pts ?? 100);
  }, []);

  const fetchGroupData = useCallback(async () => {
    if (!userId) return;
    const [matchesRes, predsRes, scoresRes] = await Promise.all([
      (supabase as any)
        .from('wc_matches')
        .select('*')
        .eq('stage', 'group')
        .order('match_number'),
      (supabase as any)
        .from('wc_group_predictions')
        .select('*')
        .eq('user_id', userId),
      (supabase as any)
        .from('wc_player_scores')
        .select('total_pts, ko_picks_submitted')
        .eq('user_id', userId)
        .order('total_pts', { ascending: false })
        .limit(1),
    ]);
    if (matchesRes.error) throw new Error(matchesRes.error.message);
    if (predsRes.error) throw new Error(predsRes.error.message);
    setGroupMatches((matchesRes.data as WcMatch[]) || []);
    const preds = (predsRes.data as WcGroupPrediction[]) || [];
    setGroupPredictions(preds);
    syncGroupScoresFromPredictions(preds);
    applyPlayerScore(scoresRes.data?.[0] ?? null);
  }, [userId, syncGroupScoresFromPredictions, applyPlayerScore]);

  const fetchKnockoutData = useCallback(async () => {
    if (!userId) return;
    const [matchesRes, picksRes, scoresRes] = await Promise.all([
      (supabase as any)
        .from('wc_matches')
        .select('*')
        .neq('stage', 'group')
        .order('stage')
        .order('match_number'),
      (supabase as any).from('wc_ko_picks').select('*').eq('user_id', userId),
      (supabase as any)
        .from('wc_player_scores')
        .select('total_pts, ko_picks_submitted')
        .eq('user_id', userId)
        .order('total_pts', { ascending: false })
        .limit(1),
    ]);
    if (matchesRes.error) throw new Error(matchesRes.error.message);
    if (picksRes.error) throw new Error(picksRes.error.message);
    setKoMatches((matchesRes.data as WcMatch[]) || []);
    const picks = (picksRes.data as WcKoPick[]) || [];
    setKoPicks(picks);
    const pickMap: Record<string, string> = {};
    picks.forEach((p) => {
      pickMap[p.match_id] = p.picked_team_code;
    });
    setLocalPicks(pickMap);
    applyPlayerScore(scoresRes.data?.[0] ?? null);
  }, [userId, applyPlayerScore]);

  const fetchLeaderboardData = useCallback(async () => {
    if (!userId) return;
    const { data: clubsData, error: clubsError } = await (supabase as any).rpc(
      'get_user_wc_clubs',
      { p_user_id: userId }
    );
    if (clubsError) throw new Error(clubsError.message);

    let ids: string[] = [];
    if (Array.isArray(clubsData)) {
      ids = clubsData.map((c: any) => (typeof c === 'string' ? c : c.club_id ?? c.id)).filter(Boolean);
    }
    setClubIds(ids);

    if (ids.length === 0) {
      setClubs([]);
      setLeaderboardScores([]);
      setLeaderboardProfiles({});
      setLeaderboardRoles({});
      return;
    }

    const { data: clubRows } = await supabase.from('clubs').select('id, name').in('id', ids);
    const clubList = (clubRows as ClubRow[]) || [];
    setClubs(clubList);

    const activeClubId = selectedClubId && ids.includes(selectedClubId) ? selectedClubId : ids[0];
    setSelectedClubId(activeClubId);

    const { data: scores, error: scoresError } = await (supabase as any)
      .from('wc_player_scores')
      .select('user_id, club_id, total_pts, ko_picks_submitted')
      .eq('club_id', activeClubId)
      .order('total_pts', { ascending: false })
      .limit(50);
    if (scoresError) throw new Error(scoresError.message);
    const scoreRows = (scores as WcPlayerScore[]) || [];
    setLeaderboardScores(scoreRows);

    const userIds = scoreRows.map((s) => s.user_id);
    if (userIds.length === 0) {
      setLeaderboardProfiles({});
      setLeaderboardRoles({});
      return;
    }

    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, full_name, avatar_url')
        .in('id', userIds),
      supabase.from('user_roles').select('user_id, role').in('user_id', userIds),
    ]);

    const profileMap: Record<string, ProfileRow> = {};
    ((profiles as ProfileRow[]) || []).forEach((p) => {
      profileMap[p.id] = p;
    });
    setLeaderboardProfiles(profileMap);

    const roleMap: Record<string, UserRoleRow[]> = {};
    ((roles as UserRoleRow[]) || []).forEach((r) => {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r);
    });
    setLeaderboardRoles(roleMap);
  }, [userId, selectedClubId]);

  const fetchMeData = useCallback(async () => {
    if (!userId) return;
    const [{ data: picks }, { data: resetRows }, { data: scores }, { data: matches }, { data: groupPreds }] =
      await Promise.all([
      (supabase as any).from('wc_ko_picks').select('*').eq('user_id', userId),
      (supabase as any)
        .from('wc_resets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      (supabase as any)
        .from('wc_player_scores')
        .select('total_pts, ko_picks_submitted')
        .eq('user_id', userId)
        .order('total_pts', { ascending: false })
        .limit(1),
      (supabase as any)
        .from('wc_matches')
        .select('*')
        .neq('stage', 'group')
        .order('stage')
        .order('match_number'),
      (supabase as any).from('wc_group_predictions').select('*').eq('user_id', userId),
    ]);
    if (matches) setKoMatches((matches as WcMatch[]) || []);
    if (picks) {
      setKoPicks(picks as WcKoPick[]);
      const pickMap: Record<string, string> = {};
      (picks as WcKoPick[]).forEach((p) => {
        pickMap[p.match_id] = p.picked_team_code;
      });
      setLocalPicks(pickMap);
    }
    if (groupPreds) {
      setGroupPredictions(groupPreds as WcGroupPrediction[]);
      syncGroupScoresFromPredictions(groupPreds as WcGroupPrediction[]);
    }
    setResets((resetRows as WcReset[]) || []);
    applyPlayerScore(scores?.[0] ?? null);
  }, [userId, syncGroupScoresFromPredictions, applyPlayerScore]);

  const loadActiveTab = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    if (activeTab === 'groups') await fetchGroupData();
    else if (activeTab === 'knockouts') await fetchKnockoutData();
    else if (activeTab === 'leaderboard') await fetchLeaderboardData();
    else await fetchMeData();
  }, [activeTab, userId, fetchGroupData, fetchKnockoutData, fetchLeaderboardData, fetchMeData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadActiveTab();
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadActiveTab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadActiveTab();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }, [loadActiveTab]);

  const getPickForStageMatch = useCallback(
    (stage: KoStage, matchNumber: number): string | null => {
      const match = koMatches.find((m) => m.stage === stage && m.match_number === matchNumber);
      if (!match) return null;
      return mergedPicks[match.id]?.picked_team_code ?? null;
    },
    [koMatches, mergedPicks]
  );

  const getCandidates = useCallback(
    (match: WcMatch): { home: string | null; away: string | null; blocked: boolean; message?: string } => {
      const stage = match.stage as KoStage;
      if (stage === 'R32') {
        return {
          home: match.home_team_code ?? null,
          away: match.away_team_code ?? null,
          blocked: !match.home_team_code || !match.away_team_code,
          message: 'Teams will be set after the group stage',
        };
      }

      const parent = PARENT_STAGE[stage];
      const feeders = BRACKET_FEEDERS[stage];
      if (!parent || !feeders) {
        return { home: null, away: null, blocked: true, message: 'Bracket unavailable' };
      }

      const pair = feeders[match.match_number - 1];
      if (!pair) {
        return { home: null, away: null, blocked: true, message: 'Match not configured' };
      }

      const home = getPickForStageMatch(parent, pair[0]);
      const away = getPickForStageMatch(parent, pair[1]);
      if (!home || !away) {
        return {
          home,
          away,
          blocked: true,
          message: `Pick ${parent} first`,
        };
      }
      return { home, away, blocked: false };
    },
    [getPickForStageMatch]
  );

  const stageMatches = useMemo(
    () => koMatches.filter((m) => m.stage === koStage).sort((a, b) => a.match_number - b.match_number),
    [koMatches, koStage]
  );

  const getStageIndicator = (stage: KoStage): 'empty' | 'draft' | 'submitted' => {
    const matches = koMatches.filter((m) => m.stage === stage);
    if (matches.length === 0) return 'empty';
    const picksForStage = matches.map((m) => mergedPicks[m.id]).filter(Boolean);
    if (picksForStage.length === 0) return 'empty';
    const allSubmitted = matches.every((m) => mergedPicks[m.id]?.submitted);
    if (allSubmitted) return 'submitted';
    return 'draft';
  };

  const stageAllPicked = stageMatches.every((m) => !!mergedPicks[m.id]?.picked_team_code);
  const stageAllSubmitted = stageMatches.every((m) => mergedPicks[m.id]?.submitted);

  const handleSelectWinner = (match: WcMatch, teamCode: string) => {
    const existing = mergedPicks[match.id];
    if (existing?.submitted) return;
    setLocalPicks((prev) => ({ ...prev, [match.id]: teamCode }));
  };

  const handleSaveStage = async (submit: boolean) => {
    if (!userId || mutating) return;
    if (submit && !stageAllPicked) return;

    setMutating(true);
    try {
      for (const match of stageMatches) {
        const code = mergedPicks[match.id]?.picked_team_code ?? localPicks[match.id];
        if (!code) continue;
        const { error } = await (supabase as any).rpc('upsert_ko_pick', {
          p_match_id: match.id,
          p_picked_team_code: code,
          p_submit: submit,
        });
        if (error) {
          Alert.alert('Error', error.message);
          return;
        }
      }
      await fetchKnockoutData();
      if (activeTab === 'me') await fetchMeData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save picks');
    } finally {
      setMutating(false);
    }
  };

  const handleResetRound = () => {
    Alert.alert(
      'Reset Round',
      `Reset all ${koStage} picks? This costs 2 points.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setMutating(true);
            try {
              const { error } = await (supabase as any).rpc('reset_ko_round', { p_stage: koStage });
              if (error) {
                Alert.alert('Error', error.message);
                return;
              }
              await fetchKnockoutData();
              if (activeTab === 'me') await fetchMeData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to reset round');
            } finally {
              setMutating(false);
            }
          },
        },
      ]
    );
  };

  const handleResetAll = () => {
    Alert.alert(
      'Reset Everything',
      'Clear all knockout picks? This costs 5 points.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset All',
          style: 'destructive',
          onPress: async () => {
            setMutating(true);
            try {
              const { error } = await (supabase as any).rpc('reset_all_picks');
              if (error) {
                Alert.alert('Error', error.message);
                return;
              }
              await fetchKnockoutData();
              await fetchMeData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to reset');
            } finally {
              setMutating(false);
            }
          },
        },
      ]
    );
  };

  const getScoresForMatch = useCallback(
    (matchId: string) => {
      const pred = groupPredictionsByMatchId.get(matchId);
      const local = localGroupScores[matchId];
      return {
        home: local?.home ?? pred?.home_score ?? null,
        away: local?.away ?? pred?.away_score ?? null,
        submitted: isPredictionSubmitted(pred),
        pred,
      };
    },
    [groupPredictionsByMatchId, localGroupScores]
  );

  const refreshGroupPredictions = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('wc_group_predictions')
      .select('*')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    const preds = (data as WcGroupPrediction[]) || [];
    setGroupPredictions(preds);
    syncGroupScoresFromPredictions(preds);
    return preds;
  }, [userId, syncGroupScoresFromPredictions]);

  const upsertGroupPrediction = async (
    matchId: string,
    homeScore: number,
    awayScore: number,
    submit: boolean
  ) => {
    const { error } = await (supabase as any).rpc('upsert_group_prediction', {
      p_match_id: matchId,
      p_home_score: homeScore,
      p_away_score: awayScore,
      p_submit: submit,
    });
    if (error) throw new Error(error.message);
  };

  const handleGroupStepper = async (
    match: WcMatch,
    side: 'home' | 'away',
    delta: number
  ) => {
    if (mutating || getMatchUiState(match) !== 'open') return;
    const current = getScoresForMatch(match.id);
    if (current.submitted) return;

    let home = current.home;
    let away = current.away;

    if (side === 'home') {
      if (home == null && delta > 0) home = 0;
      else if (home != null) home = clampScore(home + delta);
    } else {
      if (away == null && delta > 0) away = 0;
      else if (away != null) away = clampScore(away + delta);
    }

    setLocalGroupScores((prev) => ({
      ...prev,
      [match.id]: { home, away },
    }));

    if (home == null || away == null) return;

    setMutating(true);
    try {
      await upsertGroupPrediction(match.id, home, away, false);
      await refreshGroupPredictions();
      setAutoSavedMatchId(match.id);
      setTimeout(() => setAutoSavedMatchId(null), 2000);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save prediction');
    } finally {
      setMutating(false);
    }
  };

  const getGroupStatusPill = (letter: string, matches: WcMatch[]) => {
    if (matches.length === 0) {
      return { label: 'Open', style: styles.groupStatusOpen };
    }
    if (matches.every((m) => getMatchUiState(m) === 'completed')) {
      return { label: 'Final', style: styles.groupStatusOpen };
    }

    const openMatches = matches.filter((m) => getMatchUiState(m) === 'open');
    const openWithPred = openMatches.filter((m) =>
      hasPredictionScores(groupPredictionsByMatchId.get(m.id))
    );
    const openSubmitted = openMatches.filter((m) =>
      isPredictionSubmitted(groupPredictionsByMatchId.get(m.id))
    );

    if (openMatches.length > 0 && openSubmitted.length === openMatches.length) {
      return { label: '✓ Submitted', style: styles.groupStatusSubmitted };
    }

    const draftCount = openMatches.filter((m) => {
      const pred = groupPredictionsByMatchId.get(m.id);
      return hasPredictionScores(pred) && !isPredictionSubmitted(pred);
    }).length;

    if (draftCount > 0) {
      return {
        label: `✏️ Draft ${draftCount}/${openMatches.length}`,
        style: styles.groupStatusDraft,
      };
    }

    if (openWithPred.length === 0 && groupPredictions.filter((p) => {
      const m = matches.find((x) => x.id === p.match_id);
      return !!m;
    }).length === 0) {
      return { label: 'Open', style: styles.groupStatusOpen };
    }

    return { label: 'Open', style: styles.groupStatusOpen };
  };

  const handleSaveGroupDraft = async (letter: string, matches: WcMatch[]) => {
    if (mutating) return;
    const openMatches = matches.filter((m) => getMatchUiState(m) === 'open');
    setMutating(true);
    try {
      for (const match of openMatches) {
        const { home, away } = getScoresForMatch(match.id);
        if (home == null || away == null) continue;
        await upsertGroupPrediction(match.id, home, away, false);
      }
      await refreshGroupPredictions();
      showToast(`Saved Group ${letter} drafts.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save drafts');
    } finally {
      setMutating(false);
    }
  };

  const handleSubmitGroup = async (letter: string, matches: WcMatch[]) => {
    if (mutating) return;
    const openMatches = matches.filter((m) => getMatchUiState(m) === 'open');
    const toSubmit = openMatches.filter((m) => {
      const { home, away } = getScoresForMatch(m.id);
      return home != null && away != null;
    });
    if (toSubmit.length === 0) return;

    setMutating(true);
    try {
      for (const match of toSubmit) {
        const { home, away } = getScoresForMatch(match.id);
        await upsertGroupPrediction(match.id, home!, away!, true);
      }
      await refreshGroupPredictions();
      const { data: scores } = await (supabase as any)
        .from('wc_player_scores')
        .select('total_pts, ko_picks_submitted')
        .eq('user_id', userId)
        .limit(1);
      applyPlayerScore(scores?.[0] ?? null);
      showToast(`Submitted Group ${letter} predictions.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to submit group');
    } finally {
      setMutating(false);
    }
  };

  const handleResetGroup = (letter: string) => {
    Alert.alert(
      'Reset Group',
      `Clear all Group ${letter} predictions? This costs 1 point.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setMutating(true);
            try {
              const { error } = await (supabase as any).rpc('reset_group', {
                p_group_letter: letter,
              });
              if (error) throw new Error(error.message);
              await refreshGroupPredictions();
              const { data: scores } = await (supabase as any)
                .from('wc_player_scores')
                .select('total_pts, ko_picks_submitted')
                .eq('user_id', userId)
                .limit(1);
              applyPlayerScore(scores?.[0] ?? null);
              if (activeTab === 'me') await fetchMeData();
              showToast(`Group ${letter} reset.`);
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to reset group');
            } finally {
              setMutating(false);
            }
          },
        },
      ]
    );
  };

  const roleContext = useMemo(() => {
    const roleLabel = ROLE_LABELS[currentRole?.role] || currentRole?.role || 'Member';
    const entity =
      currentRole?.club?.name ||
      currentRole?.team?.name ||
      currentRole?.entityName ||
      '';
    const abbrev = entity ? entity.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 4).toUpperCase() : '';
    return abbrev ? `${roleLabel} · ${abbrev}` : roleLabel;
  }, [currentRole]);

  const groupSubmittedCount = groupPredictions.filter((p) => isPredictionSubmitted(p)).length;
  const koSubmittedCount =
    playerScore?.ko_picks_submitted ??
    koPicks.filter((p) => p.submitted).length;
  const totalSubmittedCount = groupSubmittedCount + koSubmittedCount;
  const resetPenaltyTotal = resets.reduce((sum, r) => sum + (r.penalty_pts ?? 0), 0);

  const finalSubmitted = useMemo(() => {
    const finalMatch = koMatches.find((m) => m.stage === 'Final');
    if (!finalMatch) return null;
    const pick = mergedPicks[finalMatch.id];
    if (!pick?.submitted) return null;
    return teamByCode(pick.picked_team_code) ?? null;
  }, [koMatches, mergedPicks]);

  const renderHeader = () => (
    <View style={styles.headerRow}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Feather name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <LinearGradient colors={['#ffd166', '#f0a020']} style={styles.trophyIcon}>
        <Feather name="award" size={26} color="#1a1200" />
      </LinearGradient>
      <View style={styles.headerTextBlock}>
        <Text style={styles.eyebrow}>THRYVYNG</Text>
        <Text style={styles.titleLine}>WORLD CUP</Text>
        <Text style={[styles.titleLine, styles.titleGold]}>PREDICTOR</Text>
        <Text style={styles.subtitle}>FIFA 2026 · USA · Canada · Mexico</Text>
      </View>
      <View style={styles.pointsPill}>
        <Feather name="zap" size={14} color="#1a1200" />
        <Text style={styles.pointsValue}>{totalPts}</Text>
        <Text style={styles.pointsLabel}>pts</Text>
      </View>
    </View>
  );

  const renderTabBar = () => {
    const tabs: { key: TabKey; label: string; emoji: string }[] = [
      { key: 'groups', label: 'Groups', emoji: '⚽' },
      { key: 'knockouts', label: 'Knockouts', emoji: '🏆' },
      { key: 'leaderboard', label: 'Leaderboard', emoji: '🏅' },
      { key: 'me', label: 'Me', emoji: '👤' },
    ];
    return (
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={styles.tabEmoji}>{tab.emoji}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              {active && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderGroupMatchCard = (match: WcMatch) => {
    const home = teamByCode(match.home_team_code ?? '');
    const away = teamByCode(match.away_team_code ?? '');
    const uiState = getMatchUiState(match);
    const { home: predHome, away: predAway, submitted, pred } = getScoresForMatch(match.id);
    const hasScores = predHome != null && predAway != null;

    const scoreBoxStyle = submitted
      ? styles.scoreBoxSubmitted
      : hasScores
        ? styles.scoreBoxDraft
        : styles.scoreBoxEmpty;
    const scoreTextStyle = submitted
      ? styles.scoreTextSubmitted
      : hasScores
        ? styles.scoreTextDraft
        : styles.scoreTextEmpty;

    const renderPredictionSubtitle = () => {
      if (!hasScores) {
        return <Text style={styles.predictionSubtitleDim}>No prediction</Text>;
      }
      const pts = predictionPoints(pred);
      const label = `You: ${predHome}-${predAway}`;
      if (uiState === 'completed') {
        return (
          <Text
            style={pts > 0 ? styles.predictionSubtitleGood : styles.predictionSubtitleNeutral}
          >
            {label} · {pts > 0 ? `+${pts} pts` : '0 pts'}
          </Text>
        );
      }
      if (uiState === 'locked') {
        return <Text style={styles.predictionSubtitleNeutral}>You predicted: {predHome}-{predAway}</Text>;
      }
      return null;
    };

    const renderSteppers = () => (
      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={styles.stepperBtn}
          disabled={mutating || submitted}
          onPress={() => handleGroupStepper(match, 'home', -1)}
        >
          <Text style={styles.stepperBtnText}>−</Text>
        </TouchableOpacity>
        <View style={[styles.scoreBox, scoreBoxStyle]}>
          <Text style={[styles.scoreBoxText, scoreTextStyle]}>
            {predHome ?? '–'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.stepperBtn}
          disabled={mutating || submitted || predHome === SCORE_MAX}
          onPress={() => handleGroupStepper(match, 'home', 1)}
        >
          <Text style={styles.stepperBtnText}>+</Text>
        </TouchableOpacity>

        <Text style={styles.stepperColon}>:</Text>

        <TouchableOpacity
          style={styles.stepperBtn}
          disabled={mutating || submitted}
          onPress={() => handleGroupStepper(match, 'away', -1)}
        >
          <Text style={styles.stepperBtnText}>−</Text>
        </TouchableOpacity>
        <View style={[styles.scoreBox, scoreBoxStyle]}>
          <Text style={[styles.scoreBoxText, scoreTextStyle]}>
            {predAway ?? '–'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.stepperBtn}
          disabled={mutating || submitted || predAway === SCORE_MAX}
          onPress={() => handleGroupStepper(match, 'away', 1)}
        >
          <Text style={styles.stepperBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    );

    return (
      <View key={match.id} style={styles.groupMatchCard}>
        <Text style={styles.groupMatchCardHeader}>
          M{match.match_number} · {formatMountainDateTime(match.scheduled_at)}
        </Text>

        {uiState === 'completed' && (
          <>
            <View style={styles.groupMatchTeamsRow}>
              <TeamFlag team={home} size={22} />
              <Text style={styles.groupMatchTeamName} numberOfLines={1}>
                {home?.short ?? 'TBD'}
              </Text>
              <Text style={styles.groupMatchResultScore}>
                {match.home_score ?? 0}-{match.away_score ?? 0}
              </Text>
              <Text style={styles.groupMatchTeamName} numberOfLines={1}>
                {away?.short ?? 'TBD'}
              </Text>
              <TeamFlag team={away} size={22} />
            </View>
            {renderPredictionSubtitle()}
          </>
        )}

        {uiState === 'locked' && (
          <>
            <View style={styles.groupMatchTeamsRow}>
              <TeamFlag team={home} size={22} />
              <Text style={styles.groupMatchTeamName} numberOfLines={1}>
                {home?.short ?? 'TBD'}
              </Text>
              <Text style={styles.groupMatchLockedScore}>—</Text>
              <Text style={styles.groupMatchTeamName} numberOfLines={1}>
                {away?.short ?? 'TBD'}
              </Text>
              <TeamFlag team={away} size={22} />
            </View>
            <View style={styles.lockedPill}>
              <Text style={styles.lockedPillText}>🔒 Locked · awaiting result</Text>
            </View>
            {renderPredictionSubtitle()}
          </>
        )}

        {uiState === 'open' && (
          <>
            <View style={styles.groupMatchTeamsRow}>
              <TeamFlag team={home} size={22} />
              <Text style={styles.groupMatchTeamName} numberOfLines={1}>
                {home?.short ?? 'TBD'}
              </Text>
              <Text style={styles.groupMatchVs}>vs</Text>
              <Text style={styles.groupMatchTeamName} numberOfLines={1}>
                {away?.short ?? 'TBD'}
              </Text>
              <TeamFlag team={away} size={22} />
            </View>
            {renderSteppers()}
            {autoSavedMatchId === match.id && (
              <Text style={styles.autoSavedText}>auto-saved</Text>
            )}
          </>
        )}
      </View>
    );
  };

  const renderGroupsTab = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5dcaa5" />}
      showsVerticalScrollIndicator={false}
    >
      {GROUP_LETTERS.map((letter) => {
        const teams = TEAMS.filter((t) => t.group === letter);
        const matches = matchesForGroup(groupMatches, letter);
        const standings = computeStandings(matches, letter);
        const statusPill = getGroupStatusPill(letter, matches);
        const openMatches = matches.filter((m) => getMatchUiState(m) === 'open');
        const canSubmitGroup = openMatches.some((m) => {
          const { home, away } = getScoresForMatch(m.id);
          return home != null && away != null;
        });

        return (
          <View key={letter} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>GROUP {letter}</Text>
              <View style={styles.groupHeaderRight}>
                <View style={[styles.groupStatusPill, statusPill.style]}>
                  <Text style={styles.groupStatusText}>{statusPill.label}</Text>
                </View>
                <View style={styles.groupBadge}>
                  <Text style={styles.groupBadgeText}>{letter}</Text>
                </View>
              </View>
            </View>

            <View style={styles.teamList}>
              {teams.map((team) => (
                <View key={team.code} style={styles.teamListRow}>
                  <TeamFlag team={team} />
                  <Text style={styles.teamListName}>{team.name}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.tableSectionLabel}>STANDINGS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.tableHeaderRow}>
                  {['#', '', 'Team', 'Pts', 'GD', 'GF', 'W-D-L'].map((h) => (
                    <Text key={h} style={styles.tableHeaderCell}>
                      {h}
                    </Text>
                  ))}
                </View>
                {standings.map((row, idx) => {
                  const team = teamByCode(row.code);
                  const rowStyle =
                    idx === 0 || idx === 1
                      ? styles.standingRowTop
                      : idx === 2
                        ? styles.standingRowMid
                        : styles.standingRowBottom;
                  return (
                    <View key={row.code} style={[styles.tableRow, rowStyle]}>
                      <Text style={styles.tableCellRank}>{idx + 1}</Text>
                      <TeamFlag team={team} size={22} showCode />
                      <Text style={styles.tableCellTeam} numberOfLines={1}>
                        {team?.short ?? row.code}
                      </Text>
                      <Text style={styles.tableCellNum}>{row.pts}</Text>
                      <Text style={styles.tableCellNum}>{row.gd}</Text>
                      <Text style={styles.tableCellNum}>{row.gf}</Text>
                      <Text style={styles.tableCellRecord}>
                        {row.w}-{row.d}-{row.l}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.groupActionBar}>
              <TouchableOpacity
                style={styles.saveDraftBtn}
                disabled={mutating}
                onPress={() => handleSaveGroupDraft(letter, matches)}
              >
                <Text style={styles.saveDraftText}>✏️ Save Draft</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, !canSubmitGroup && styles.submitBtnDisabled]}
                disabled={mutating || !canSubmitGroup}
                onPress={() => handleSubmitGroup(letter, matches)}
              >
                <Text style={styles.submitText}>🔒 Submit Group</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resetRoundBtn}
                disabled={mutating}
                onPress={() => handleResetGroup(letter)}
              >
                <Text style={styles.resetRoundText}>↻ Reset (-1)</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.tableSectionLabel}>MATCHES</Text>
            {matches.length === 0 ? (
              <Text style={styles.emptyHint}>No matches configured for this group</Text>
            ) : (
              matches.map((match) => renderGroupMatchCard(match))
            )}
          </View>
        );
      })}
    </ScrollView>
  );

  const renderKnockoutsTab = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5dcaa5" />}
      showsVerticalScrollIndicator={false}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stageNav}>
        {KO_STAGES.map((stage) => {
          const indicator = getStageIndicator(stage);
          return (
            <TouchableOpacity
              key={stage}
              style={[styles.stagePill, koStage === stage && styles.stagePillActive]}
              onPress={() => setKoStage(stage)}
            >
              <Text style={[styles.stagePillText, koStage === stage && styles.stagePillTextActive]}>
                {stage}
              </Text>
              {indicator !== 'empty' && (
                <View
                  style={[
                    styles.stageDot,
                    indicator === 'submitted' ? styles.stageDotGreen : styles.stageDotGold,
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {stageMatches.length === 0 ? (
        <Text style={styles.emptyHint}>No {koStage} matches configured yet</Text>
      ) : (
        stageMatches.map((match) => {
          const candidates = getCandidates(match);
          const pick = mergedPicks[match.id];
          const isSubmitted = !!pick?.submitted;

          const renderTeamRow = (teamCode: string | null, side: 'home' | 'away') => {
            const team = teamCode ? teamByCode(teamCode) : null;
            const selected = pick?.picked_team_code === teamCode && !!teamCode;
            const rowStyles = [
              styles.koTeamRow,
              selected && (isSubmitted ? styles.koTeamRowSubmitted : styles.koTeamRowSelected),
            ];
            return (
              <TouchableOpacity
                key={`${match.id}-${side}`}
                style={rowStyles}
                disabled={candidates.blocked || !teamCode || isSubmitted}
                onPress={() => teamCode && handleSelectWinner(match, teamCode)}
                activeOpacity={0.8}
              >
                <TeamFlag team={team} size={26} />
                <Text style={styles.koTeamName}>{team?.name ?? 'TBD'}</Text>
                {selected && team && (
                  <Text style={[styles.koTeamCode, isSubmitted && styles.koTeamCodeSubmitted]}>
                    {team.code}
                  </Text>
                )}
              </TouchableOpacity>
            );
          };

          return (
            <View key={match.id} style={styles.koMatchCard}>
              <Text style={styles.koMatchHeader}>
                {match.stage} M{match.match_number} · {formatMatchDate(match)}
              </Text>
              {candidates.blocked ? (
                <View style={styles.blockedState}>
                  <Feather name="alert-circle" size={18} color="#f59e0b" />
                  <Text style={styles.blockedText}>{candidates.message}</Text>
                </View>
              ) : (
                <>
                  {renderTeamRow(candidates.home, 'home')}
                  <Text style={styles.koVs}>VS</Text>
                  {renderTeamRow(candidates.away, 'away')}
                </>
              )}
            </View>
          );
        })
      )}

      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.saveDraftBtn}
          disabled={mutating || stageAllSubmitted}
          onPress={() => handleSaveStage(false)}
        >
          <Text style={styles.saveDraftText}>✏️ Save Draft</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, (!stageAllPicked || stageAllSubmitted) && styles.submitBtnDisabled]}
          disabled={mutating || !stageAllPicked || stageAllSubmitted}
          onPress={() => handleSaveStage(true)}
        >
          <Text style={styles.submitText}>🔒 Submit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetRoundBtn} disabled={mutating} onPress={handleResetRound}>
          <Text style={styles.resetRoundText}>↻ Reset Round (-2)</Text>
        </TouchableOpacity>
      </View>

      {finalSubmitted && (
        <LinearGradient colors={['#ffd166', '#f0a020']} style={styles.championBanner}>
          <Feather name="star" size={28} color="#1a1200" />
          <TeamFlag team={finalSubmitted} size={40} />
          <View style={styles.championTextWrap}>
            <Text style={styles.championLabel}>YOUR CHAMPION PICK</Text>
            <Text style={styles.championName}>
              {finalSubmitted.flag} {finalSubmitted.name}
            </Text>
          </View>
        </LinearGradient>
      )}
    </ScrollView>
  );

  const renderLeaderboardTab = () => {
    if (clubIds.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, styles.centeredEmpty]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5dcaa5" />}
        >
          <Feather name="users" size={40} color="#4a5878" />
          <Text style={styles.emptyTitle}>Join a team to appear on a club leaderboard.</Text>
        </ScrollView>
      );
    }

    const myIndex = leaderboardScores.findIndex((s) => s.user_id === userId);
    const myScore = myIndex >= 0 ? leaderboardScores[myIndex] : null;
    const topScore = leaderboardScores[0]?.total_pts ?? 0;

    return (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5dcaa5" />}
        showsVerticalScrollIndicator={false}
      >
        {clubs.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.clubSelector}>
            {clubs.map((club) => (
              <TouchableOpacity
                key={club.id}
                style={[styles.clubPill, selectedClubId === club.id && styles.clubPillActive]}
                onPress={async () => {
                  setSelectedClubId(club.id);
                  setRefreshing(true);
                  try {
                    const { data: scores, error } = await (supabase as any)
                      .from('wc_player_scores')
                      .select('user_id, club_id, total_pts, ko_picks_submitted')
                      .eq('club_id', club.id)
                      .order('total_pts', { ascending: false })
                      .limit(50);
                    if (error) throw new Error(error.message);
                    setLeaderboardScores((scores as WcPlayerScore[]) || []);
                  } catch (err: any) {
                    Alert.alert('Error', err?.message || 'Failed to load club leaderboard');
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                <Text
                  style={[
                    styles.clubPillText,
                    selectedClubId === club.id && styles.clubPillTextActive,
                  ]}
                >
                  {club.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.myRankCard}>
          <Text style={styles.myRankLabel}>Your Rank</Text>
          <Text style={styles.myRankValue}>{myIndex >= 0 ? `#${myIndex + 1}` : '—'}</Text>
          <Text style={styles.myRankPts}>{myScore?.total_pts ?? 0} pts</Text>
          <Text style={styles.myRankHint}>
            {myIndex === 0
              ? "You're #1!"
              : myScore
                ? `${topScore - myScore.total_pts} pts behind #1`
                : 'Make picks to earn points'}
          </Text>
        </View>

        {leaderboardScores.map((row, index) => {
          const prof = leaderboardProfiles[row.user_id];
          const name = displayName(prof);
          const roles = leaderboardRoles[row.user_id] || [];
          const primaryRole = roles[0]?.role;
          const roleLabel = ROLE_LABELS[primaryRole] || primaryRole || 'Member';
          const isMe = row.user_id === userId;
          const rankStyle =
            index === 0
              ? styles.rankGold
              : index === 1
                ? styles.rankSilver
                : index === 2
                  ? styles.rankBronze
                  : styles.rankGray;

          return (
            <View key={`${row.club_id}-${row.user_id}`} style={[styles.leaderRow, isMe && styles.leaderRowMe]}>
              <View style={[styles.rankBadge, rankStyle]}>
                <Text style={styles.rankBadgeText}>{index + 1}</Text>
              </View>
              <View style={styles.avatarBubble}>
                <Text style={styles.avatarText}>{initials(name)}</Text>
              </View>
              <View style={styles.leaderInfo}>
                <Text style={styles.leaderName}>{name}</Text>
                <Text style={styles.leaderRole}>{roleLabel}</Text>
              </View>
              <View style={styles.leaderPtsWrap}>
                <Text style={styles.leaderPts}>{row.total_pts}</Text>
                <Text style={styles.leaderPtsLabel}>pts</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const renderMeTab = () => {
    const meName = displayName(profile);

    return (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5dcaa5" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatarBubbleLarge}>
            <Text style={styles.avatarTextLarge}>{initials(meName)}</Text>
          </View>
          <View>
            <Text style={styles.profileName}>{meName}</Text>
            <Text style={styles.profileRole}>{roleContext}</Text>
          </View>
        </View>

        <View style={styles.meStatsRow}>
          <View style={styles.meStatCard}>
            <Text style={styles.meStatLabel}>SUBMITTED PICKS</Text>
            <Text style={styles.meStatValue}>
              {totalSubmittedCount} / {TOTAL_SUBMITTED_PICKS} submitted
            </Text>
          </View>
          <View style={styles.meStatCard}>
            <Text style={styles.meStatLabel}>RESETS</Text>
            <Text style={styles.meStatValue}>
              {resets.length} ({resetPenaltyTotal} pts)
            </Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>STAGE PROGRESS</Text>
        {KO_STAGES.map((stage) => {
          const matches = koMatches.filter((m) => m.stage === stage);
          const picked = matches.filter((m) => mergedPicks[m.id]?.picked_team_code).length;
          const total = matches.length || (stage === 'R32' ? 16 : stage === 'R16' ? 8 : stage === 'QF' ? 4 : stage === 'SF' ? 2 : 1);
          const indicator = getStageIndicator(stage);
          const iconName =
            indicator === 'submitted' ? 'lock' : indicator === 'draft' ? 'save' : 'minus-circle';
          const iconColor =
            indicator === 'submitted' ? '#5dcaa5' : indicator === 'draft' ? '#ffd166' : '#64748b';

          return (
            <View key={stage} style={styles.progressRow}>
              <Feather name={iconName as any} size={16} color={iconColor} />
              <Text style={styles.progressStage}>{stage}</Text>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${total ? (picked / total) * 100 : 0}%` }]}
                />
              </View>
              <Text style={styles.progressCount}>
                {picked}/{total}
              </Text>
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.resetHistoryToggle}
          onPress={() => setResetHistoryExpanded((v) => !v)}
        >
          <Text style={styles.sectionHeading}>RESET HISTORY</Text>
          <Feather name={resetHistoryExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#7a8aa8" />
        </TouchableOpacity>

        {resetHistoryExpanded &&
          (resets.length === 0 ? (
            <Text style={styles.emptyHint}>No resets yet</Text>
          ) : (
            resets.map((r) => (
              <View key={r.id} style={styles.resetRow}>
                <View>
                  <Text style={styles.resetScope}>{r.scope ?? 'Reset'}</Text>
                  {r.scope_detail ? (
                    <Text style={styles.resetDetail}>{r.scope_detail}</Text>
                  ) : null}
                </View>
                <View style={styles.resetMeta}>
                  <Text style={styles.resetPenalty}>{r.penalty_pts ?? 0} pts</Text>
                  <Text style={styles.resetTime}>
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </Text>
                </View>
              </View>
            ))
          ))}

        <TouchableOpacity style={styles.resetAllBtn} disabled={mutating} onPress={handleResetAll}>
          <Text style={styles.resetAllText}>Reset Everything (-5 pts)</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderTabContent = () => {
    if (loading && !refreshing) {
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#5dcaa5" />
        </View>
      );
    }
    switch (activeTab) {
      case 'groups':
        return renderGroupsTab();
      case 'knockouts':
        return renderKnockoutsTab();
      case 'leaderboard':
        return renderLeaderboardTab();
      case 'me':
        return renderMeTab();
      default:
        return null;
    }
  };

  return (
    <LinearGradient colors={['#0f1729', '#0a0e1a']} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {renderHeader()}
        {renderTabBar()}
        <View style={styles.content}>{renderTabContent()}</View>
        {toastMessage ? (
          <View style={styles.toastBanner}>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  content: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 8,
  },
  backButton: { padding: 8, marginTop: 8 },
  trophyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  headerTextBlock: { flex: 1, paddingTop: 2 },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 3,
    color: '#5dcaa5',
    fontWeight: '700',
    marginBottom: 2,
  },
  titleLine: { fontSize: 18, fontWeight: '800', color: '#fff', lineHeight: 22 },
  titleGold: { color: '#ffd166' },
  subtitle: { fontSize: 10, color: '#7a8aa8', marginTop: 4 },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffd166',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
    marginTop: 8,
  },
  pointsValue: { fontSize: 16, fontWeight: '800', color: '#1a1200' },
  pointsLabel: { fontSize: 11, fontWeight: '600', color: '#1a1200' },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e293b',
    paddingHorizontal: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabEmoji: { fontSize: 18, marginBottom: 2 },
  tabLabel: { fontSize: 11, fontWeight: '600', color: '#4a5878' },
  tabLabelActive: { color: '#5dcaa5' },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    width: '70%',
    backgroundColor: '#5dcaa5',
    borderRadius: 1,
  },
  scrollContent: { padding: 16, paddingBottom: 40 },
  centeredEmpty: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyTitle: { color: '#7a8aa8', fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  emptyHint: { color: '#64748b', fontSize: 13, marginVertical: 8 },
  groupCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  groupHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupStatusPill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  groupStatusSubmitted: { backgroundColor: 'rgba(93, 202, 165, 0.2)' },
  groupStatusDraft: { backgroundColor: 'rgba(255, 209, 102, 0.15)' },
  groupStatusOpen: { backgroundColor: 'rgba(100, 116, 139, 0.2)' },
  groupStatusText: { fontSize: 10, fontWeight: '700', color: '#e2e8f0' },
  groupTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  groupBadge: {
    backgroundColor: '#ffd166',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  groupBadgeText: { color: '#1a1200', fontWeight: '800', fontSize: 13 },
  teamList: { marginBottom: 12 },
  teamListRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  teamListName: { color: '#e2e8f0', fontSize: 14, fontWeight: '500' },
  teamFlagWrap: { alignItems: 'center', justifyContent: 'center' },
  teamCodeHint: { fontSize: 9, color: '#64748b', marginTop: 1, fontWeight: '600' },
  tableSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7a8aa8',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 6,
  },
  tableHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  tableHeaderCell: {
    width: 44,
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  standingRowTop: { backgroundColor: 'rgba(93, 202, 165, 0.12)' },
  standingRowMid: { backgroundColor: 'rgba(255, 209, 102, 0.1)' },
  standingRowBottom: { backgroundColor: 'rgba(100, 116, 139, 0.08)' },
  tableCellRank: { width: 44, textAlign: 'center', color: '#94a3b8', fontWeight: '700' },
  tableCellTeam: { width: 88, color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
  tableCellNum: { width: 44, textAlign: 'center', color: '#cbd5e1', fontSize: 12 },
  tableCellRecord: { width: 56, textAlign: 'center', color: '#94a3b8', fontSize: 11 },
  groupActionBar: { marginTop: 12, marginBottom: 8, gap: 10 },
  groupMatchCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  groupMatchCardHeader: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  groupMatchTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupMatchTeamName: { flex: 1, color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
  groupMatchResultScore: {
    color: '#5dcaa5',
    fontWeight: '800',
    fontSize: 14,
    minWidth: 44,
    textAlign: 'center',
  },
  groupMatchLockedScore: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 14,
    minWidth: 44,
    textAlign: 'center',
  },
  groupMatchVs: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 12,
    paddingHorizontal: 4,
  },
  lockedPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  lockedPillText: { color: '#fbbf24', fontSize: 11, fontWeight: '600' },
  predictionSubtitleGood: { color: '#5dcaa5', fontSize: 11, marginTop: 6, fontWeight: '600' },
  predictionSubtitleNeutral: { color: '#94a3b8', fontSize: 11, marginTop: 6 },
  predictionSubtitleDim: { color: '#64748b', fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 6,
  },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { color: '#e2e8f0', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  stepperColon: { color: '#64748b', fontSize: 18, fontWeight: '700', marginHorizontal: 4 },
  scoreBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  scoreBoxEmpty: { backgroundColor: '#1e293b', borderColor: '#475569' },
  scoreBoxDraft: { backgroundColor: 'rgba(255, 209, 102, 0.15)', borderColor: '#ffd166' },
  scoreBoxSubmitted: { backgroundColor: 'rgba(93, 202, 165, 0.15)', borderColor: '#5dcaa5' },
  scoreBoxText: { fontSize: 18, fontWeight: '800' },
  scoreTextEmpty: { color: '#64748b' },
  scoreTextDraft: { color: '#ffd166' },
  scoreTextSubmitted: { color: '#5dcaa5' },
  autoSavedText: {
    color: '#64748b',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic',
  },
  toastBanner: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#475569',
  },
  toastText: { color: '#e2e8f0', fontSize: 14, textAlign: 'center', fontWeight: '600' },
  stageNav: { marginBottom: 12 },
  stagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    marginRight: 8,
    gap: 6,
  },
  stagePillActive: { backgroundColor: 'rgba(93, 202, 165, 0.2)', borderWidth: 1, borderColor: '#5dcaa5' },
  stagePillText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  stagePillTextActive: { color: '#5dcaa5' },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  stageDotGold: { backgroundColor: '#ffd166' },
  stageDotGreen: { backgroundColor: '#5dcaa5' },
  koMatchCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  koMatchHeader: { color: '#7a8aa8', fontSize: 12, fontWeight: '600', marginBottom: 10 },
  koTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  koTeamRowSelected: {
    backgroundColor: 'rgba(255, 209, 102, 0.15)',
    borderLeftColor: '#ffd166',
  },
  koTeamRowSubmitted: {
    backgroundColor: 'rgba(93, 202, 165, 0.15)',
    borderLeftColor: '#5dcaa5',
  },
  koTeamName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  koTeamCode: { color: '#ffd166', fontWeight: '800', fontSize: 13 },
  koTeamCodeSubmitted: { color: '#5dcaa5' },
  koVs: { textAlign: 'center', color: '#64748b', fontWeight: '700', marginVertical: 2 },
  blockedState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 10,
  },
  blockedText: { color: '#fbbf24', fontSize: 13, flex: 1 },
  actionBar: { marginTop: 8, gap: 10 },
  saveDraftBtn: {
    borderWidth: 1,
    borderColor: '#ffd166',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveDraftText: { color: '#ffd166', fontWeight: '700', fontSize: 15 },
  submitBtn: {
    backgroundColor: '#5dcaa5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitText: { color: '#0a0e1a', fontWeight: '800', fontSize: 15 },
  resetRoundBtn: {
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  resetRoundText: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
  championBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  championTextWrap: { flex: 1 },
  championLabel: { fontSize: 11, fontWeight: '800', color: '#1a1200', letterSpacing: 1 },
  championName: { fontSize: 20, fontWeight: '800', color: '#1a1200' },
  clubSelector: { marginBottom: 12 },
  clubPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    marginRight: 8,
  },
  clubPillActive: { backgroundColor: 'rgba(93, 202, 165, 0.2)', borderWidth: 1, borderColor: '#5dcaa5' },
  clubPillText: { color: '#94a3b8', fontWeight: '600', fontSize: 13 },
  clubPillTextActive: { color: '#5dcaa5' },
  myRankCard: {
    backgroundColor: 'rgba(93, 202, 165, 0.12)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#5dcaa5',
  },
  myRankLabel: { color: '#7a8aa8', fontSize: 12, fontWeight: '600' },
  myRankValue: { color: '#ffd166', fontSize: 32, fontWeight: '800' },
  myRankPts: { color: '#fff', fontSize: 18, fontWeight: '700' },
  myRankHint: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  leaderRowMe: {
    borderWidth: 1,
    borderColor: '#ffd166',
    backgroundColor: 'rgba(255, 209, 102, 0.08)',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankGold: { backgroundColor: '#ffd166' },
  rankSilver: { backgroundColor: '#cbd5e1' },
  rankBronze: { backgroundColor: '#d97706' },
  rankGray: { backgroundColor: '#475569' },
  rankBadgeText: { fontSize: 12, fontWeight: '800', color: '#0a0e1a' },
  avatarBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  leaderInfo: { flex: 1 },
  leaderName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  leaderRole: { color: '#64748b', fontSize: 11, marginTop: 2 },
  leaderPtsWrap: { alignItems: 'flex-end' },
  leaderPts: { color: '#ffd166', fontSize: 18, fontWeight: '800' },
  leaderPtsLabel: { color: '#64748b', fontSize: 10 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  avatarBubbleLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextLarge: { color: '#fff', fontWeight: '800', fontSize: 18 },
  profileName: { color: '#fff', fontSize: 18, fontWeight: '800' },
  profileRole: { color: '#7a8aa8', fontSize: 13, marginTop: 4 },
  meStatsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  meStatCard: {
    flex: 1,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderRadius: 14,
    padding: 14,
  },
  meStatLabel: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  meStatValue: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 6 },
  sectionHeading: { color: '#7a8aa8', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  progressStage: { width: 44, color: '#e2e8f0', fontWeight: '700', fontSize: 12 },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#5dcaa5', borderRadius: 4 },
  progressCount: { width: 40, textAlign: 'right', color: '#94a3b8', fontSize: 11 },
  resetHistoryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  resetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  resetScope: { color: '#e2e8f0', fontWeight: '600', fontSize: 13 },
  resetDetail: { color: '#64748b', fontSize: 11, marginTop: 2 },
  resetMeta: { alignItems: 'flex-end' },
  resetPenalty: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
  resetTime: { color: '#64748b', fontSize: 11, marginTop: 2 },
  resetAllBtn: {
    marginTop: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  resetAllText: { color: '#ef4444', fontWeight: '800', fontSize: 16 },
});

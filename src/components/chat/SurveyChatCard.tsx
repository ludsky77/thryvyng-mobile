import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSurveyShare } from '../../lib/surveyShare';
import {
  CHAT_FALLBACK_NAME,
  chatPersonName,
  fetchChatProfileNames,
} from '../../lib/memberNames';

interface SurveyCardData {
  surveyId: string;
  title: string;
  closesAt: string | null;
  status: string;
  publicSlug: string | null;
  /** `sv_chat_shares.shared_by`, resolved through `get_chat_profiles`. */
  sharedByName: string | null;
  /** `sv_chat_shares.shared_at`. Null on a row the read could not resolve. */
  sharedAt: string | null;
}

interface SurveyChatCardProps {
  messageId: string;
  navigation: any;
}

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDeadline(closesAt: string | null): string {
  if (!closesAt) return 'No deadline';
  const d = new Date(closesAt);
  return `Closes ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function SurveyChatCard({ messageId, navigation }: SurveyChatCardProps) {
  const { user } = useAuth();
  const [card, setCard] = useState<SurveyCardData | null>(null);
  const [hasResponded, setHasResponded] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCard = useCallback(async () => {
    try {
      /*
       * The share row, through `lib/surveyShare.ts`, which owns the column
       * names. This query used to ask for `posted_by`, `created_at` and
       * `poster:profiles!posted_by(full_name)` — the first two are not columns
       * (they are `shared_by` and `shared_at`) and the third assumed a declared
       * FK to `profiles` that nothing in this repo can confirm, on a table RLS
       * refuses to an ordinary parent or player viewer anyway. One bad column
       * name fails the WHOLE select, so the card resolved to nothing and the
       * `catch` said nothing — the audit is
       * `thrive-and-score/docs/recon/club-announcements-v1-server.md` § 7d.
       */
      const share = await fetchSurveyShare(messageId);
      if (!share) return;

      // The NAME is a separate, membership-gated call: `get_chat_profiles`,
      // the app-wide path for every other person's name in a chat (ruling
      // FND-1). It carries the server's own ladder, which ends at
      // 'Thryvyng member' rather than null, so a nameless profile is still a
      // named row and the footer never reads 'Shared by undefined'.
      let sharedByName: string | null = null;
      if (share.sharedBy) {
        const names = await fetchChatProfileNames([share.sharedBy]);
        sharedByName = chatPersonName(
          names.get(share.sharedBy)?.name ?? CHAT_FALLBACK_NAME
        );
      }

      setCard({
        surveyId: share.surveyId,
        title: share.title ?? 'Survey',
        closesAt: share.closesAt,
        status: share.status ?? 'open',
        publicSlug: share.publicSlug,
        sharedByName,
        sharedAt: share.sharedAt,
      });

      // Check if current user has already responded
      if (user?.id) {
        const { data: dist } = await supabase
          .from('sv_distributions')
          .select('id')
          .eq('survey_id', share.surveyId)
          .eq('user_id', user.id)
          .not('completed_at', 'is', null)
          .maybeSingle();
        setHasResponded(!!dist);
      }
    } catch {
      // silently fail — card just won't show
    } finally {
      setLoading(false);
    }
  }, [messageId, user?.id]);

  useEffect(() => {
    loadCard();
  }, [loadCard]);

  const handleRespond = () => {
    if (!card) return;
    try {
      navigation.navigate('SurveyResponse', { surveyId: card.surveyId });
    } catch {
      navigation.getParent()?.navigate('SurveyResponse', { surveyId: card.surveyId });
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingCard}>
        <ActivityIndicator size="small" color="#8b5cf6" />
      </View>
    );
  }

  if (!card) return null;

  const isClosed =
    card.status !== 'open' ||
    (card.closesAt != null && new Date(card.closesAt) < new Date());

  return (
    <View style={styles.card}>
      {/* Header label */}
      <View style={styles.labelRow}>
        <Ionicons name="clipboard-outline" size={14} color="#8b5cf6" />
        <Text style={styles.labelText}>Club Survey</Text>
        {isClosed && (
          <View style={styles.closedBadge}>
            <Text style={styles.closedBadgeText}>Closed</Text>
          </View>
        )}
      </View>

      {/* Survey title */}
      <Text style={styles.title}>{card.title}</Text>

      {/* Deadline */}
      <View style={styles.metaRow}>
        <Feather name="calendar" size={12} color="#64748b" />
        <Text style={styles.metaText}>{formatDeadline(card.closesAt)}</Text>
      </View>

      {/* CTA */}
      {hasResponded ? (
        <View style={styles.respondedRow}>
          <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
          <Text style={styles.respondedText}>You've responded</Text>
        </View>
      ) : isClosed ? (
        <View style={[styles.respondBtn, styles.respondBtnDisabled]}>
          <Text style={styles.respondBtnTextMuted}>Survey Closed</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.respondBtn}
          onPress={handleRespond}
          activeOpacity={0.85}
        >
          <Text style={styles.respondBtnText}>Respond Now</Text>
        </TouchableOpacity>
      )}

      {/* Footer */}
      {/* `shared_at` has a default of now() so it is never null in practice;
          the guard is here because the TYPE allows null and a missing date
          must not render as 'NaNd ago'. */}
      <Text style={styles.footer}>
        {card.sharedByName ? `Shared by ${card.sharedByName}` : 'Shared'}
        {card.sharedAt ? ` · ${timeAgo(card.sharedAt)}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 4,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
    padding: 14,
    marginHorizontal: 12,
    marginVertical: 4,
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  labelText: {
    color: '#8b5cf6',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  closedBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  closedBadgeText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    color: '#64748b',
    fontSize: 12,
  },
  respondBtn: {
    backgroundColor: '#8b5cf6',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 2,
  },
  respondBtnDisabled: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  respondBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  respondBtnTextMuted: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  respondedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  respondedText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    color: '#475569',
    fontSize: 11,
    marginTop: 2,
  },
});

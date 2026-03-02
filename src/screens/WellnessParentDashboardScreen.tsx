import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useWellnessParent } from '../hooks/useWellness';

export default function WellnessParentDashboardScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { playerId, playerName, userId } = route.params || {};

  const [conversationStartersEnabled, setConversationStartersEnabled] =
    useState(false);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  const {
    engagement,
    pendingApprovals,
    loading,
    approveCategory,
    declineCategory,
  } = useWellnessParent(userId, playerId ?? '');

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds} sec`;
    return `${Math.floor(seconds / 60)} min`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const handleApprovalPress = (approval: any) => {
    setSelectedApproval(approval);
    setApprovalModalOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedApproval) return;
    setProcessing(true);
    await approveCategory(selectedApproval.id);
    setProcessing(false);
    setApprovalModalOpen(false);
    setSelectedApproval(null);
  };

  const handleDecline = async () => {
    if (!selectedApproval) return;
    setProcessing(true);
    await declineCategory(selectedApproval.id);
    setProcessing(false);
    setApprovalModalOpen(false);
    setSelectedApproval(null);
  };

  if (!playerId) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Player is required</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Women's Wellness</Text>
          <Text style={styles.headerSubtitle}>Parent Dashboard</Text>
        </View>
      </View>

      <View style={styles.playerBanner}>
        <Text style={styles.playerLabel}>Viewing for</Text>
        <Text style={styles.playerName}>{playerName || 'Your Player'}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {pendingApprovals.length > 0 && (
          <View style={styles.section}>
            {pendingApprovals.map((approval) => (
              <TouchableOpacity
                key={approval.id}
                style={styles.approvalCard}
                onPress={() => handleApprovalPress(approval)}
                activeOpacity={0.7}
              >
                <View style={styles.approvalIcon}>
                  <Ionicons name="notifications" size={20} color="#fff" />
                </View>
                <View style={styles.approvalContent}>
                  <Text style={styles.approvalTitle}>Approval Requested</Text>
                  <Text style={styles.approvalSubtitle}>
                    {playerName} requested access to{' '}
                    {approval.wellness_categories?.name}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#fbbf24" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="eye-outline" size={20} color="#6b7280" />
            <Text style={styles.sectionTitle}>Engagement Overview</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: '#f3e8ff' }]}>
              <Text style={[styles.statLabel, { color: '#7c3aed' }]}>
                Topics Viewed
              </Text>
              <Text style={[styles.statValue, { color: '#6d28d9' }]}>
                {engagement?.total_views || 0}
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#e0e7ff' }]}>
              <Text style={[styles.statLabel, { color: '#4f46e5' }]}>
                Time Spent
              </Text>
              <Text style={[styles.statValue, { color: '#4338ca' }]}>
                {formatTime(engagement?.total_time_seconds || 0)}
              </Text>
            </View>
          </View>

          {engagement?.topics_viewed && engagement.topics_viewed.length > 0 ? (
            <View style={styles.topicsCard}>
              <Text style={styles.topicsHeader}>Recent Topics Viewed</Text>
              {engagement.topics_viewed.slice(0, 5).map((topic, i) => (
                <View key={i} style={styles.topicItem}>
                  <View style={styles.topicInfo}>
                    <Text style={styles.topicTitle}>{topic.title}</Text>
                    <Text style={styles.topicMeta}>
                      {topic.category} • {formatDate(topic.last_viewed)}
                    </Text>
                  </View>
                  <View style={styles.topicDuration}>
                    <Text style={styles.topicDurationText}>
                      {topic.duration_seconds
                        ? formatTime(topic.duration_seconds)
                        : '-'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyTopics}>
              <Text style={styles.emptyText}>
                No wellness content viewed yet
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="chatbubbles-outline" size={20} color="#6b7280" />
            <Text style={styles.sectionTitle}>Conversation Starters</Text>
          </View>

          <View style={styles.conversationCard}>
            <View style={styles.conversationToggle}>
              <View>
                <Text style={styles.conversationLabel}>
                  Enable Conversation Prompts
                </Text>
                <Text style={styles.conversationDesc}>
                  Get suggested topics to discuss together
                </Text>
              </View>
              <Switch
                value={conversationStartersEnabled}
                onValueChange={setConversationStartersEnabled}
                trackColor={{ false: '#d1d5db', true: '#a78bfa' }}
                thumbColor={
                  conversationStartersEnabled ? '#8b5cf6' : '#f4f4f5'
                }
              />
            </View>

            {conversationStartersEnabled &&
              engagement?.topics_viewed?.length > 0 && (
                <View style={styles.suggestionBox}>
                  <Text style={styles.suggestionLabel}>
                    This week's suggestion:
                  </Text>
                  <Text style={styles.suggestionText}>
                    "{playerName} recently learned about{' '}
                    <Text style={styles.bold}>
                      {engagement.topics_viewed[0]?.title}
                    </Text>
                    . You might ask what they found most helpful or if they
                    have any questions!"
                  </Text>
                </View>
              )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="book-outline" size={20} color="#6b7280" />
            <Text style={styles.sectionTitle}>Resources for Parents</Text>
          </View>

          {[
            {
              title: 'Supporting Your Female Athlete',
              desc: 'What every parent should know',
            },
            {
              title: 'Having the Conversation',
              desc: 'Age-appropriate discussion starters',
            },
            {
              title: 'Warning Signs to Watch For',
              desc: 'RED-S and overtraining awareness',
            },
          ].map((resource, i) => (
            <TouchableOpacity
              key={i}
              style={styles.resourceItem}
              activeOpacity={0.7}
            >
              <View>
                <Text style={styles.resourceItemTitle}>{resource.title}</Text>
                <Text style={styles.resourceDesc}>{resource.desc}</Text>
              </View>
              <Ionicons name="open-outline" size={16} color="#9ca3af" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={approvalModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setApprovalModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Approve Access?</Text>
            <Text style={styles.modalText}>
              {playerName} has requested access to content about{' '}
              <Text style={styles.bold}>
                {selectedApproval?.wellness_categories?.name}
              </Text>
              .
            </Text>

            <View style={styles.modalInfo}>
              <Text style={styles.modalInfoLabel}>This section includes:</Text>
              <Text style={styles.modalInfoItem}>
                • Timing birth control around training
              </Text>
              <Text style={styles.modalInfoItem}>
                • How hormonal BC affects performance
              </Text>
              <Text style={styles.modalInfoItem}>
                • Questions to ask her doctor
              </Text>
            </View>

            <View style={styles.modalNote}>
              <Ionicons name="information-circle" size={16} color="#3b82f6" />
              <Text style={styles.modalNoteText}>
                This content encourages consulting healthcare providers and does
                not replace medical advice.
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDecline}
                disabled={processing}
              >
                <Ionicons name="close" size={18} color="#6b7280" />
                <Text style={styles.declineButtonText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.approveButton}
                onPress={handleApprove}
                disabled={processing}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.approveButtonText}>
                  {processing ? 'Processing...' : 'Approve'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  errorText: { fontSize: 16, color: '#6b7280', marginBottom: 12 },
  backLinkText: { fontSize: 16, color: '#8b5cf6', fontWeight: '600' },
  header: {
    backgroundColor: '#6366f1',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerContent: {},
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  playerBanner: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    marginHorizontal: 20,
    marginTop: -10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  playerLabel: { fontSize: 12, color: '#6366f1' },
  playerName: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 24 },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  approvalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fbbf24',
    marginBottom: 12,
  },
  approvalIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  approvalContent: { flex: 1 },
  approvalTitle: { fontSize: 15, fontWeight: '600', color: '#92400e' },
  approvalSubtitle: { fontSize: 13, color: '#b45309', marginTop: 2 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, padding: 16, borderRadius: 14 },
  statLabel: { fontSize: 13 },
  statValue: { fontSize: 28, fontWeight: 'bold', marginTop: 4 },
  topicsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
  },
  topicsHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    padding: 12,
    backgroundColor: '#f9fafb',
  },
  topicItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  topicInfo: { flex: 1 },
  topicTitle: { fontSize: 14, fontWeight: '500', color: '#1f2937' },
  topicMeta: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  topicDuration: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  topicDurationText: { fontSize: 11, color: '#6b7280' },
  emptyTopics: {
    backgroundColor: '#f9fafb',
    padding: 24,
    borderRadius: 14,
    alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  conversationCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  conversationToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  conversationLabel: { fontSize: 15, fontWeight: '500', color: '#1f2937' },
  conversationDesc: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  suggestionBox: {
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  suggestionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 4,
  },
  suggestionText: { fontSize: 13, color: '#374151', lineHeight: 20 },
  bold: { fontWeight: 'bold' },
  resourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  resourceItemTitle: { fontSize: 15, fontWeight: '500', color: '#1f2937' },
  resourceDesc: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1f2937', marginBottom: 8 },
  modalText: { fontSize: 14, color: '#4b5563', marginBottom: 16 },
  modalInfo: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  modalInfoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  modalInfoItem: { fontSize: 13, color: '#4b5563', marginBottom: 4 },
  modalNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  modalNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#1e40af',
    lineHeight: 18,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    gap: 6,
  },
  declineButtonText: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#8b5cf6',
    gap: 6,
  },
  approveButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});

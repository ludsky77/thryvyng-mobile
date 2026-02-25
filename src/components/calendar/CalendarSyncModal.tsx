import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useUserTeams } from '../../hooks/useUserTeams';

interface CalendarSyncModalProps {
  visible: boolean;
  onClose: () => void;
}

const EDGE_FUNCTION_URL = 'https://jgivhzemwidvyykruldq.supabase.co/functions/v1/calendar-feed';

const CalendarSyncModal: React.FC<CalendarSyncModalProps> = ({ visible, onClose }) => {
  const { user } = useAuth();
  const { teams } = useUserTeams();
  const [loading, setLoading] = useState(true);
  const [syncToken, setSyncToken] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (visible && user) {
      fetchOrCreateSyncToken();
    }
  }, [visible, user]);

  const fetchOrCreateSyncToken = async () => {
    setLoading(true);
    try {
      const { data: tokenData } = await supabase
        .from('calendar_sync_tokens')
        .select('token')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .maybeSingle();

      let token = tokenData?.token;

      if (!token) {
        const { data: newToken, error } = await supabase
          .from('calendar_sync_tokens')
          .insert({ user_id: user?.id })
          .select('token')
          .single();
        if (error) throw error;
        token = newToken.token;
      }

      setSyncToken(token);
    } catch (error) {
      console.error('Error getting sync token:', error);
      Alert.alert('Error', 'Failed to generate calendar sync URL');
    } finally {
      setLoading(false);
    }
  };

  const getCalendarUrl = (teamId?: string): string => {
    const baseUrl = `${EDGE_FUNCTION_URL}?token=${syncToken}`;
    return teamId ? `${baseUrl}&team_id=${teamId}` : baseUrl;
  };

  const handleCopyUrl = (teamId?: string) => {
    if (!syncToken) return;
    const url = getCalendarUrl(teamId);
    console.log('Copying URL:', url);
    Clipboard.setString(url);
    setCopiedId(teamId || 'all');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const regenerateToken = async () => {
    Alert.alert(
      'Regenerate URL?',
      'This will invalidate your current URL. Any calendars using the old URL will stop updating.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              // Deactivate existing tokens
              await supabase
                .from('calendar_sync_tokens')
                .update({ is_active: false })
                .eq('user_id', user?.id);

              // Create new token
              const { data: newToken, error } = await supabase
                .from('calendar_sync_tokens')
                .insert({ user_id: user?.id })
                .select('token')
                .single();

              if (error) throw error;
              setSyncToken(newToken.token);
            } catch (error) {
              console.error('Error regenerating token:', error);
              Alert.alert('Error', 'Failed to regenerate URL');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>📅 Sync to Calendar</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text style={styles.loadingText}>Generating your sync URL...</Text>
              </View>
            ) : (
              <>
                {/* Description */}
                <Text style={styles.description}>
                  Subscribe to your team calendars in Google Calendar, Apple Calendar, or Outlook.
                </Text>

                {/* Calendar List */}
                <View style={styles.calendarList}>
                  <Text style={styles.sectionLabel}>📋 YOUR CALENDARS</Text>

                  {/* All Teams Option */}
                  <View style={styles.calendarItem}>
                    <View style={styles.calendarInfo}>
                      <Text style={styles.calendarIcon}>🌐</Text>
                      <View style={styles.calendarText}>
                        <Text style={styles.calendarName}>All Teams</Text>
                        <Text style={styles.calendarSubtext}>All your teams in one calendar</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.copyButtonSmall,
                        copiedId === 'all' && styles.copyButtonSmallSuccess,
                      ]}
                      onPress={() => handleCopyUrl()}
                    >
                      <Text style={styles.copyButtonSmallText}>
                        {copiedId === 'all' ? '✓' : 'Copy'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Individual Teams */}
                  {teams.map((team) => (
                    <View key={team.id} style={styles.calendarItem}>
                      <View style={styles.calendarInfo}>
                        <View
                          style={[
                            styles.teamColorDot,
                            { backgroundColor: team.color || '#5B7BB5' },
                          ]}
                        />
                        <Text style={styles.calendarName} numberOfLines={1}>
                          {team.name}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.copyButtonSmall,
                          copiedId === team.id && styles.copyButtonSmallSuccess,
                        ]}
                        onPress={() => handleCopyUrl(team.id)}
                      >
                        <Text style={styles.copyButtonSmallText}>
                          {copiedId === team.id ? '✓' : 'Copy'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>

                {/* Instructions - Collapsible */}
                <TouchableOpacity
                  style={styles.instructionsHeader}
                  onPress={() => setShowInstructions(!showInstructions)}
                >
                  <Text style={styles.instructionsTitle}>📱 How to Subscribe</Text>
                  <Text style={styles.instructionsToggle}>
                    {showInstructions ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {showInstructions && (
                  <View style={styles.instructions}>
                    <View style={styles.instructionItem}>
                      <Text style={styles.instructionApp}>Google Calendar:</Text>
                      <Text style={styles.instructionText}>
                        1. Open Google Calendar on computer{'\n'}
                        2. Click "+" next to "Other calendars"{'\n'}
                        3. Select "From URL"{'\n'}
                        4. Paste the URL and click "Add calendar"
                      </Text>
                    </View>
                    <View style={styles.instructionItem}>
                      <Text style={styles.instructionApp}>Apple Calendar (iPhone):</Text>
                      <Text style={styles.instructionText}>
                        1. Go to Settings → Calendar → Accounts{'\n'}
                        2. Add Account → Other{'\n'}
                        3. Add Subscribed Calendar{'\n'}
                        4. Paste the URL and tap Subscribe
                      </Text>
                    </View>
                    <View style={styles.instructionItem}>
                      <Text style={styles.instructionApp}>Outlook:</Text>
                      <Text style={styles.instructionText}>
                        1. Go to Calendar → Add calendar{'\n'}
                        2. Subscribe from web{'\n'}
                        3. Paste the URL and click Import
                      </Text>
                    </View>
                  </View>
                )}

                {/* Note */}
                <View style={styles.noteBox}>
                  <Text style={styles.noteText}>
                    ℹ️ Calendar apps refresh every few hours. New events may take up to 24 hours to appear.
                  </Text>
                </View>

                {/* Regenerate */}
                <TouchableOpacity style={styles.regenerateButton} onPress={regenerateToken}>
                  <Text style={styles.regenerateText}>🔄 Regenerate URL</Text>
                </TouchableOpacity>

                {/* Security Note */}
                <View style={styles.securityNote}>
                  <Text style={styles.securityText}>
                    🔒 This URL is private. Don't share it with others.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: 22,
    color: '#9CA3AF',
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 14,
  },
  description: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  calendarList: {
    marginBottom: 20,
  },
  sectionLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  calendarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  calendarInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  calendarIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  calendarText: {
    flex: 1,
  },
  calendarName: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  calendarSubtext: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  teamColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  copyButtonSmall: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  copyButtonSmallSuccess: {
    backgroundColor: '#10B981',
  },
  copyButtonSmallText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  instructionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 8,
  },
  instructionsTitle: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  instructionsToggle: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  instructions: {
    marginBottom: 20,
    marginTop: 8,
  },
  instructionItem: {
    marginBottom: 14,
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
    borderRadius: 10,
    padding: 14,
  },
  instructionApp: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  instructionText: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 20,
  },
  noteBox: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  noteText: {
    color: '#C4B5FD',
    fontSize: 12,
    lineHeight: 18,
  },
  regenerateButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12,
  },
  regenerateText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  securityNote: {
    marginBottom: 30,
  },
  securityText: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
  },
});

export default CalendarSyncModal;

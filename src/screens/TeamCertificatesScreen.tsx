import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../lib/supabase';

interface AwardType {
  award_name: string;
  award_color: string;
}

interface Certificate {
  id: string;
  player_id: string;
  player_name: string | null;
  jersey_number: number | null;
  generated_certificate_url: string | null;
  created_at: string;
  award_types: AwardType | null;
}

export default function TeamCertificatesScreen({ route, navigation }: any) {
  const { teamId } = route.params || {};
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCertificates();
  }, [teamId]);

  const fetchCertificates = async () => {
    if (!teamId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('player_evaluations')
        .select(`
          id,
          player_id,
          player_name,
          jersey_number,
          generated_certificate_url,
          created_at,
          award_types (
            award_name,
            award_color
          )
        `)
        .eq('team_id', teamId)
        .not('generated_certificate_url', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCertificates((data || []) as Certificate[]);
    } catch (err) {
      console.error('Error fetching certificates:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderCertificate = ({ item }: { item: Certificate }) => (
    <TouchableOpacity
      style={styles.certCard}
      onPress={() => navigation.navigate('CertificateViewer', { evaluationId: item.id })}
    >
      <Text style={styles.playerName}>{item.player_name || 'Unknown Player'}</Text>
      {item.award_types?.award_name && (
        <View
          style={[
            styles.awardBadge,
            { backgroundColor: item.award_types.award_color || '#8b5cf6' },
          ]}
        >
          <Text style={styles.awardText}>{item.award_types.award_name}</Text>
        </View>
      )}
      <Text style={styles.viewCert}>View Certificate →</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🏆 Team Certificates</Text>
        <Text style={styles.subtitle}>{certificates.length} certificates</Text>
      </View>

      {certificates.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No certificates yet</Text>
          <Text style={styles.emptySubtext}>
            Certificates are generated after evaluations are completed
          </Text>
        </View>
      ) : (
        <FlatList
          data={certificates}
          keyExtractor={(item) => item.id}
          renderItem={renderCertificate}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
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
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
  },
  certCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  awardBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  awardText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  viewCert: {
    fontSize: 14,
    color: '#a78bfa',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
});

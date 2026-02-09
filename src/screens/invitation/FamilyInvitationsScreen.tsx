import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFamilyInvitations } from '../../hooks/useFamilyInvitations';
import type { RootStackParamList } from '../../navigation/linking';

interface RouteParams {
  email: string;
}

export default function FamilyInvitationsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute();
  const { email } = (route.params as RouteParams) || {};
  
  const { invitations, loading, error, state, updateSelection, calculateTotals } = useFamilyInvitations(email);
  
  // Track which players are selected for checkout
  const selectedCount = Object.values(state.selections).filter(s => s.selected).length;
  const totals = calculateTotals();
  
  const handleTogglePlayer = (placementId: string) => {
    const current = state.selections[placementId];
    updateSelection(placementId, { selected: !current?.selected });
  };
  
  const handleSelectInvitation = (token: string) => {
    // Navigate to single invitation flow
    navigation.navigate('Invitation' as any, { token } as any);
  };
  
  const handleBack = () => {
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ade80" />
          <Text style={styles.loadingText}>Loading invitations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Family Invitations</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (invitations.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Family Invitations</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="mail-open-outline" size={48} color="#888" />
          <Text style={styles.emptyText}>No pending invitations</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Family Invitations</Text>
        <View style={{ width: 40 }} />
      </View>
      
      {/* Subtitle */}
      <View style={styles.subtitle}>
        <Text style={styles.subtitleText}>
          {invitations.length} player{invitations.length > 1 ? 's' : ''} invited • {selectedCount} selected
        </Text>
      </View>
      
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Player Cards */}
        {invitations.map((inv) => {
          const isSelected = state.selections[inv.placement.id]?.selected ?? true;
          const pkg = inv.packages[0];
          
          return (
            <View
              key={inv.placement.id}
              style={[styles.playerCard, isSelected && styles.playerCardSelected]}
            >
              <View style={styles.playerCardHeader}>
                <TouchableOpacity
                  onPress={() => handleTogglePlayer(inv.placement.id)}
                  style={styles.checkboxArea}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      isSelected && styles.checkboxBoxSelected,
                    ]}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={14} color="#000" />
                    )}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.playerInfo}
                  onPress={() =>
                    handleSelectInvitation(inv.placement.invitation_token || '')
                  }
                  activeOpacity={0.7}
                >
                  <Text style={styles.playerName}>
                    {inv.player.first_name} {inv.player.last_name}
                  </Text>
                  <View style={styles.teamRow}>
                    <Ionicons name="arrow-forward" size={14} color="#4ade80" />
                    <Text style={styles.teamName}>{inv.team.name}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() =>
                    handleSelectInvitation(inv.placement.invitation_token || '')
                  }
                >
                  <Ionicons name="chevron-forward" size={20} color="#888" />
                </TouchableOpacity>
              </View>

              {pkg && (
                <View style={styles.packageInfo}>
                  <Text style={styles.packageName}>{pkg.name}</Text>
                  <Text style={styles.packagePrice}>${pkg.price.toFixed(2)}</Text>
                </View>
              )}
            </View>
          );
        })}
        
        {/* Totals Preview */}
        {invitations.length > 1 && (
          <View style={styles.totalsCard}>
            <Text style={styles.totalsTitle}>Combined Total</Text>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>${totals.subtotal.toFixed(2)}</Text>
            </View>
            {totals.siblingDiscount > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.discountLabel}>2+ Players Discount</Text>
                <Text style={styles.discountValue}>-${totals.siblingDiscount.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.totalsDivider} />
            <View style={styles.totalsRow}>
              <Text style={styles.totalsFinalLabel}>Total</Text>
              <Text style={styles.totalsFinalValue}>${totals.total.toFixed(2)}</Text>
            </View>
          </View>
        )}
        
        {/* Info Note */}
        <View style={styles.infoNote}>
          <Ionicons name="information-circle-outline" size={16} color="#888" />
          <Text style={styles.infoNoteText}>
            Tap a player to view their invitation and complete registration
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  subtitleText: {
    color: '#888',
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  playerCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  playerCardSelected: {
    borderColor: '#4ade80',
  },
  playerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  teamName: {
    color: '#4ade80',
    fontSize: 14,
  },
  packageInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  packageName: {
    color: '#888',
    fontSize: 13,
  },
  packagePrice: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  totalsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  totalsTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  totalsLabel: {
    color: '#888',
    fontSize: 13,
  },
  totalsValue: {
    color: '#fff',
    fontSize: 13,
  },
  discountLabel: {
    color: '#4ade80',
    fontSize: 13,
  },
  discountValue: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '600',
  },
  totalsDivider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 8,
  },
  totalsFinalLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  totalsFinalValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  infoNoteText: {
    color: '#888',
    fontSize: 12,
    flex: 1,
  },
  checkboxArea: {
    marginRight: 12,
    padding: 4,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  checkboxBoxSelected: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
});

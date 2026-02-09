import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { InvitationData } from '../../types/invitation';

interface Props {
  invitation: InvitationData;
  isSelected: boolean;
  selectedPackageId: string | null;
  selectedPlanId: string | null;
  onToggleSelect?: () => void;
  onPackageChange?: (packageId: string) => void;
  showPackageSelector?: boolean; // Only show in Review step
  compact?: boolean; // For checkout summary
}

export default function PlayerInvitationCard({
  invitation,
  isSelected,
  selectedPackageId,
  selectedPlanId,
  onToggleSelect,
  onPackageChange,
  showPackageSelector = false,
  compact = false,
}: Props) {
  const { player, team, packages } = invitation;

  // Get selected package details
  const selectedPackage = packages.find(p => p.id === selectedPackageId);
  const selectedPlan = selectedPackage?.payment_plans.find(p => p.id === selectedPlanId);

  // If only one package, it's pre-assigned
  const hasMultiplePackages = packages.length > 1;

  if (compact) {
    return (
      <View style={styles.compactCard}>
        <View style={styles.compactHeader}>
          <Text style={styles.compactPlayerName}>
            {player.first_name} {player.last_name}
          </Text>
          <Text style={styles.compactPrice}>
            ${selectedPackage?.price.toFixed(2) || '0.00'}
          </Text>
        </View>
        <Text style={styles.compactTeam}>{team.name}</Text>
        {selectedPlan && selectedPlan.num_installments === 0 && (
          <View style={styles.payInFullBadge}>
            <Text style={styles.payInFullText}>Pay in Full</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.card, isSelected && styles.cardSelected]}>
      {/* Selection checkbox (for family view) */}
      {onToggleSelect && (
        <TouchableOpacity style={styles.checkbox} onPress={onToggleSelect}>
          <View style={[styles.checkboxBox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Ionicons name="checkmark" size={16} color="#000" />}
          </View>
        </TouchableOpacity>
      )}

      {/* Player Info */}
      <View style={styles.playerSection}>
        <View style={styles.playerAvatar}>
          {player.photo_url ? (
            <Image source={{ uri: player.photo_url }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarInitials}>
              {player.first_name[0]}{player.last_name[0]}
            </Text>
          )}
        </View>

        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>
            {player.first_name} {player.last_name}
          </Text>
          <View style={styles.teamBadge}>
            <Ionicons name="shield" size={14} color="#4ade80" />
            <Text style={styles.teamName}>{team.name}</Text>
          </View>
        </View>

        {/* Price */}
        <View style={styles.priceSection}>
          <Text style={styles.priceLabel}>Package Price</Text>
          <Text style={styles.priceValue}>
            ${selectedPackage?.price.toFixed(2) || '0.00'}
          </Text>
        </View>
      </View>

      {/* Package info */}
      <View style={styles.packageSection}>
        {hasMultiplePackages && showPackageSelector ? (
          // Multiple packages - show selector
          <View style={styles.packageSelector}>
            <Text style={styles.packageSelectorLabel}>Select Package:</Text>
            {packages.map(pkg => (
              <TouchableOpacity
                key={pkg.id}
                style={[
                  styles.packageOption,
                  selectedPackageId === pkg.id && styles.packageOptionSelected,
                ]}
                onPress={() => onPackageChange?.(pkg.id)}
              >
                <View style={styles.packageOptionRadio}>
                  {selectedPackageId === pkg.id && (
                    <View style={styles.packageOptionRadioInner} />
                  )}
                </View>
                <View style={styles.packageOptionInfo}>
                  <Text style={styles.packageOptionName}>{pkg.name}</Text>
                  <Text style={styles.packageOptionPrice}>${pkg.price.toFixed(2)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          // Single package - show as pre-assigned
          <View style={styles.packagePreAssigned}>
            <Ionicons name="pricetag" size={16} color="#888" />
            <Text style={styles.packageName}>
              {selectedPackage?.name || 'Package'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardSelected: {
    borderColor: '#4ade80',
  },
  checkbox: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  playerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  teamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamName: {
    color: '#4ade80',
    fontSize: 14,
    marginLeft: 6,
  },
  priceSection: {
    alignItems: 'flex-end',
  },
  priceLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 2,
  },
  priceValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  packageSection: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
    marginTop: 4,
  },
  packagePreAssigned: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  packageName: {
    color: '#888',
    fontSize: 14,
    marginLeft: 8,
  },
  packageSelector: {
    gap: 8,
  },
  packageSelectorLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  packageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0f0f0f',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  packageOptionSelected: {
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
  },
  packageOptionRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  packageOptionRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
  },
  packageOptionInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  packageOptionName: {
    color: '#fff',
    fontSize: 14,
  },
  packageOptionPrice: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '600',
  },
  // Compact styles
  compactCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactPlayerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  compactPrice: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  compactTeam: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  payInFullBadge: {
    backgroundColor: '#4ade80',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  payInFullText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '600',
  },
});

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';

export default function CartScreen() {
  const navigation = useNavigation();
  const { user, profile } = useAuth();
  const {
    items,
    itemCount,
    subtotal,
    referralCode,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useCart();

  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Calculate team earnings preview
  const calculateTeamEarnings = () => {
    return items.reduce((total, item) => {
      const cvPercent = item.cv_percentage || 50;
      const teamSplit = 50; // Default team split
      const cv = item.price * item.quantity * (cvPercent / 100);
      return total + cv * (teamSplit / 100);
    }, 0);
  };

  const teamEarnings = calculateTeamEarnings();

  const handleQuantityChange = (
    id: string,
    type: 'product' | 'course' | 'donation',
    delta: number
  ) => {
    const item = items.find((i) => i.id === id && i.type === type);
    if (item) {
      updateQuantity(id, type, item.quantity + delta);
    }
  };

  const handleRemoveItem = (
    id: string,
    type: 'product' | 'course' | 'donation',
    name: string
  ) => {
    Alert.alert(
      'Remove Item',
      `Remove "${name}" from your cart?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeFromCart(id, type),
        },
      ]
    );
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;

    setIsCheckingOut(true);

    try {
      // Prepare items for checkout
      const checkoutItems = items.map((item) => ({
        type: item.type,
        id: item.id,
        quantity: item.quantity,
        price: item.price,
      }));

      // Get referral code - try from cart context, then from user's player
      let finalReferralCode = referralCode;

      if (!finalReferralCode && user?.email) {
        const { data: playerData } = await supabase
          .from('players')
          .select('referral_code')
          .eq('parent_email', user.email)
          .limit(1)
          .maybeSingle();

        if (playerData?.referral_code) {
          finalReferralCode = playerData.referral_code;
        }
      }

      // Call create-checkout-session Edge Function
      const { data, error } = await supabase.functions.invoke(
        'create-checkout-session',
        {
          body: {
            items: checkoutItems,
            customer_email: user?.email || '',
            customer_name: profile?.full_name || '',
            referral_code: finalReferralCode,
            success_url: 'thryvyng://checkout-success',
            cancel_url: 'thryvyng://checkout-cancel',
          },
        }
      );

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          'thryvyng://checkout-success'
        );

        if (result.type === 'success') {
          clearCart();
          navigation.navigate('CheckoutSuccess' as never, {
            sessionId: data.session_id,
          } as never);
        } else if (result.type === 'cancel') {
          console.log('[Cart] Checkout cancelled by user');
        }
      }
    } catch (error: unknown) {
      console.error('[Cart] Checkout error:', error);
      Alert.alert(
        'Checkout Error',
        error instanceof Error ? error.message : 'Unable to start checkout. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleContinueShopping = () => {
    navigation.navigate('ProductStore' as never);
  };

  const renderCartItem = ({ item }: { item: (typeof items)[0] }) => (
    <View style={styles.cartItem}>
      <View style={styles.itemImageContainer}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.itemImage} />
        ) : (
          <View style={styles.itemImagePlaceholder}>
            <Ionicons name="cube-outline" size={24} color="#475569" />
          </View>
        )}
      </View>

      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>

        <View style={styles.quantityRow}>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => handleQuantityChange(item.id, item.type, -1)}
            disabled={item.quantity <= 1}
          >
            <Ionicons
              name="remove"
              size={18}
              color={item.quantity <= 1 ? '#475569' : '#FFFFFF'}
            />
          </TouchableOpacity>

          <Text style={styles.quantityText}>{item.quantity}</Text>

          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => handleQuantityChange(item.id, item.type, 1)}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => handleRemoveItem(item.id, item.type, item.name)}
      >
        <Ionicons name="trash-outline" size={20} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );

  const renderEmptyCart = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="cart-outline" size={80} color="#475569" />
      <Text style={styles.emptyTitle}>Your cart is empty</Text>
      <Text style={styles.emptySubtitle}>
        Add some items to support your team!
      </Text>
      <TouchableOpacity
        style={styles.shopButton}
        onPress={handleContinueShopping}
      >
        <Text style={styles.shopButtonText}>Browse Store</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFooter = () => {
    if (items.length === 0) return null;

    return (
      <View style={styles.footer}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Subtotal ({itemCount} item{itemCount !== 1 ? 's' : ''})
            </Text>
            <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <View style={styles.earningsLabel}>
              <Ionicons name="heart" size={16} color="#10B981" />
              <Text style={styles.earningsText}>Team Earnings</Text>
            </View>
            <Text style={styles.earningsValue}>
              ${teamEarnings.toFixed(2)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.checkoutButton,
            isCheckingOut && styles.checkoutButtonDisabled,
          ]}
          onPress={handleCheckout}
          disabled={isCheckingOut}
        >
          {isCheckingOut ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="lock-closed" size={20} color="#FFFFFF" />
              <Text style={styles.checkoutButtonText}>
                Proceed to Checkout
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinueShopping}
        >
          <Ionicons name="arrow-back" size={18} color="#8B5CF6" />
          <Text style={styles.continueButtonText}>Continue Shopping</Text>
        </TouchableOpacity>

        <View style={styles.secureNote}>
          <Ionicons name="shield-checkmark" size={14} color="#64748b" />
          <Text style={styles.secureNoteText}>
            Secure payment powered by Stripe
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Your Cart</Text>

        <View style={styles.headerButton} />
      </View>

      <FlatList
        data={items}
        renderItem={renderCartItem}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyCart}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },

  listContent: {
    flexGrow: 1,
    padding: 16,
  },

  cartItem: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  itemImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  itemImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  itemImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  itemName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemPrice: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    width: 32,
    height: 32,
    backgroundColor: '#334155',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 16,
    minWidth: 24,
    textAlign: 'center',
  },
  removeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 16,
    marginTop: 8,
    marginBottom: 24,
  },
  shopButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  shopButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  footer: {
    paddingTop: 16,
  },
  summaryCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: 16,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 12,
  },
  earningsLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  earningsText: {
    color: '#10B981',
    fontSize: 14,
    marginLeft: 6,
  },
  earningsValue: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
  },
  checkoutButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  checkoutButtonDisabled: {
    opacity: 0.7,
  },
  checkoutButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  continueButtonText: {
    color: '#8B5CF6',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 6,
  },
  secureNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secureNoteText: {
    color: '#64748b',
    fontSize: 12,
    marginLeft: 6,
  },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useCart } from '../contexts/CartContext';

const { width } = Dimensions.get('window');

interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  cv_percentage: number;
  image_url: string | null;
  inventory_count: number;
  status: string;
  commission_splits?: {
    platform?: number;
    team?: number;
    club?: number;
    sales_director?: number;
    vendor?: number;
  } | null;
}

const DEFAULT_SPLITS = {
  platform: 20,
  team: 50,
  club: 15,
  sales_director: 10,
  vendor: 5,
};

export default function ProductDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { productId } = (route.params as { productId: string }) || {
    productId: '',
  };

  const { itemCount, addToCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [showAddedToast, setShowAddedToast] = useState(false);

  useEffect(() => {
    fetchProduct();
  }, [productId]);

  const fetchProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error) throw error;
      setProduct(data);
    } catch (error) {
      console.error('[ProductDetail] Error fetching product:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuantityChange = (delta: number) => {
    const newQuantity = quantity + delta;
    if (newQuantity >= 1 && newQuantity <= (product?.inventory_count ?? 99)) {
      setQuantity(newQuantity);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;

    addToCart({
      type: 'product',
      id: product.id,
      name: product.name,
      price: product.price,
      cv_percentage: product.cv_percentage,
      image_url: product.image_url || undefined,
      quantity,
    });

    setShowAddedToast(true);
    setTimeout(() => setShowAddedToast(false), 2000);

    setQuantity(1);
  };

  const handleCartPress = () => {
    (navigation as any).navigate('Cart');
  };

  const getCommissionPreview = () => {
    if (!product) return { team: 0, club: 0, teamPercent: 0, clubPercent: 0 };

    const splits = product.commission_splits || DEFAULT_SPLITS;
    const cv =
      product.price * quantity * ((product.cv_percentage || 0) / 100);

    return {
      team: cv * ((splits.team || 0) / 100),
      club: cv * ((splits.club || 0) / 100),
      teamPercent: splits.team || 0,
      clubPercent: splits.club || 0,
    };
  };

  const commission = getCommissionPreview();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading product...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Product</Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <Text style={styles.errorTitle}>Product not found</Text>
          <TouchableOpacity
            style={styles.errorButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {product.name}
        </Text>

        <TouchableOpacity style={styles.headerButton} onPress={handleCartPress}>
          <Ionicons name="cart-outline" size={24} color="#FFFFFF" />
          {itemCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>
                {itemCount > 99 ? '99+' : itemCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {showAddedToast && (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
          <Text style={styles.toastText}>Added to cart!</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.imageContainer}>
          {product.image_url ? (
            <Image source={{ uri: product.image_url }} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={80} color="#475569" />
            </View>
          )}
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{product.category}</Text>
          </View>

          <Text style={styles.productName}>{product.name}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.productPrice}>
              ${product.price.toFixed(2)}
            </Text>
            <Text style={styles.stockText}>
              {product.inventory_count > 0
                ? `${product.inventory_count} in stock`
                : 'Out of stock'}
            </Text>
          </View>

          <View style={styles.quantitySection}>
            <Text style={styles.sectionLabel}>Quantity</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  quantity <= 1 && styles.quantityButtonDisabled,
                ]}
                onPress={() => handleQuantityChange(-1)}
                disabled={quantity <= 1}
              >
                <Ionicons
                  name="remove"
                  size={24}
                  color={quantity <= 1 ? '#475569' : '#FFFFFF'}
                />
              </TouchableOpacity>

              <Text style={styles.quantityText}>{quantity}</Text>

              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  quantity >= product.inventory_count &&
                    styles.quantityButtonDisabled,
                ]}
                onPress={() => handleQuantityChange(1)}
                disabled={quantity >= product.inventory_count}
              >
                <Ionicons
                  name="add"
                  size={24}
                  color={
                    quantity >= product.inventory_count ? '#475569' : '#FFFFFF'
                  }
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.commissionCard}>
            <View style={styles.commissionHeader}>
              <Ionicons name="heart" size={20} color="#10B981" />
              <Text style={styles.commissionTitle}>Support Your Team</Text>
            </View>
            <View style={styles.commissionRow}>
              <Text style={styles.commissionLabel}>Your team earns:</Text>
              <Text style={styles.commissionValue}>
                ${commission.team.toFixed(2)}{' '}
                <Text style={styles.commissionPercent}>
                  ({commission.teamPercent}% commission)
                </Text>
              </Text>
            </View>
            <View style={styles.commissionRow}>
              <Text style={styles.commissionLabel}>Your club earns:</Text>
              <Text style={styles.commissionValue}>
                ${commission.club.toFixed(2)}{' '}
                <Text style={styles.commissionPercent}>
                  ({commission.clubPercent}% commission)
                </Text>
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.addToCartButton,
              product.inventory_count <= 0 && styles.addToCartButtonDisabled,
            ]}
            onPress={handleAddToCart}
            disabled={product.inventory_count <= 0}
          >
            <Ionicons name="cart-outline" size={24} color="#FFFFFF" />
            <Text style={styles.addToCartText}>
              {product.inventory_count <= 0
                ? 'Out of Stock'
                : `Add to Cart · $${(product.price * quantity).toFixed(2)}`}
            </Text>
          </TouchableOpacity>

          {product.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionLabel}>Description</Text>
              <Text style={styles.descriptionText}>{product.description}</Text>
            </View>
          )}

          <View style={styles.cvInfo}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color="#64748b"
            />
            <Text style={styles.cvInfoText}>
              {(product.cv_percentage ?? 0)}% of purchase price supports the
              team
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 16,
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  errorButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
  },
  errorButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  cartBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  toast: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },

  scrollView: {
    flex: 1,
  },
  imageContainer: {
    width,
    height: width * 0.8,
    backgroundColor: '#1e293b',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },

  infoContainer: {
    padding: 20,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 12,
  },
  categoryBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  productName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  productPrice: {
    color: '#10B981',
    fontSize: 28,
    fontWeight: '700',
  },
  stockText: {
    color: '#10B981',
    fontSize: 14,
  },

  quantitySection: {
    marginBottom: 20,
  },
  sectionLabel: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    width: 48,
    height: 48,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonDisabled: {
    opacity: 0.5,
  },
  quantityText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginHorizontal: 24,
    minWidth: 40,
    textAlign: 'center',
  },

  commissionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  commissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  commissionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  commissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commissionLabel: {
    color: '#94a3b8',
    fontSize: 14,
  },
  commissionValue: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
  },
  commissionPercent: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '400',
  },

  addToCartButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  addToCartButtonDisabled: {
    backgroundColor: '#475569',
  },
  addToCartText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },

  descriptionSection: {
    marginBottom: 20,
  },
  descriptionText: {
    color: '#cbd5e1',
    fontSize: 16,
    lineHeight: 24,
  },

  cvInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  cvInfoText: {
    color: '#64748b',
    fontSize: 13,
    marginLeft: 8,
  },
});

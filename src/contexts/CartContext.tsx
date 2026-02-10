import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Match web app CartItem structure exactly
export interface CartItem {
  type: 'course' | 'product' | 'donation';
  id: string;
  name: string;
  price: number;
  cv_percentage?: number;
  image_url?: string;
  variant?: string;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  referralCode: string | null;
  isLoading: boolean;
  itemCount: number;
  subtotal: number;
  addToCart: (
    item: Omit<CartItem, 'quantity'> & { quantity?: number },
  ) => void;
  removeFromCart: (id: string, type: CartItem['type']) => void;
  updateQuantity: (
    id: string,
    type: CartItem['type'],
    quantity: number,
  ) => void;
  clearCart: () => void;
  setReferralCode: (code: string | null) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'thryvyng_cart';
const REFERRAL_STORAGE_KEY = 'thryvyng_referral_code';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [referralCode, setReferralCodeState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load cart from AsyncStorage on mount
  useEffect(() => {
    const loadCart = async () => {
      try {
        const [cartData, referralData] = await Promise.all([
          AsyncStorage.getItem(CART_STORAGE_KEY),
          AsyncStorage.getItem(REFERRAL_STORAGE_KEY),
        ]);

        if (cartData) {
          const parsed = JSON.parse(cartData);
          setItems(Array.isArray(parsed) ? parsed : []);
        }

        if (referralData) {
          setReferralCodeState(referralData);
        }
      } catch (error) {
        console.error('[Cart] Error loading cart:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadCart();
  }, []);

  // Persist cart to AsyncStorage whenever items change
  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items)).catch(
        (error) => console.error('[Cart] Error saving cart:', error),
      );
    }
  }, [items, isLoading]);

  // Calculate derived values
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const addToCart = useCallback(
    (newItem: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
      const quantity = newItem.quantity || 1;

      setItems((current) => {
        const existingIndex = current.findIndex(
          (item) => item.id === newItem.id && item.type === newItem.type,
        );

        if (existingIndex >= 0) {
          if (newItem.type === 'product') {
            const updated = [...current];
            updated[existingIndex] = {
              ...updated[existingIndex],
              quantity: updated[existingIndex].quantity + quantity,
            };
            return updated;
          }
          return current;
        }

        return [...current, { ...newItem, quantity }];
      });
    },
    [],
  );

  const removeFromCart = useCallback(
    (id: string, type: CartItem['type']) => {
      setItems((current) =>
        current.filter((item) => !(item.id === id && item.type === type)),
      );
    },
    [],
  );

  const updateQuantity = useCallback(
    (id: string, type: CartItem['type'], quantity: number) => {
      if (quantity < 1) {
        removeFromCart(id, type);
        return;
      }

      setItems((current) =>
        current.map((item) =>
          item.id === id && item.type === type
            ? { ...item, quantity }
            : item,
        ),
      );
    },
    [removeFromCart],
  );

  const clearCart = useCallback(() => {
    setItems([]);
    AsyncStorage.removeItem(CART_STORAGE_KEY).catch((error) =>
      console.error('[Cart] Error clearing cart:', error),
    );
  }, []);

  const setReferralCode = useCallback((code: string | null) => {
    setReferralCodeState(code);
    if (code) {
      AsyncStorage.setItem(REFERRAL_STORAGE_KEY, code).catch((error) =>
        console.error('[Cart] Error saving referral code:', error),
      );
    } else {
      AsyncStorage.removeItem(REFERRAL_STORAGE_KEY).catch((error) =>
        console.error('[Cart] Error removing referral code:', error),
      );
    }
  }, []);

  return (
    <CartContext.Provider
      value={{
        items,
        referralCode,
        isLoading,
        itemCount,
        subtotal,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        setReferralCode,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

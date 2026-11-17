// Hooks to read and change the cart. The cart lives on the server; TanStack Query keeps a copy
// in its cache under the key ['cart', cartId], shared by the header and the pages.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCart, getCart, removeCartItem, setCartItemQuantity, type Cart } from '../api/cart';
import { ApiError } from '../api/http';
import { forgetCartId, readCartId, saveCartId, useCartId } from './cartStorage';

/** Reads the cart of this browser. `cart` is null when there is no cart (yet, or any more). */
export function useCart() {
  const cartId = useCartId();

  const query = useQuery({
    queryKey: ['cart', cartId],
    queryFn: async ({ signal }): Promise<Cart | null> => {
      try {
        return await getCart(cartId as string, signal);
      } catch (error) {
        // Carts expire after 7 days. A 404 means "this cart is gone": forget the ID and
        // behave as if the cart were empty. The next "add to cart" creates a new one.
        if (error instanceof ApiError && error.status === 404) {
          forgetCartId();
          return null;
        }
        throw error;
      }
    },
    // No cart is created until the first product is added, so without an ID there is
    // nothing to ask the API.
    enabled: cartId !== null,
  });

  return {
    cart: query.data ?? null,
    // A disabled query stays "pending" forever, so only call it loading when there is an ID.
    isLoading: cartId !== null && query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Sets the quantity of one product in the cart (the API replaces the quantity, it does not
 * add to it). Creates the cart first when this browser does not have one.
 */
export function useSetItemQuantity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, quantity }: { productId: number; quantity: number }) => {
      const cartId = readCartId() ?? (await createCart()).id;
      return setCartItemQuantity(cartId, productId, quantity);
    },
    onSuccess: (cart) => {
      // The API answers with the whole updated cart: put it in the cache instead of asking
      // again. The ID is saved AFTER that, so whoever starts reading the new cart finds it.
      queryClient.setQueryData(['cart', cart.id], cart);
      saveCartId(cart.id);
    },
    // The request may have failed because the cart expired: read it again to find out.
    onError: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });
}

/** Removes one product from the cart. */
export function useRemoveItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cartId, productId }: { cartId: string; productId: number }) =>
      removeCartItem(cartId, productId),
    onSuccess: (cart) => queryClient.setQueryData(['cart', cart.id], cart),
    onError: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });
}

/** The ONLY product fields shoppers can see. Costs, internal ids and exact stock never leave the server. */
export const toPublicProduct = (product) => ({
  sku: product.sku,
  name: product.name,
  description: product.description,
  category: product.category,
  images: product.images,
  prices: product.prices,
  freeGift: { enabled: Boolean(product.freeGift?.enabled), name: product.freeGift?.name ?? '' },
  seo: { metaTitle: product.seo?.metaTitle ?? '', metaDescription: product.seo?.metaDescription ?? '' },
  inStock: product.stock > 0,
});

import { useState } from 'react';

interface ProductImageProps {
  imageUrl: string | null;
  /** Product name: gives the placeholder its initial. */
  name: string;
  /** Alternative text. Leave it empty when the name is already written next to the image. */
  alt?: string;
}

/**
 * Square product picture. When the product has no image (or it fails to load) it shows a
 * neutral block with the first letter of the product name instead.
 */
export function ProductImage({ imageUrl, name, alt = '' }: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  if (imageUrl === null || failed) {
    return (
      <div className="product-image product-image--placeholder" aria-hidden="true">
        {name.trim().charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      className="product-image"
      src={imageUrl}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

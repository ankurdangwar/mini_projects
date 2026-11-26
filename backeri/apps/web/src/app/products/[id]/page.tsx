import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/api';
import type { ProductDTO } from '@/lib/types';
import { ProductDetailClient } from '@/components/ProductDetailClient';

export const dynamic = 'force-dynamic';

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const { product } = await serverFetch<{ product: ProductDTO }>(
      `/api/v1/products/${encodeURIComponent(id)}`
    );
    return <ProductDetailClient product={product} />;
  } catch {
    notFound();
  }
}

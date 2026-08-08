import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import type { AmazonAdsGateway } from './amazon-ads-gateway';
import type { operationSchema } from './operation-schema';
import { type ProductResolver, pendingRankWranglerProductResolver } from './product-resolver';

export type OperationDatabase = PgDatabase<PgQueryResultHKT, typeof operationSchema>;

export type OperationCredentialKind = 'api_key' | 'oauth' | 'session';

export type OperationPrincipal = {
    accessibleAccountIds: readonly string[];
    credentialKind: OperationCredentialKind;
    merchbaseUserId: string;
};

export type OperationContext = {
    amazonAds: AmazonAdsGateway;
    db: OperationDatabase;
    principal?: OperationPrincipal;
    products: ProductResolver;
};

export const createOperationContext = ({
    amazonAds,
    db,
    principal,
    products = pendingRankWranglerProductResolver,
}: Omit<OperationContext, 'products'> & { products?: ProductResolver }): OperationContext => ({
    amazonAds,
    db,
    principal,
    products,
});

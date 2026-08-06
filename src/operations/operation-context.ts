import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import type { AmazonAdsGateway } from './amazon-ads-gateway';
import type { operationSchema } from './operation-schema';

export type OperationDatabase = PgDatabase<PgQueryResultHKT, typeof operationSchema>;

export type OperationContext = {
    amazonAds: AmazonAdsGateway;
    db: OperationDatabase;
};

export const createOperationContext = ({ amazonAds, db }: OperationContext): OperationContext => ({ amazonAds, db });

import { z } from 'zod';
import type { ApiRegion } from './config';
import { spRequest } from './sp-api';

const productMetadataResponseSchema = z
    .object({
        ProductMetadataList: z.array(
            z
                .object({
                    asin: z.string(),
                    title: z.string().nullish(),
                })
                .passthrough()
        ),
    })
    .passthrough();

export const getProductMetadata = async (input: { profileId: number; asins: string[]; region: ApiRegion }) => {
    if (input.asins.length === 0 || input.asins.length > 300) {
        throw new Error('Product metadata requests require between 1 and 300 ASINs.');
    }

    const response = await spRequest(
        {
            apiName: 'getProductMetadata',
            path: '/product/metadata',
            profileId: input.profileId,
            body: {
                asins: input.asins,
                checkItemDetails: true,
                pageIndex: 0,
                pageSize: input.asins.length,
            },
            itemCount: input.asins.length,
            accept: 'application/vnd.productmetadataresponse.v1+json',
            contentType: 'application/vnd.productmetadatarequest.v1+json',
            responseSchema: productMetadataResponseSchema,
        },
        input.region
    );

    return response.ProductMetadataList.map(product => ({ asin: product.asin, title: product.title ?? null }));
};

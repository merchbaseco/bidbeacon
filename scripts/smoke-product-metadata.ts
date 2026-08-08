import { z } from 'zod';
import { getApiBaseUrl } from '@/amazon-ads/config';
import { getProductMetadata } from '@/amazon-ads/get-product-metadata';

const inputSchema = z.tuple([z.coerce.number().int().positive(), z.string().regex(/^[A-Z0-9]{10}$/), z.enum(['na', 'eu', 'fe']).default('na')]);

const main = async () => {
    const [profileId, asin, region] = inputSchema.parse(process.argv.slice(2));
    const products = await getProductMetadata({ profileId, asins: [asin], region });
    const product = products.find(candidate => candidate.asin === asin);
    if (!product?.title?.trim()) {
        throw new Error(`Amazon returned no titled Product Metadata record for ${asin} from ${getApiBaseUrl(region)}.`);
    }

    console.log(JSON.stringify({ ok: true, profileId, region, product }, null, 2));
};

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });

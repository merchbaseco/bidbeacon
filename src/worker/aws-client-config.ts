/**
 * Explicit AWS client configuration.
 *
 * The SDK's default credential chain reads the literal names AWS_ACCESS_KEY_ID
 * and AWS_SECRET_ACCESS_KEY. This repo owns its credentials under canonical
 * BIDBEACON_* names, so the chain would find nothing — the credentials are
 * passed explicitly instead. Keep this the single place that maps the schema's
 * names onto the SDK.
 */
export const awsClientConfig = () => {
    const region = process.env.BIDBEACON_AWS_REGION;
    const accessKeyId = process.env.BIDBEACON_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.BIDBEACON_AWS_SECRET_ACCESS_KEY;

    if (!region) {
        throw new Error('BIDBEACON_AWS_REGION is required');
    }

    if (!(accessKeyId && secretAccessKey)) {
        throw new Error('BIDBEACON_AWS_ACCESS_KEY_ID and BIDBEACON_AWS_SECRET_ACCESS_KEY are required');
    }

    return { region, credentials: { accessKeyId, secretAccessKey } };
};

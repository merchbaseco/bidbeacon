import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import { createAd, createAdGroup, updateAd, updateAdGroup } from '@/operations/ad-mutations';
import { adCreateInputSchema, adGroupCreateInputSchema, adGroupUpdateInputSchema, adUpdateInputSchema, canonicalAdGroupSchema, canonicalAdSchema } from '@/operations/ad-schemas';
import { listAdvertiserAccounts } from '@/operations/advertiser-accounts';
import { createCampaign, createSponsoredProductsCampaign, updateCampaign } from '@/operations/campaign-mutations';
import { campaignCreateInputSchema, campaignUpdateInputSchema, canonicalCampaignSchema } from '@/operations/campaign-schemas';
import { compositeCampaignCreateInputSchema, compositeCampaignCreationResultSchema } from '@/operations/composite-campaign-schemas';
import type { OperationContext } from '@/operations/operation-context';
import { listAdvertiserAccountsInputSchema, listAdvertiserAccountsOutputSchema } from '@/operations/operation-schema';
import { search } from '@/operations/search';
import { searchInputSchema, searchOutputSchema } from '@/operations/search-planner';
import { createKeywordTarget, createNegativeKeyword, createNegativeProductTarget, createProductTarget, updateTarget } from '@/operations/target-mutations';
import {
    canonicalTargetSchema,
    keywordTargetCreateInputSchema,
    negativeKeywordCreateInputSchema,
    negativeProductTargetCreateInputSchema,
    productTargetCreateInputSchema,
    targetUpdateInputSchema,
} from '@/operations/target-schemas';
import packageJson from '../../package.json';

export const MCP_TOOL_NAMES = [
    'list_advertiser_accounts',
    'search',
    'create_sponsored_products_campaign',
    'create_campaign',
    'create_ad_group',
    'create_ad',
    'create_keyword_target',
    'create_product_target',
    'create_negative_keyword',
    'create_negative_product_target',
    'update_campaign',
    'update_ad_group',
    'update_ad',
    'update_target',
] as const;

export const MCP_SERVER_INFO = {
    name: 'bidbeacon',
    title: 'BidBeacon',
    version: packageJson.version,
} as const;

export const MCP_SERVER_INSTRUCTIONS = [
    'Discover the BidBeacon Advertiser Account UUID with list_advertiser_accounts before any scoped call.',
    'Pass accountId explicitly on every scoped call; never rely on selected-account state.',
    'Search returns current settings and the last seven account-local performance days by default; request fields and dates explicitly for another shape.',
    'Inspect current settings and relevant performance before consequential updates; prefer composite campaign creation for ordinary launches and primitives only for bespoke or recovery work.',
    'Treat coverage issues as archive uncertainty, not zero performance.',
].join('\n');

export type McpOperationDefinition = {
    name: (typeof MCP_TOOL_NAMES)[number];
    title: string;
    description: string;
    inputSchema: z.ZodTypeAny;
    outputSchema: z.ZodTypeAny;
    annotations: ToolAnnotations;
    execute: (context: OperationContext, input: unknown) => Promise<unknown>;
};

const readOnlyAnnotations: ToolAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};

const creationAnnotations: ToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
};

const updateAnnotations: ToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
};

export const MCP_OPERATION_DEFINITIONS: readonly McpOperationDefinition[] = [
    {
        name: 'list_advertiser_accounts',
        title: 'List Advertiser Accounts',
        description: 'Discover the BidBeacon Advertiser Account UUIDs available to the authenticated user. Returns accessible accounts; failures return a stable BidBeacon tool error.',
        inputSchema: listAdvertiserAccountsInputSchema,
        outputSchema: listAdvertiserAccountsOutputSchema,
        annotations: readOnlyAnnotations,
        execute: listAdvertiserAccounts,
    },
    {
        name: 'search',
        title: 'Search BidBeacon',
        description:
            'Preferred read tool for campaign, ad group, ad, target, performance, and change-history data. Requires an explicit BidBeacon Advertiser Account UUID. Returns rows with query and coverage context; failures return a stable BidBeacon tool error.',
        inputSchema: searchInputSchema,
        outputSchema: searchOutputSchema,
        annotations: readOnlyAnnotations,
        execute: search,
    },
    {
        name: 'create_sponsored_products_campaign',
        title: 'Create Sponsored Products Campaign',
        description:
            'The preferred ordinary-launch tool: create a Sponsored Products campaign topology for an explicit BidBeacon Advertiser Account UUID. Performs Amazon Ads writes and returns the created topology; failures return a stable BidBeacon tool error, including partial-failure details.',
        inputSchema: compositeCampaignCreateInputSchema,
        outputSchema: compositeCampaignCreationResultSchema,
        annotations: creationAnnotations,
        execute: createSponsoredProductsCampaign,
    },
    {
        name: 'create_campaign',
        title: 'Create Campaign',
        description:
            'Create a campaign without children for bespoke topology or recovery in an explicit BidBeacon Advertiser Account UUID. Performs an additive Amazon Ads write and returns the canonical Campaign; failures return a stable BidBeacon tool error.',
        inputSchema: campaignCreateInputSchema,
        outputSchema: canonicalCampaignSchema,
        annotations: creationAnnotations,
        execute: createCampaign,
    },
    {
        name: 'create_ad_group',
        title: 'Create Ad Group',
        description:
            'Create an ad group for bespoke topology or recovery in an explicit BidBeacon Advertiser Account UUID. Performs an additive Amazon Ads write and returns the canonical Ad group; failures return a stable BidBeacon tool error.',
        inputSchema: adGroupCreateInputSchema,
        outputSchema: canonicalAdGroupSchema,
        annotations: creationAnnotations,
        execute: createAdGroup,
    },
    {
        name: 'create_ad',
        title: 'Create Ad',
        description:
            'Create a product ad for bespoke topology or recovery in an explicit BidBeacon Advertiser Account UUID. Performs an additive Amazon Ads write and returns the canonical Ad; failures return a stable BidBeacon tool error.',
        inputSchema: adCreateInputSchema,
        outputSchema: canonicalAdSchema,
        annotations: creationAnnotations,
        execute: createAd,
    },
    {
        name: 'create_keyword_target',
        title: 'Create Keyword Target',
        description:
            'Create a keyword target for bespoke topology or recovery in an explicit BidBeacon Advertiser Account UUID. Performs an additive Amazon Ads write and returns the canonical Target; failures return a stable BidBeacon tool error.',
        inputSchema: keywordTargetCreateInputSchema,
        outputSchema: canonicalTargetSchema,
        annotations: creationAnnotations,
        execute: createKeywordTarget,
    },
    {
        name: 'create_product_target',
        title: 'Create Product Target',
        description:
            'Create a product target for bespoke topology or recovery in an explicit BidBeacon Advertiser Account UUID. Performs an additive Amazon Ads write and returns the canonical Target; failures return a stable BidBeacon tool error.',
        inputSchema: productTargetCreateInputSchema,
        outputSchema: canonicalTargetSchema,
        annotations: creationAnnotations,
        execute: createProductTarget,
    },
    {
        name: 'create_negative_keyword',
        title: 'Create Negative Keyword',
        description:
            'Create a negative keyword target for bespoke topology or recovery in an explicit BidBeacon Advertiser Account UUID. Performs an additive Amazon Ads write and returns the canonical Target; failures return a stable BidBeacon tool error.',
        inputSchema: negativeKeywordCreateInputSchema,
        outputSchema: canonicalTargetSchema,
        annotations: creationAnnotations,
        execute: createNegativeKeyword,
    },
    {
        name: 'create_negative_product_target',
        title: 'Create Negative Product Target',
        description:
            'Create a negative product target for bespoke topology or recovery in an explicit BidBeacon Advertiser Account UUID. Performs an additive Amazon Ads write and returns the canonical Target; failures return a stable BidBeacon tool error.',
        inputSchema: negativeProductTargetCreateInputSchema,
        outputSchema: canonicalTargetSchema,
        annotations: creationAnnotations,
        execute: createNegativeProductTarget,
    },
    {
        name: 'update_campaign',
        title: 'Update Campaign',
        description:
            'After inspecting current settings and performance, apply an absolute Campaign control change in an explicit BidBeacon Advertiser Account UUID. Performs an Amazon Ads write that can change spend or delivery and returns the canonical Campaign; failures return a stable BidBeacon tool error.',
        inputSchema: campaignUpdateInputSchema,
        outputSchema: canonicalCampaignSchema,
        annotations: updateAnnotations,
        execute: updateCampaign,
    },
    {
        name: 'update_ad_group',
        title: 'Update Ad Group',
        description:
            'After inspecting current settings and performance, apply an absolute Ad-group control change in an explicit BidBeacon Advertiser Account UUID. Performs an Amazon Ads write that can change spend or delivery and returns the canonical Ad group; failures return a stable BidBeacon tool error.',
        inputSchema: adGroupUpdateInputSchema,
        outputSchema: canonicalAdGroupSchema,
        annotations: updateAnnotations,
        execute: updateAdGroup,
    },
    {
        name: 'update_ad',
        title: 'Update Ad',
        description:
            'After inspecting current settings, apply an absolute Ad control change in an explicit BidBeacon Advertiser Account UUID. Performs an Amazon Ads write that can change delivery and returns the canonical Ad; failures return a stable BidBeacon tool error.',
        inputSchema: adUpdateInputSchema,
        outputSchema: canonicalAdSchema,
        annotations: updateAnnotations,
        execute: updateAd,
    },
    {
        name: 'update_target',
        title: 'Update Target',
        description:
            'After inspecting current settings and performance, apply an absolute Target control change in an explicit BidBeacon Advertiser Account UUID. Performs an Amazon Ads write that can change bids or delivery and returns the canonical Target; failures return a stable BidBeacon tool error.',
        inputSchema: targetUpdateInputSchema,
        outputSchema: canonicalTargetSchema,
        annotations: updateAnnotations,
        execute: updateTarget,
    },
];

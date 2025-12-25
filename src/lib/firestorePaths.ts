// Legacy community paths (to be removed after full migration).
export const communityDocPath = (communityId: string) => `community/${communityId}`;
export const communityHomePagePath = (communityId: string) => `community/${communityId}/content/site/pages/home`;
export const communityPagePath = (communityId: string, pageId: string) =>
  `community/${communityId}/content/site/pages/${pageId}`;

// Organization paths (canonical).
export const orgDocPath = (orgSlug: string) => `organizations/${orgSlug}`;
export const orgPinsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/pins`;
export const orgMembersCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/members`;
export const orgDonationsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/donations`;
export const orgDonationsStatsDocPath = (orgSlug: string) => `${orgDonationsCollectionPath(orgSlug)}/stats`;
export const orgDonationsWebhookEventsCollectionPath = (orgSlug: string) =>
  `${orgDonationsCollectionPath(orgSlug)}/webhookEvents/events`;
export const orgAuditLogsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/auditLogs`;
export const orgTimelineCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/timeline`;
export const orgDocgenTemplatesCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/docgen/templates`;
export const orgDocgenGenerationsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/docgen/generations`;
export const orgHomeBlocksDocPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/home/blocks`;

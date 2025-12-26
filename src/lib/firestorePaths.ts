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
export const orgDocgenCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/docgen`;
export const orgDocgenTemplatesCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/docgen/templates`;
export const orgDocgenGenerationsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/docgen/generations`;
export const orgHomeBlocksDocPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/home/blocks`;
export const orgAdminsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/admins`;
export const orgAdminDocPath = (orgSlug: string, adminId: string) => `${orgAdminsCollectionPath(orgSlug)}/${adminId}`;

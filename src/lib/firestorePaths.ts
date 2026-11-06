// Organization paths (canonical).
export const orgDocPath = (orgSlug: string) => `organizations/${orgSlug}`;
export const orgMembersCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/members`;
export const orgBroadcastsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/broadcasts`;
export const orgDonationsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/donations`;
export const orgDonationsStatsDocPath = (orgSlug: string) => `${orgDonationsCollectionPath(orgSlug)}/stats`;
export const orgDonationsWebhookEventsCollectionPath = (orgSlug: string) =>
  `${orgDonationsCollectionPath(orgSlug)}/webhookEvents/events`;
export const orgAuditLogsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/auditLogs`;
export const orgMinutesCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/minutes`;
// Document templates, read only by the server (app/api/organizations/[orgSlug]/docgen/templates).
export const orgDocgenCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/docgen`;
export const orgAdminsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/admins`;
export const orgAdminDocPath = (orgSlug: string, adminId: string) => `${orgAdminsCollectionPath(orgSlug)}/${adminId}`;
export const orgDocumentsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/documents`;
// Phase 11 (plan §15): officer positions and their terms, member groups.
export const orgPositionsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/positions`;
export const orgPositionTermsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/positionTerms`;
export const orgGroupsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/groups`;
export const orgEventTasksCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/eventTasks`;
export const orgEventTaskTemplatesCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/eventTaskTemplates`;
export const orgEventTaskRemindersCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/eventTaskReminders`;
export const orgTaskDigestCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/taskDigest`;
// Phase 14 (plan §18): one server-only record per device that switched push notifications on.
export const orgPushSubscriptionsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/pushSubscriptions`;
// Phase 15 (plan §20): "do not email" records kept when a member who opted out is deleted. Server-only.
export const orgEmailSuppressionsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/emailSuppressions`;
// Phase 16 (plan §21): the site-wide push switch. Admin-read, server-written.
export const orgPushSettingsCollectionPath = (orgSlug: string) => `${orgDocPath(orgSlug)}/pushSettings`;

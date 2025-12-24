export const communityDocPath = (communityId: string) => `community/${communityId}`;

export const communityHomePagePath = (communityId: string) => `community/${communityId}/content/site/pages/home`;

export const communityPagePath = (communityId: string, pageId: string) =>
  `community/${communityId}/content/site/pages/${pageId}`;

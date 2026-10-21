import { DocTemplate, DocTemplateMeta } from "../types";
import { bhajanProgram } from "./bhajanProgram";
import { boardMeetingInvitation } from "./boardMeetingInvitation";
import { deathCertificate } from "./deathCertificate";
import { eventHostInvitation } from "./eventHostInvitation";
import { meetingMemberInvitation } from "./meetingMemberInvitation";
import { weddingCertificate } from "./weddingCertificate";

export const TEMPLATES: DocTemplate[] = [
  meetingMemberInvitation,
  boardMeetingInvitation,
  eventHostInvitation,
  bhajanProgram,
  weddingCertificate,
  deathCertificate
];

export const TEMPLATES_BY_ID = TEMPLATES.reduce<Record<string, DocTemplate>>((acc, template) => {
  acc[template.id] = template;
  return acc;
}, {});

export const TEMPLATE_META: DocTemplateMeta[] = TEMPLATES.map(({ renderHtml: _renderHtml, ...meta }) => meta);

export function getTemplateById(templateId: string) {
  return TEMPLATES_BY_ID[templateId];
}

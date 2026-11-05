import { z } from "zod";
import { TASK_NOTES_MAX, TASK_TITLE_MAX } from "./eventTasks";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** One task in a template, as the template routes accept it. */
export const templateItemSchema = z.object({
  title: z.string().max(TASK_TITLE_MAX * 2),
  notes: z.string().max(TASK_NOTES_MAX * 2).optional().default(""),
  groupId: z.string().regex(ID).nullable().optional().default(null),
  dueOffsetDays: z.number().int().min(-365).max(365).nullable().optional().default(null)
});

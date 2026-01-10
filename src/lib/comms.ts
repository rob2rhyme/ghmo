import { Timestamp } from "firebase/firestore";

export type CommsActorSnapshot = {
  uid: string;
  name?: string;
  roles?: string[];
};

export type CommsThreadStatus = "open" | "closing" | "closed";
export type CommsThreadPriority = "low" | "normal" | "high";
export type CommsConclusionVoteValue = "approve" | "reject";

export type CommsConclusion = {
  text: string;
  proposedAt?: Timestamp;
  proposedBy?: CommsActorSnapshot;
};

export type CommsThread = {
  id: string;
  title: string;
  body: string;
  createdAt?: Timestamp;
  createdBy?: CommsActorSnapshot;
  status?: CommsThreadStatus;
  conclusion?: CommsConclusion;
  approvedCount?: number;
  rejectedCount?: number;
  proposedAt?: Timestamp;
  proposedBy?: CommsActorSnapshot;
  finalizedAt?: Timestamp;
  finalizedBy?: CommsActorSnapshot;
  lastActivityAt?: Timestamp;
  commentCount?: number;
  pinned?: boolean;
  priority?: CommsThreadPriority;
};

export type CommsComment = {
  id: string;
  body: string;
  createdAt?: Timestamp;
  createdBy?: CommsActorSnapshot;
  parentId?: string;
  likeCount?: number;
};

export type CommsConclusionVote = {
  id: string;
  value: CommsConclusionVoteValue;
};

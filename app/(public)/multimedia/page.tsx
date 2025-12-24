import { Metadata } from "next";
import { COMMUNITY_NAME } from "@/src/lib/community";
import MultimediaHomeContent from "@/src/components/Multimedia/MultimediaHomeContent";

export const metadata: Metadata = {
  title: `${COMMUNITY_NAME} | Multimedia`,
  description: "Videos and social media highlights from Facebook, YouTube, TikTok, and Instagram."
};

export default function MultimediaPage() {
  return <MultimediaHomeContent />;
}

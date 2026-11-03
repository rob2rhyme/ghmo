import { Metadata } from "next";
import { COMMUNITY_NAME } from "@/src/lib/community";
import MultimediaHomeContent from "@/src/components/Multimedia/MultimediaHomeContent";

export const metadata: Metadata = {
  title: `${COMMUNITY_NAME} | Media`,
  description: "Videos, photos and news from the Greater Harrisburg Magar Organization on YouTube, Facebook, Instagram and TikTok."
};

export default function MultimediaPage() {
  return <MultimediaHomeContent />;
}

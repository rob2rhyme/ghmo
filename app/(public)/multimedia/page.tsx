import { Metadata } from "next";
import MultimediaHomeContent from "@/src/components/Multimedia/MultimediaHomeContent";

export const metadata: Metadata = {
  title: "Media · GHMO",
  description: "Videos, photos and news from the Greater Harrisburg Magar Organization on YouTube, Facebook, Instagram and TikTok."
};

export default function MultimediaPage() {
  return <MultimediaHomeContent />;
}

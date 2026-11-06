import { Metadata } from "next";
import MultimediaHomeContent from "@/src/components/Multimedia/MultimediaHomeContent";
import { pageMetadata } from "@/src/lib/siteMetadata";

export const metadata: Metadata = pageMetadata("Media · GHMO", "Videos, photos and news from the Greater Harrisburg Magar Organization on YouTube, Facebook, Instagram and TikTok.", "/multimedia");

export default function MultimediaPage() {
  return <MultimediaHomeContent />;
}

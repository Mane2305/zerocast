import type { Metadata } from "next";
import { UploadFlow } from "@/components/upload/upload-flow";
export const metadata: Metadata = { title: "Upload data | ZeroCast" };
export default function UploadPage() {
  return <UploadFlow />;
}

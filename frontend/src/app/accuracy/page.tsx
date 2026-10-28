import { redirect } from "next/navigation";
export const metadata = { title: "Accuracy · ZeroCast" };
export default function Accuracy() {
  redirect("/accuracy/demo/retail");
}

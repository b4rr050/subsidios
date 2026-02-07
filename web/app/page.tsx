import { redirect } from "next/navigation";
import { resolveHomePath } from "@/lib/auth";

export default async function Home() {
  const path = await resolveHomePath();
  redirect(path);
}

import { redirect } from "next/navigation";

export default async function BackofficeHomePage() {
  redirect("/backoffice/applications");
}

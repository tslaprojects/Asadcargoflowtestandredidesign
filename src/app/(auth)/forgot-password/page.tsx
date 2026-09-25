import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/password-forms";

export const metadata: Metadata = { title: "Восстановление пароля" };

export default function Page() {
  return <ForgotPasswordForm />;
}

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Forgot password · Ambeon Console",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}

import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reset password · Ambeon Console",
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground text-center text-sm">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

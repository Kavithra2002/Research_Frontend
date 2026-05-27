import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in · Ambeon Console",
};

export default function LoginPage() {
  return <LoginForm />;
}

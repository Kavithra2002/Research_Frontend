import { SignupForm } from "@/components/auth/signup-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign up · Ambeon Console",
};

export default function SignupPage() {
  return <SignupForm />;
}

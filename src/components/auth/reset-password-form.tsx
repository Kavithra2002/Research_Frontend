"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { resetPassword } from "@/lib/auth";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState({ password: false, confirm: false });

  const passwordInvalid =
    touched.password && password.length < MIN_PASSWORD_LENGTH;
  const confirmInvalid =
    touched.confirm &&
    (confirmPassword.length === 0 || confirmPassword !== password);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ password: true, confirm: true });
    setError(null);

    if (!token) {
      setError("This reset link is invalid. Request a new one.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) return;
    if (confirmPassword !== password) return;

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      router.replace("/login?reset=success");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 0) {
          setError(
            "Cannot reach the backend at " +
              (process.env.NEXT_PUBLIC_API_BASE_URL ||
                "http://localhost:4000/api") +
              ". Is it running?",
          );
        } else if (err.status === 400) {
          setError(
            err.message ||
              "This reset link is invalid or has expired. Request a new one.",
          );
        } else {
          setError(err.message);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card className="border-border/50 shadow-lg">
          <CardHeader className="space-y-1 pb-4 text-center">
            <CardTitle className="text-xl font-semibold">
              Invalid reset link
            </CardTitle>
            <CardDescription>
              This link is missing a token. Request a new password reset
              email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/forgot-password" className="block">
              <Button type="button" className="h-10 w-full">
                Request new link
              </Button>
            </Link>
            <p className="text-muted-foreground text-center text-sm">
              <Link href="/login" className="underline underline-offset-4">
                Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="space-y-1 pb-4 text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-2 flex size-12 items-center justify-center rounded-xl">
            <KeyRound className="size-6" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Choose a new password
          </CardTitle>
          <CardDescription>
            Your reset link expires 15 minutes after it was sent
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {error ? (
              <Alert variant="destructive" className="py-3">
                <AlertCircle className="size-4" />
                <AlertTitle>Reset failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() =>
                    setTouched((t) => ({ ...t, password: true }))
                  }
                  disabled={submitting}
                  className="h-10 pr-9"
                  aria-invalid={passwordInvalid || undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  disabled={submitting}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-2 flex items-center"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {passwordInvalid ? (
                <p className="text-destructive text-xs">
                  Password must be at least {MIN_PASSWORD_LENGTH} characters.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() =>
                    setTouched((t) => ({ ...t, confirm: true }))
                  }
                  disabled={submitting}
                  className="h-10 pr-9"
                  aria-invalid={confirmInvalid || undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                  disabled={submitting}
                  aria-label={
                    showConfirm ? "Hide password" : "Show password"
                  }
                  className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-2 flex items-center"
                >
                  {showConfirm ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {confirmInvalid ? (
                <p className="text-destructive text-xs">
                  Passwords do not match.
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              size="lg"
              className="h-10 w-full"
              disabled={submitting}
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Updating password...
                </span>
              ) : (
                "Update password"
              )}
            </Button>
          </form>

          <p className="text-muted-foreground mt-4 text-center text-sm">
            Link expired?{" "}
            <Link
              href="/forgot-password"
              className="underline underline-offset-4"
            >
              Request a new one
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

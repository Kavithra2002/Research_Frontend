"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  LogIn,
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
import { defaultRouteForRole, login } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth-provider";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get("redirect");
  const { status, user, refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(
    searchParams.get("reset") === "success"
      ? "Your password was updated. Sign in with your new password."
      : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const emailInvalid = emailTouched && !EMAIL_REGEX.test(email.trim());
  const passwordInvalid = passwordTouched && password.length === 0;

  useEffect(() => {
    if (status === "authenticated" && user) {
      const target = requestedRedirect || defaultRouteForRole(user.role);
      router.replace(target);
    }
  }, [status, user, requestedRedirect, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailTouched(true);
    setPasswordTouched(true);
    setError(null);
    setInfo(null);

    if (!EMAIL_REGEX.test(email.trim()) || password.length === 0) return;

    setSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      await refresh();
      const target =
        requestedRedirect || defaultRouteForRole(result.user.role);
      router.replace(target);
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
        } else if (err.status === 400 || err.status === 401) {
          setError("Invalid email or password.");
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

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="space-y-1 pb-4 text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-2 flex size-12 items-center justify-center rounded-xl">
            <LayoutDashboard className="size-6" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Ambeon Console
          </CardTitle>
          <CardDescription>
            Sign in to access the research console
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {error ? (
              <Alert variant="destructive" className="py-3">
                <AlertCircle className="size-4" />
                <AlertTitle>Sign in failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {info ? (
              <Alert className="py-3">
                <AlertCircle className="size-4" />
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                disabled={submitting}
                className="h-10"
                aria-invalid={emailInvalid || undefined}
                aria-describedby={emailInvalid ? "email-error" : undefined}
              />
              {emailInvalid ? (
                <p id="email-error" className="text-destructive text-xs">
                  Enter a valid email address.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm underline-offset-4 hover:underline"
                >
                  Forgot your password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setPasswordTouched(true)}
                  disabled={submitting}
                  className="h-10 pr-9"
                  aria-invalid={passwordInvalid || undefined}
                  aria-describedby={
                    passwordInvalid ? "password-error" : undefined
                  }
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
                <p id="password-error" className="text-destructive text-xs">
                  Password is required.
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
                  Signing in...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <LogIn className="size-4" />
                  Sign in
                </span>
              )}
            </Button>
          </form>

          <p className="text-muted-foreground mt-4 text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

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
  UserPlus,
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
import { defaultRouteForRole, signup } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth-provider";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get("redirect");
  const { status, user, refresh } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [touched, setTouched] = useState({
    firstName: false,
    lastName: false,
    email: false,
    password: false,
    confirm: false,
  });

  const firstNameInvalid = touched.firstName && firstName.trim().length === 0;
  const lastNameInvalid = touched.lastName && lastName.trim().length === 0;
  const emailInvalid = touched.email && !EMAIL_REGEX.test(email.trim());
  const passwordInvalid =
    touched.password && password.length < MIN_PASSWORD_LENGTH;
  const confirmInvalid =
    touched.confirm &&
    (confirmPassword.length === 0 || confirmPassword !== password);

  useEffect(() => {
    if (status === "authenticated" && user) {
      const target = requestedRedirect || defaultRouteForRole(user.role);
      router.replace(target);
    }
  }, [status, user, requestedRedirect, router]);

  function markAllTouched() {
    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      password: true,
      confirm: true,
    });
  }

  function validate(): boolean {
    if (firstName.trim().length === 0) return false;
    if (lastName.trim().length === 0) return false;
    if (!EMAIL_REGEX.test(email.trim())) return false;
    if (password.length < MIN_PASSWORD_LENGTH) return false;
    if (confirmPassword !== password) return false;
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    markAllTouched();

    if (!validate()) return;

    setSubmitting(true);
    try {
      const result = await signup({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        password,
      });
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
        } else if (err.status === 409) {
          setError("An account with this email already exists.");
        } else if (err.status === 400) {
          setError(err.message || "Please check the highlighted fields.");
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
            Create your account
          </CardTitle>
          <CardDescription>
            Enter your details below to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {error ? (
              <Alert variant="destructive" className="py-3">
                <AlertCircle className="size-4" />
                <AlertTitle>Sign-up failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="first_name">First name</Label>
                <Input
                  id="first_name"
                  name="first_name"
                  type="text"
                  autoComplete="given-name"
                  placeholder="John"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={() =>
                    setTouched((t) => ({ ...t, firstName: true }))
                  }
                  disabled={submitting}
                  className="h-10"
                  aria-invalid={firstNameInvalid || undefined}
                />
                {firstNameInvalid ? (
                  <p className="text-destructive text-xs">
                    First name is required.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last name</Label>
                <Input
                  id="last_name"
                  name="last_name"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Doe"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={() =>
                    setTouched((t) => ({ ...t, lastName: true }))
                  }
                  disabled={submitting}
                  className="h-10"
                  aria-invalid={lastNameInvalid || undefined}
                />
                {lastNameInvalid ? (
                  <p className="text-destructive text-xs">
                    Last name is required.
                  </p>
                ) : null}
              </div>
            </div>

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
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                disabled={submitting}
                className="h-10"
                aria-invalid={emailInvalid || undefined}
              />
              {emailInvalid ? (
                <p className="text-destructive text-xs">
                  Enter a valid email address.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
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
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-2 flex items-center"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Confirm password</Label>
                  <div className="relative">
                    <Input
                      id="confirm_password"
                      name="confirm_password"
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
                        showConfirm
                          ? "Hide confirm password"
                          : "Show confirm password"
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
                </div>
              </div>
              {passwordInvalid ? (
                <p className="text-destructive text-xs">
                  Password must be at least {MIN_PASSWORD_LENGTH} characters
                  long.
                </p>
              ) : confirmInvalid ? (
                <p className="text-destructive text-xs">
                  Passwords do not match.
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Must be at least {MIN_PASSWORD_LENGTH} characters long.
                </p>
              )}
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
                  Creating account...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <UserPlus className="size-4" />
                  Create account
                </span>
              )}
            </Button>
          </form>

          <p className="text-muted-foreground mt-4 text-center text-sm">
            Already have an account?{" "}
            <Link href="/login" className="underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

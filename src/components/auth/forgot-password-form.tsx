"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, KeyRound, Loader2, Mail } from "lucide-react";

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
import { requestPasswordReset } from "@/lib/auth";
import { cn } from "@/lib/utils";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const emailInvalid = emailTouched && !EMAIL_REGEX.test(email.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailTouched(true);
    setError(null);
    setSuccess(null);

    if (!EMAIL_REGEX.test(email.trim())) return;

    setSubmitting(true);
    try {
      const result = await requestPasswordReset(email.trim());
      setSuccess(result.message);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 0) {
          setError(
            "Cannot reach the backend at " +
              (process.env.NEXT_PUBLIC_API_BASE_URL ||
                "http://localhost:4000/api") +
              ". Is it running?",
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

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="space-y-1 pb-4 text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-2 flex size-12 items-center justify-center rounded-xl">
            <KeyRound className="size-6" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Reset your password
          </CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send a reset link valid for 15
            minutes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {error ? (
              <Alert variant="destructive" className="py-3">
                <AlertCircle className="size-4" />
                <AlertTitle>Request failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {success ? (
              <Alert className="py-3">
                <Mail className="size-4" />
                <AlertDescription>{success}</AlertDescription>
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
                disabled={submitting || !!success}
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

            <Button
              type="submit"
              size="lg"
              className="h-10 w-full"
              disabled={submitting || !!success}
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Sending link...
                </span>
              ) : (
                "Send reset link"
              )}
            </Button>
          </form>

          <p className="text-muted-foreground mt-4 text-center text-sm">
            Remember your password?{" "}
            <Link href="/login" className="underline underline-offset-4">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

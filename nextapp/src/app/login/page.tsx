import type { Metadata } from "next";
import { LoginView } from "@/components/login-view";

export const metadata: Metadata = {
  title: "Sign in — Rebesta Fresh",
  description: "Sign in with your mobile number — a code by SMS. New here? Your account is created automatically.",
};

export default function LoginPage() {
  return <LoginView />;
}

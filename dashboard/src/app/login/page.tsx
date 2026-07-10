import { SignInForm } from "@/components/SignInForm";
import Link from "next/link";

export default function LoginPage() {
  return (
    <>
      <SignInForm
        title="Merchant Login"
        description="Sign in with any wallet. Analytics and catalog data are scoped to the demo merchant."
        expectedRole="merchant"
      />
      <p className="text-center text-sm text-muted-foreground pb-8">
        Compliance officer?{" "}
        <Link href="/compliance/login" className="underline">
          Sign in here
        </Link>
      </p>
    </>
  );
}

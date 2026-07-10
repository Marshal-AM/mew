import { SignInForm } from "@/components/SignInForm";

export default function ComplianceLoginPage() {
  return (
    <SignInForm
      title="Compliance Login"
      description="Sign in with a compliance-officer wallet (COMPLIANCE_OFFICER_WALLETS env)."
      expectedRole="compliance_officer"
    />
  );
}

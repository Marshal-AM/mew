import { SignInForm, ComplianceLoginFooter } from "@/components/SignInForm";

export default function ComplianceLoginPage() {
  return (
    <SignInForm
      title="Compliance Login"
      description="Sign in with an authorized compliance officer wallet to manage reviews, freezes, and fraud rules."
      expectedRole="compliance_officer"
      footer={<ComplianceLoginFooter />}
    />
  );
}

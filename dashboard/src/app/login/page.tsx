import { SignInForm, MerchantLoginFooter } from "@/components/SignInForm";

export default function LoginPage() {
  return (
    <SignInForm
      title="Merchant Login"
      description="Sign in with your wallet to manage POS products, devices, and view transaction analytics."
      footer={<MerchantLoginFooter />}
    />
  );
}

import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center py-10">
      <Suspense>
        <SignIn />
      </Suspense>
    </main>
  );
}

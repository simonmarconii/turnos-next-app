import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center py-10">
      <Suspense>
        <SignUp />
      </Suspense>
    </main>
  );
}

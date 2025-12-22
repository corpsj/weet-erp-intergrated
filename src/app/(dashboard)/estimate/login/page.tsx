"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EstimateLoginAliasPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login?next=%2Festimate%2Fmaterials");
  }, [router]);

  return null;
}


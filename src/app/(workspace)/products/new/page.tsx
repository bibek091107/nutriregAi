"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/controls";
import { ProductForm } from "@/components/products/ProductForm";
import { useWorkspace } from "@/components/shell/AppShell";

/** Dedicated product creation route, reusing the approved creation form. */
export default function NewProductPage() {
  const router = useRouter();
  const { reloadProducts } = useWorkspace();

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-space-lg">
      <div>
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-space-xs text-on-surface-variant font-label-md text-label-md mb-1"
        >
          <Link href="/products" className="hover:text-secondary transition-colors">
            Products
          </Link>
          <Icon className="text-[14px]">chevron_right</Icon>
          <span className="text-on-surface font-semibold">New Product</span>
        </nav>
        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">
          Create New Product
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1.5">
          Set up a baseline formulation dossier to initiate compliance scanning. Ingredients, claims,
          and documents are added to the dossier from the product workflow.
        </p>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded shadow-sm p-space-lg">
        <ProductForm
          onCancel={() => router.back()}
          onCreated={() => reloadProducts()}
          submitLabel="Create Product"
        />
      </div>

      <div className="flex items-center justify-between">
        <Link href="/products">
          <Button variant="ghost" icon="arrow_back">
            Back to products
          </Button>
        </Link>
        <span className="font-data-mono text-[11px] text-on-surface-variant flex items-center gap-1">
          <Icon className="text-[13px] text-emerald-600">verified_user</Icon>
          <span>Records are stored by the NutriReg API</span>
        </span>
      </div>
    </div>
  );
}

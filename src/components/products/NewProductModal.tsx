"use client";

import { Modal } from "@/components/ui/Modal";
import { useWorkspace } from "@/components/shell/AppShell";
import { ProductForm } from "./ProductForm";

/**
 * Create Product dialog from the approved Products design. The form itself is
 * shared with the /products/new route.
 */
export function NewProductModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const { reloadProducts } = useWorkspace();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create New Product"
      description="Set up a baseline formulation dossier to initiate compliance scanning."
      labelledBy="new-product-title"
    >
      <div className="p-space-lg">
        <ProductForm
          onCancel={onClose}
          onCreated={() => {
            onCreated?.();
            reloadProducts();
          }}
        />
      </div>
    </Modal>
  );
}

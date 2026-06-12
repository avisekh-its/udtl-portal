"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createOrgAction, updateOrgAction } from "@/app/ops/customers/actions";
import { FormSection, FieldShell, controlClass } from "@/components/form/form-section";
import { StickyActionBar, CancelLink, PrimaryButton } from "@/components/form/sticky-action-bar";

export interface OrgFormValues {
  name?: string;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export function OrgForm({
  mode,
  orgId,
  initial = {},
}: {
  mode: "create" | "edit";
  orgId?: string;
  initial?: OrgFormValues;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setOk(null);
    setNameError(null);
    if (!String(formData.get("name") ?? "").trim()) {
      setNameError("Company name is required.");
      return;
    }
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createOrgAction(formData)
          : await updateOrgAction(orgId!, formData);
      if (result.error) {
        setError(result.error);
      } else if (mode === "create" && result.id) {
        router.push(`/ops/customers/${result.id}`);
      } else {
        setOk("Changes saved.");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 px-3 py-2 text-sm text-[var(--color-success)]">
          {ok}
        </div>
      )}

      <FormSection title="Company" description="The customer company UDTL ships for.">
        <FieldShell label="Company name" htmlFor="name" required error={nameError ?? undefined} full>
          <input id="name" name="name" defaultValue={initial.name ?? ""} className={controlClass} />
        </FieldShell>
      </FormSection>

      <FormSection title="Primary contact" description="Main point of contact for this account.">
        <FieldShell label="Name" htmlFor="primaryContactName">
          <input id="primaryContactName" name="primaryContactName" defaultValue={initial.primaryContactName ?? ""} className={controlClass} />
        </FieldShell>
        <FieldShell label="Email" htmlFor="primaryContactEmail">
          <input id="primaryContactEmail" name="primaryContactEmail" type="email" defaultValue={initial.primaryContactEmail ?? ""} className={controlClass} />
        </FieldShell>
        <FieldShell label="Phone" htmlFor="primaryContactPhone">
          <input id="primaryContactPhone" name="primaryContactPhone" type="tel" defaultValue={initial.primaryContactPhone ?? ""} className={controlClass} />
        </FieldShell>
      </FormSection>

      <FormSection title="Address">
        <FieldShell label="Address line 1" htmlFor="addressLine1" full>
          <input id="addressLine1" name="addressLine1" defaultValue={initial.addressLine1 ?? ""} className={controlClass} />
        </FieldShell>
        <FieldShell label="Address line 2" htmlFor="addressLine2" full>
          <input id="addressLine2" name="addressLine2" defaultValue={initial.addressLine2 ?? ""} className={controlClass} />
        </FieldShell>
        <FieldShell label="City" htmlFor="city">
          <input id="city" name="city" defaultValue={initial.city ?? ""} className={controlClass} />
        </FieldShell>
        <FieldShell label="Province / State" htmlFor="region">
          <input id="region" name="region" defaultValue={initial.region ?? ""} className={controlClass} />
        </FieldShell>
        <FieldShell label="Postal / ZIP" htmlFor="postalCode">
          <input id="postalCode" name="postalCode" defaultValue={initial.postalCode ?? ""} className={controlClass} />
        </FieldShell>
        <FieldShell label="Country" htmlFor="country" hint="Two-letter code, e.g. CA or US.">
          <input id="country" name="country" defaultValue={initial.country ?? "CA"} className={controlClass} />
        </FieldShell>
      </FormSection>

      <StickyActionBar>
        <CancelLink href="/ops/customers" />
        <PrimaryButton disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create customer" : "Save changes"}
        </PrimaryButton>
      </StickyActionBar>
    </form>
  );
}

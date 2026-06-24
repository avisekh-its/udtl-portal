"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createOrgAction,
  updateOrgAction,
  inviteOrgAdminAction,
} from "@/app/ops/customers/actions";
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
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // After a successful create we prompt to invite the primary contact.
  const [invitePrompt, setInvitePrompt] = useState<{ orgId: string; email: string } | null>(null);
  const [inviting, setInviting] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setNameError(null);
    setEmailError(null);
    const email = String(formData.get("primaryContactEmail") ?? "").trim();
    if (!String(formData.get("name") ?? "").trim()) {
      setNameError("Company name is required.");
      return;
    }
    if (mode === "create" && !email) {
      setEmailError("A primary contact email is required.");
      return;
    }
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createOrgAction(formData)
          : await updateOrgAction(orgId!, formData);
      if (result.error) {
        toast.error(result.error);
      } else if (mode === "create" && result.id) {
        toast.success("Customer created.");
        // Prompt to invite the primary contact as Customer Admin.
        setInvitePrompt({ orgId: result.id, email });
      } else {
        toast.success("Changes saved.");
        router.refresh();
      }
    });
  }

  function goToCustomer() {
    if (invitePrompt) router.push(`/ops/customers/${invitePrompt.orgId}`);
  }

  function sendInvite() {
    if (!invitePrompt) return;
    setInviting(true);
    inviteOrgAdminAction(invitePrompt.orgId, invitePrompt.email).then((res) => {
      setInviting(false);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Invite sent to ${invitePrompt.email}.`);
      goToCustomer();
    });
  }

  return (
    <>
    <form onSubmit={onSubmit} className="space-y-5">
      <FormSection title="Company" description="The customer company UDTL ships for.">
        <FieldShell label="Company name" htmlFor="name" required error={nameError ?? undefined} full>
          <input id="name" name="name" defaultValue={initial.name ?? ""} className={controlClass} />
        </FieldShell>
      </FormSection>

      <FormSection title="Primary contact" description="Main point of contact for this account.">
        <FieldShell label="Name" htmlFor="primaryContactName">
          <input id="primaryContactName" name="primaryContactName" defaultValue={initial.primaryContactName ?? ""} className={controlClass} />
        </FieldShell>
        <FieldShell
          label="Email"
          htmlFor="primaryContactEmail"
          required={mode === "create"}
          error={emailError ?? undefined}
          hint={mode === "create" ? "We'll invite this person as the Customer Admin." : undefined}
        >
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

    {invitePrompt && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-white p-6 shadow-xl">
          <h3 className="text-base font-semibold text-slate-900">Invite the customer?</h3>
          <p className="mt-2 text-sm text-slate-600">
            Send an invite to{" "}
            <span className="font-medium text-slate-800">{invitePrompt.email}</span> so they can set
            up their Customer Admin account and access the portal.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={goToCustomer}
              disabled={inviting}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={sendInvite}
              disabled={inviting}
              className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

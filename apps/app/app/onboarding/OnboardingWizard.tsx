'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, FieldError, Input, Label } from '@neptlium/ui';
import { onboardingPayloadSchema, type ProvisioningPayload } from '@neptlium/lib/validation';
import { OnboardingShell } from './components/OnboardingShell';
import { OnboardingPanel } from './components/OnboardingPanel';
import { getOnboardingDraft, saveOnboardingDraft, submitProvisioning } from './actions';
import { onboardingSteps } from './wizard-steps';
import { safeInternalPath } from '../(auth)/auth-utils';

type DraftData = Partial<ProvisioningPayload>;

function runtimeDefaults(): Pick<ProvisioningPayload, 'timezone' | 'language'> {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    language: navigator.language || 'en',
  };
}

function accountDefaults(): Pick<ProvisioningPayload, 'investorType' | 'securityChoices'> {
  return {
    investorType: 'individual',
    securityChoices: [],
  };
}

export function OnboardingWizard({
  email,
  returnTo,
}: {
  readonly email: string;
  readonly returnTo: string;
}) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<DraftData>(accountDefaults());
  const [draftState, setDraftState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [draftAttempt, setDraftAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOnboardingDraft()
      .then((draft) => {
        if (cancelled) return;
        const restoredStep = Math.min(Math.max(draft.stepIndex, 0), onboardingSteps.length - 1);
        setData({ ...accountDefaults(), ...runtimeDefaults(), ...draft.data });
        setStepIndex(restoredStep);
        setDraftState('ready');
      })
      .catch(() => {
        if (!cancelled) setDraftState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [draftAttempt]);

  function update<K extends keyof ProvisioningPayload>(key: K, value: ProvisioningPayload[K]) {
    setData((current) => ({ ...current, [key]: value }));
  }

  async function persist(nextStep: number, nextData: DraftData = data) {
    const result = await saveOnboardingDraft({ data: nextData, stepIndex: nextStep });
    if (!result.ok) throw new Error(result.error);
    setStepIndex(nextStep);
  }

  async function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!data.firstName?.trim() || !data.lastName?.trim() || !data.country?.trim()) {
      setError('Enter your first name, last name, and country.');
      return;
    }

    const normalized: DraftData = {
      ...accountDefaults(),
      ...data,
      region: data.country,
      organizationName: '',
      companyRole: '',
      website: '',
    };
    setData(normalized);
    await persist(1, normalized).catch(() =>
      setError('Your progress could not be saved. Check your connection and try again.'),
    );
  }

  async function goBack() {
    setError(null);
    try {
      await persist(0);
    } catch {
      setError('Your progress could not be saved. Check your connection and try again.');
    }
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!data.acceptedTerms) {
      setError('You must accept the Terms of Service and Privacy Policy.');
      return;
    }

    const completedData: DraftData = {
      ...accountDefaults(),
      ...runtimeDefaults(),
      ...data,
      investorType: 'individual',
      region: data.region?.trim() || data.country || '',
      organizationName: '',
      companyRole: '',
      website: '',
      securityChoices: data.securityChoices ?? [],
    };
    const parsed = onboardingPayloadSchema.safeParse(completedData);
    if (!parsed.success) {
      setError('Review the required information before finishing account setup.');
      return;
    }

    setProvisioning(true);
    try {
      const draftResult = await saveOnboardingDraft({ data: parsed.data, stepIndex: 1 });
      if (!draftResult.ok) {
        setError(draftResult.error);
        return;
      }
      const result = await submitProvisioning(parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      router.replace(safeInternalPath(returnTo));
    } catch {
      setError('Account setup could not be completed. Check your connection and try again.');
    } finally {
      setProvisioning(false);
    }
  }

  if (draftState === 'unavailable') {
    return (
      <OnboardingShell step={1} totalSteps={2}>
        <p className="text-sm text-text-muted" role="alert">
          We could not load your saved progress.
        </p>
        <Button
          type="button"
          onClick={() => {
            setDraftState('loading');
            setDraftAttempt((attempt) => attempt + 1);
          }}
        >
          Try again
        </Button>
      </OnboardingShell>
    );
  }

  if (draftState === 'loading') {
    return (
      <OnboardingShell step={1} totalSteps={2}>
        <p className="text-sm text-text-muted" role="status">
          Preparing Neptlium Capital…
        </p>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell step={stepIndex + 1} totalSteps={2}>
      <OnboardingPanel>
        <div aria-live="polite" className="sr-only">
          {error ?? (provisioning ? 'Finishing Capital setup.' : '')}
        </div>

        {stepIndex === 0 && (
          <form onSubmit={advance} className="space-y-5">
            <Heading
              title="Set up Neptlium Capital"
              copy="Enter your legal name and country of residence. Organization details are not required for your personal account."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Legal first name"
                id="first-name"
                value={data.firstName ?? ''}
                onChange={(value) => update('firstName', value)}
                autoComplete="given-name"
              />
              <TextField
                label="Legal last name"
                id="last-name"
                value={data.lastName ?? ''}
                onChange={(value) => update('lastName', value)}
                autoComplete="family-name"
              />
            </div>
            <TextField
              label="Country of residence"
              id="country"
              value={data.country ?? ''}
              onChange={(value) => update('country', value)}
              autoComplete="country-name"
              list="capital-residence-countries"
            />
            <datalist id="capital-residence-countries">
              {countryOptions.map((country) => <option key={country} value={country} />)}
            </datalist>
            <p className="text-xs text-text-muted">Signed in as {email}</p>
            <p className="text-xs leading-5 text-text-muted">
              You can review and update your account details after setup.
            </p>
            <ErrorMessage error={error} />
            <Button type="submit" variant="accent" className="w-full">
              Continue
            </Button>
          </form>
        )}

        {stepIndex === 1 && (
          <form onSubmit={finish} className="space-y-6">
            <Heading
              title="Review your Capital account"
              copy="Review your details and accept the Terms of Service and Privacy Policy to finish setup."
            />
            <dl className="divide-y divide-border-hairline border-y border-border-default">
              <ReviewRow
                label="Name"
                value={`${data.firstName ?? ''} ${data.lastName ?? ''}`.trim()}
              />
              <ReviewRow label="Residence" value={data.country ?? ''} />
              <ReviewRow label="Account context" value="Neptlium Capital · Individual" />
            </dl>
            <p className="text-sm leading-6 text-text-secondary">
              Your personal financial context remains separate from any organization you may later
              join in Neptlium Treasury.
            </p>
            <label className="flex cursor-pointer gap-3 text-sm leading-5 text-text-secondary">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-[--accent-primary]"
                checked={data.acceptedTerms ?? false}
                onChange={(event) => update('acceptedTerms', event.target.checked as true)}
              />
              <span>
                I agree to the{' '}
                <Link className="neptlium-teal underline underline-offset-2" href="/terms">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link className="neptlium-teal underline underline-offset-2" href="/privacy">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            <ErrorMessage error={error} />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" onClick={goBack} disabled={provisioning}>
                Back
              </Button>
              <Button
                type="submit"
                variant="accent"
                loading={provisioning}
                className="w-full sm:w-auto sm:min-w-48"
              >
                Enter Neptlium Capital
              </Button>
            </div>
          </form>
        )}
      </OnboardingPanel>
    </OnboardingShell>
  );
}

// ISO 3166-1 territories are suggestions, independent of product availability.
const countryCodes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countryOptions = Array.from(new Set(countryCodes.map((code) => countryNames.of(code) ?? code))).sort();

function Heading({ title, copy }: { readonly title: string; readonly copy: string }) {
  return (
    <div className="space-y-2">
      <h1 className="np-h3 text-text-primary">{title}</h1>
      <p className="text-sm leading-6 text-text-secondary">{copy}</p>
    </div>
  );
}

function TextField({
  label,
  id,
  value,
  onChange,
  autoComplete,
  list,
}: {
  readonly label: string;
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly autoComplete: string;
  readonly list?: string;
}) {
  return (
    <Field>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        list={list}
      />
    </Field>
  );
}

function ErrorMessage({ error }: { readonly error: string | null }) {
  return error ? <FieldError role="alert">{error}</FieldError> : null;
}

function ReviewRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-start justify-between gap-5 py-3 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd className="max-w-[65%] text-right text-text-primary">{value || 'Not provided'}</dd>
    </div>
  );
}
